"""Algorithm API routes (/api/v1/...)."""

from __future__ import annotations

import importlib.util
import ast
import json
import logging
import shutil
import sys
import time
import types
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..models.schemas import (
    AlgorithmCreateRequest,
    AlgorithmMetadataUpdateRequest,
    AlgorithmSourceSaveRequest,
    CategoryCreateRequest,
    CategoryUpdateRequest,
    ExecuteRequest,
    PublishAsComponentRequest,
)
from ..sdk.ast_parser import AstParser
from ..sdk.registry import AlgorithmEntry, AlgorithmRegistry, normalize_module_kind
from ..sdk.sse_manager import sse_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["algorithms"])
external_router = APIRouter(prefix="/api/external/v1", tags=["external"])

_registry: AlgorithmRegistry | None = None


def set_registry(reg: AlgorithmRegistry) -> None:
    global _registry
    _registry = reg


def get_registry() -> AlgorithmRegistry:
    if _registry is None:
        raise HTTPException(status_code=503, detail="Registry not initialized")
    return _registry


def _entry_dict(entry: AlgorithmEntry) -> dict[str, Any]:
    publish_status = _read_entry_publish_status(entry)
    display_namespace = entry.call_prefix or f"alg.{entry.namespace}.{entry.func_name}"
    category = _read_entry_category(entry)
    review_draft = _load_review_draft(entry)
    return {
        "id": entry.id,
        "callPrefix": display_namespace,
        "callSnippet": entry.call_snippet,
        "snippetBody": entry.snippet_body,
        "type": entry.type,
        "moduleKind": entry.type,
        "lifecycleStatus": publish_status,
        "publishStatus": publish_status,
        "hasReviewDraft": review_draft is not None,
        "reviewStatus": review_draft.get("status", "") if review_draft else "",
        "apiPath": f"/api/v1/invoke/{entry.call_prefix}",
        "externalApiPath": f"/api/external/v1/{entry.namespace}/{entry.func_name}",
        "displayNamespace": display_namespace,
        "zhName": entry.zh_name,
        "zhDescription": entry.zh_description,
        "zhTags": entry.zh_tags,
        "inputExample": entry.input_example,
        "enDescription": entry.en_description,
        "params": entry.params,
        "namespace": entry.namespace,
        "categoryZhName": category.get("zh_name", ""),
        "categoryNamespace": category.get("namespace", entry.namespace),
        "version": entry.version,
        "funcName": entry.func_name,
        "packageId": entry.package_id,
        "packageRoot": entry.package_root,
        "sourceFile": entry.source_file,
        "ownerId": getattr(entry, "owner_id", "system"),
        "rejectReason": review_draft.get("reject_reason", "") if review_draft else "",
    }


def _review_draft_path(entry: AlgorithmEntry) -> Path:
    """Return the review draft storage path for an algorithm entry."""

    safe_id = entry.id.replace(".", "_")
    return _entry_config_path(entry).parent / f".review_draft_{safe_id}.json"


def _load_review_draft(entry: AlgorithmEntry) -> dict[str, Any] | None:
    """Load a pending review draft, if present."""

    path = _review_draft_path(entry)
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _save_review_draft(entry: AlgorithmEntry, payload: dict[str, Any]) -> None:
    """Persist a pending review draft."""

    p = _review_draft_path(entry)
    try:
        p.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save review draft: {exc}") from exc


def _delete_review_draft(entry: AlgorithmEntry) -> None:
    """Delete a pending review draft if it exists."""

    try:
        _review_draft_path(entry).unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete review draft: {exc}") from exc


def _read_entry_category(entry: AlgorithmEntry) -> dict[str, str]:
    """Read display metadata for an entry category."""

    config_path = _entry_config_path(entry)
    if not config_path.exists():
        return {"namespace": entry.namespace, "zh_name": ""}
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"namespace": entry.namespace, "zh_name": ""}
    return {
        "namespace": str(config.get("namespace") or entry.namespace),
        "zh_name": str(config.get("zh_name") or config.get("display_name") or ""),
    }


def _entry_config_path(entry: AlgorithmEntry) -> Path:
    """Return the manifest path that owns an algorithm entry."""

    if entry.package_root:
        return Path(entry.package_root) / "algopack.json"
    return Path(entry.source_file).parent / "folder_config.json"


def _per_algo_status_path(entry: AlgorithmEntry) -> Path:
    """Per-algorithm status override file (prevents flat-file sharing pollution)."""

    safe_id = entry.id.replace(".", "_")
    return Path(entry.source_file).parent / f".publish_status_{safe_id}.json"


def _read_entry_publish_status(entry: AlgorithmEntry) -> str:
    """Read an entry publish status, preferring the per-algorithm override file."""

    # Non-package entries: check per-algorithm status file first to prevent
    # multiple algorithms sharing the same folder_config.json from polluting
    # each other's status.
    if not entry.package_root:
        status_path = _per_algo_status_path(entry)
        if status_path.exists():
            try:
                data = json.loads(status_path.read_text(encoding="utf-8"))
                return str(data.get("publish_status") or "draft")
            except (OSError, json.JSONDecodeError):
                pass
    config_path = _entry_config_path(entry)
    if not config_path.exists():
        return "published"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "published"
    return str(config.get("publish_status") or ("published" if config.get("published", True) else "draft"))


def _ensure_callable_status(entry: AlgorithmEntry) -> None:
    """Block normal registered calls for entries that are not published."""

    status = _read_entry_publish_status(entry)
    if status != "published":
        raise HTTPException(status_code=403, detail=f"Algorithm is not callable while status is {status}")


def _folder_files_for_entry(entry: AlgorithmEntry) -> list[dict[str, Any]]:
    """Return files that belong to the selected algorithm entry."""

    entry_path = Path(entry.source_file).resolve()
    if entry.package_root:
        folder = Path(entry.package_root).resolve()
        if not folder.exists():
            return []
        paths = [
            file_path
            for file_path in sorted(folder.rglob("*.py"), key=lambda item: item.as_posix())
            if file_path.name != "__init__.py" and "__pycache__" not in file_path.parts
        ]
    else:
        paths = [entry_path]

    files: list[dict[str, Any]] = []
    for file_path in paths:
        try:
            content = file_path.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Cannot read folder file %s: %s", file_path, exc)
            continue
        relative_path = file_path.name if not entry.package_root else file_path.relative_to(Path(entry.package_root)).as_posix()
        files.append(
            {
                "filename": file_path.name,
                "relative_path": relative_path,
                "content": content,
                "is_entry": file_path.resolve() == entry_path,
                "functions": AstParser.extract_functions(str(file_path)),
            }
        )
    return files


def _project_root() -> Path:
    """Return the repository root."""

    return Path(__file__).resolve().parents[2]


def _default_algorithm_root(registry: AlgorithmRegistry) -> Path:
    """Return the primary algorithm root for creating new entries."""

    if registry.watch_roots:
        return Path(registry.watch_roots[0]).resolve()
    return (_project_root() / "algorithms_root").resolve()


def _validate_identifier(value: str, field_name: str) -> str:
    """Validate a Python identifier-like path part."""

    normalized = value.strip()
    if not normalized.replace("_", "").isalnum() or not normalized[0:1].isalpha():
        raise HTTPException(status_code=400, detail=f"{field_name} must contain letters, numbers, and underscores")
    return normalized


def _normalize_category(value: str) -> str:
    """Normalize a category or alg.category namespace into registry namespace form."""

    text = value.strip().strip("/")
    if text.startswith("alg."):
        text = text[4:]
    parts = [part for part in text.replace("/", ".").split(".") if part]
    if not parts:
        raise HTTPException(status_code=400, detail="category must not be empty")
    return ".".join(_validate_identifier(part, "category") for part in parts)


def _algo_meta_decorator(
    *,
    zh_name: str,
    zh_description: str,
    zh_tags: list[str],
    version: str,
    input_example: str = "",
) -> str:
    """Return an @algo_meta decorator string."""

    lines = [
        "@algo_meta(",
        f"    zh_name={json.dumps(zh_name, ensure_ascii=False)},",
        f"    zh_description={json.dumps(zh_description, ensure_ascii=False)},",
        f"    zh_tags={json.dumps(zh_tags, ensure_ascii=False)},",
        f"    version={json.dumps(version, ensure_ascii=False)},",
    ]
    if input_example:
        lines.append(f"    input_example={json.dumps(input_example, ensure_ascii=False)},")
    lines.append(")")
    return "\n".join(lines)


def _decorator_name(node: ast.AST) -> str:
    """Return the decorator function name for simple call/name decorators."""

    target = node.func if isinstance(node, ast.Call) else node
    if isinstance(target, ast.Name):
        return target.id
    if isinstance(target, ast.Attribute):
        return target.attr
    return ""


def _module_insert_index(tree: ast.Module) -> int:
    """Return a line index after module docstring and future imports."""

    index = 0
    body = list(tree.body)
    if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
        index = int(getattr(body[0], "end_lineno", body[0].lineno))
    for node in body[1 if index else 0 :]:
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            index = int(getattr(node, "end_lineno", node.lineno))
            continue
        break
    return index


def _ensure_algo_meta_import(source: str) -> str:
    """Ensure source imports algo_meta."""

    if "algo_meta" in source and "algo_service.sdk.decorators" in source:
        return source
    tree = ast.parse(source)
    lines = source.splitlines()
    index = _module_insert_index(tree)
    lines.insert(index, "from algo_service.sdk.decorators import algo_meta")
    return "\n".join(lines).rstrip() + "\n"


def _public_function_names(source: str) -> list[str]:
    """Return public top-level function names from source."""

    tree = ast.parse(source)
    return [
        node.name
        for node in tree.body
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and not node.name.startswith("_")
    ]


def _upsert_algo_meta(source: str, func_name: str, metadata: dict[str, Any]) -> str:
    """Insert or replace @algo_meta for a function without changing its body."""

    source = _ensure_algo_meta_import(source)
    tree = ast.parse(source)
    target: ast.FunctionDef | ast.AsyncFunctionDef | None = None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            target = node
            break
    if target is None:
        raise HTTPException(status_code=400, detail=f"Function not found in source: {func_name}")

    lines = source.splitlines()
    remove_ranges: list[tuple[int, int]] = []
    keep_decorators: list[str] = []
    for decorator in target.decorator_list:
        start = decorator.lineno - 1
        end = int(getattr(decorator, "end_lineno", decorator.lineno))
        if _decorator_name(decorator) == "algo_meta":
            remove_ranges.append((start, end))
        else:
            keep_decorators.append("\n".join(lines[start:end]))

    for start, end in sorted(remove_ranges, reverse=True):
        del lines[start:end]

    adjusted_tree = ast.parse("\n".join(lines) + "\n")
    adjusted_target: ast.FunctionDef | ast.AsyncFunctionDef | None = None
    for node in adjusted_tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == func_name:
            adjusted_target = node
            break
    if adjusted_target is None:
        raise HTTPException(status_code=400, detail=f"Function not found after metadata update: {func_name}")

    insert_at = adjusted_target.lineno - 1
    decorator_text = _algo_meta_decorator(
        zh_name=str(metadata.get("zh_name") or func_name),
        zh_description=str(metadata.get("zh_description") or ""),
        zh_tags=[str(tag).strip() for tag in metadata.get("zh_tags", []) if str(tag).strip()],
        version=str(metadata.get("version") or "1.0.0"),
        input_example=str(metadata.get("input_example") or ""),
    )
    lines[insert_at:insert_at] = [decorator_text]
    return "\n".join(lines).rstrip() + "\n"


def _write_folder_config(folder: Path, namespace: str, module_kind: str, publish_status: str = "draft", zh_name: str = "") -> None:
    """Create or update a folder_config.json file."""

    config_path = folder / "folder_config.json"
    config: dict[str, Any] = {}
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            config = {}
    update: dict[str, Any] = {
        "namespace": namespace,
        "type": module_kind,
        "module_kind": module_kind,
        "published": publish_status == "published",
        "publish_status": publish_status,
    }
    if zh_name:
        update["zh_name"] = zh_name
    config.update(update)
    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


def _ensure_folder_kind_compatible(folder: Path, module_kind: str) -> None:
    """Reject mixing templates and components in one folder_config directory."""

    config_path = folder / "folder_config.json"
    if not config_path.exists():
        return
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    existing_kind = str(config.get("module_kind", config.get("type", "component")) or "component")
    if existing_kind != module_kind and any(path.suffix == ".py" for path in folder.glob("*.py")):
        raise HTTPException(
            status_code=409,
            detail=f"Folder already contains {existing_kind} entries; cannot add {module_kind}",
        )


def _category_config_paths(registry: AlgorithmRegistry) -> list[Path]:
    """Return all folder_config.json paths under watched roots (deduplicated)."""

    # Filter to top-level roots only (exclude sub-directories of other watch roots)
    all_roots = [Path(r) for r in registry.watch_roots]
    top_roots: list[Path] = []
    for r in all_roots:
        if not any(r != other and r.is_relative_to(other) for other in all_roots):
            top_roots.append(r)

    seen: set[Path] = set()
    paths: list[Path] = []
    for root_path in top_roots:
        if root_path.exists():
            for p in sorted(root_path.rglob("folder_config.json")):
                resolved = p.resolve()
                if resolved not in seen:
                    seen.add(resolved)
                    paths.append(p)
    return paths


def _category_from_config(path: Path, registry: AlgorithmRegistry) -> dict[str, Any]:
    """Return one category response item from folder_config.json."""

    try:
        config = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        config = {}
    namespace = str(config.get("namespace") or "").strip()
    module_kind = normalize_module_kind(config.get("module_kind", config.get("type", "component")))
    # Detect folders that belong to an individual algorithm (not a category)
    is_algo_folder = bool(config.get("name"))
    entries = [
        entry for entry in registry.get_all()
        if entry.type == module_kind and (entry.namespace == namespace or entry.namespace.startswith(f"{namespace}."))
    ]
    return {
        "namespace": namespace,
        "zh_name": str(config.get("zh_name") or config.get("display_name") or namespace),
        "module_kind": module_kind,
        "path": str(path.parent),
        "count": len(entries),
        "is_algo_folder": is_algo_folder,
    }


def _find_category_config(registry: AlgorithmRegistry, namespace: str, module_kind: str | None = None) -> Path | None:
    """Find a category config by namespace and optional module kind."""

    normalized = _normalize_category(namespace)
    for path in _category_config_paths(registry):
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(config.get("namespace") or "") != normalized:
            continue
        current_kind = normalize_module_kind(config.get("module_kind", config.get("type", "component")))
        if module_kind is None or current_kind == module_kind:
            return path
    return None


def _rename_function_in_source(source: str, old_name: str, new_name: str) -> str:
    """Rename one public function definition in source."""

    tree = ast.parse(source)
    target: ast.FunctionDef | ast.AsyncFunctionDef | None = None
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == old_name:
            target = node
            break
    if target is None:
        raise HTTPException(status_code=400, detail=f"Function not found in source: {old_name}")
    lines = source.splitlines()
    line_index = target.lineno - 1
    line = lines[line_index]
    lines[line_index] = line.replace(f"def {old_name}(", f"def {new_name}(", 1)
    return "\n".join(lines).rstrip() + "\n"


def _rescan_all(registry: AlgorithmRegistry) -> None:
    """Clear and rebuild the in-memory registry from watched roots."""

    roots = list(registry.watch_roots)
    registry._store.clear()  # noqa: SLF001
    registry._packages.clear()  # noqa: SLF001
    for root in roots:
        registry.scan_directory(root)


def _now_iso() -> str:
    """Return current UTC timestamp."""

    return datetime.now(timezone.utc).isoformat()


def _version_history_path_for_entry(entry: AlgorithmEntry) -> Path:
    """Return version history file path for an entry."""

    return _entry_config_path(entry).parent / "version_history.json"


def _load_version_history(path: Path) -> list[dict[str, Any]]:
    """Load a version history list."""

    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _append_entry_version(entry: AlgorithmEntry, action: str, operator: str = "system", note: str = "") -> None:
    """Append a source snapshot to an entry's version history."""

    path = _version_history_path_for_entry(entry)
    source_files = _folder_files_for_entry(entry)
    history = _load_version_history(path)
    history.append(
        {
            "version_id": f"ver_{len(history) + 1:04d}",
            "algorithm_id": entry.id,
            "call_prefix": entry.call_prefix,
            "version": entry.version,
            "action": action,
            "operator": operator,
            "timestamp": _now_iso(),
            "note": note,
            "files": [
                {
                    "relative_path": item.get("relative_path") or item.get("filename"),
                    "content": item.get("content", ""),
                }
                for item in source_files
            ],
            "metadata": _entry_dict(entry),
        }
    )
    try:
        path.write_text(json.dumps(history[-100:], ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write version history: {exc}") from exc


def _normalize_call_namespace(value: str) -> str:
    normalized = value.strip().strip("/")
    if normalized.startswith("alg."):
        normalized = normalized[4:]
    return normalized


def _serialize_result(result: Any) -> Any:
    try:
        json.dumps(result, ensure_ascii=False)
        return result
    except TypeError:
        return str(result)


def _apply_review_draft(entry: AlgorithmEntry, registry: AlgorithmRegistry) -> AlgorithmEntry:
    """Apply a pending review draft to the actual algorithm files."""

    draft = _load_review_draft(entry)
    if not draft:
        return entry
    files = draft.get("files", [])
    if not isinstance(files, list):
        raise HTTPException(status_code=500, detail="Review draft files must be a list")
    metadata = draft.get("metadata") if isinstance(draft.get("metadata"), dict) else {}
    try:
        if entry.package_id and entry.package_root:
            package_root = Path(entry.package_root).resolve()
            for item in files:
                if not isinstance(item, dict):
                    continue
                filename = str(item.get("filename") or item.get("relative_path") or "").strip()
                content = str(item.get("content") or "")
                if not filename.endswith(".py") or ".." in Path(filename).parts:
                    raise HTTPException(status_code=400, detail=f"Invalid draft filename: {filename}")
                ast.parse(content)
                target = (package_root / filename).resolve()
                if not target.is_relative_to(package_root):
                    raise HTTPException(status_code=400, detail=f"Invalid draft filename: {filename}")
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")
            manifest_path = package_root / "algopack.json"
            if manifest_path.exists() and metadata.get("version"):
                manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
                manifest["version"] = str(metadata.get("version"))
                manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            package = registry.get_package(entry.package_id)
            if package is not None:
                registry.scan_directory(str(package_root.parent))
        else:
            if not files:
                return entry
            first = files[0]
            if not isinstance(first, dict):
                raise HTTPException(status_code=400, detail="Invalid review draft file")
            content = str(first.get("content") or "")
            ast.parse(content)
            if metadata.get("version"):
                content = _upsert_algo_meta(
                    content,
                    entry.func_name,
                    {
                        "zh_name": entry.zh_name,
                        "zh_description": entry.zh_description,
                        "zh_tags": entry.zh_tags,
                        "version": str(metadata.get("version")),
                    },
                )
            source_path = Path(entry.source_file).resolve()
            source_path.write_text(content, encoding="utf-8")
            registry.rescan_file(str(source_path))
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"审核草稿中存在 Python 语法错误：{exc}") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update package manifest: {exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to apply review draft: {exc}") from exc
    refreshed = registry.get_by_id(entry.id) or registry.get_by_id(f"{entry.namespace}.{entry.func_name}") or entry
    _delete_review_draft(refreshed)
    return refreshed


def _clear_cached_modules(module_key: str) -> None:
    for key in list(sys.modules.keys()):
        if key == module_key or key.startswith(f"{module_key}."):
            sys.modules.pop(key, None)


def _load_entry_module(entry: AlgorithmEntry) -> types.ModuleType:
    if entry.package_root:
        module_key = f"_algo_pkg_{(entry.package_id or entry.id).replace('.', '_')}"
        spec = importlib.util.spec_from_file_location(
            module_key,
            entry.source_file,
            submodule_search_locations=[entry.package_root],
        )
    else:
        module_key = f"_algo_{entry.id.replace('.', '_')}"
        spec = importlib.util.spec_from_file_location(module_key, entry.source_file)

    if spec is None or spec.loader is None:
        raise HTTPException(status_code=500, detail="Cannot load algorithm module")

    _clear_cached_modules(module_key)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_key] = module
    try:
        spec.loader.exec_module(module)  # type: ignore[union-attr]
    except Exception as exc:  # noqa: BLE001
        _clear_cached_modules(module_key)
        raise HTTPException(status_code=500, detail=f"Module load error: {exc}") from exc
    return module


def _execute_entry(entry: AlgorithmEntry, args: list[Any], kwargs: dict[str, Any]) -> dict[str, Any]:
    module = _load_entry_module(entry)
    func = getattr(module, entry.func_name, None)
    if func is None or not callable(func):
        raise HTTPException(status_code=404, detail=f"Function '{entry.func_name}' not found in module")

    started = time.perf_counter()
    try:
        result = func(*args, **kwargs)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "success": True,
            "result": _serialize_result(result),
            "error": "",
            "elapsed_ms": elapsed_ms,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Execution error for %s", entry.call_prefix)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "success": False,
            "result": None,
            "error": str(exc),
            "elapsed_ms": elapsed_ms,
        }


def _entry_doc(entry: AlgorithmEntry) -> dict[str, Any]:
    call_prefix = entry.call_prefix
    api_path = f"/api/v1/invoke/{call_prefix}"
    param_lines = [f'"{param["name"]}": {param.get("default", "null") or "null"}' for param in entry.params]
    body_example = "{\n  \"args\": [],\n  \"kwargs\": {\n" + (
        "".join(f"    {line},\n" for line in param_lines) if param_lines else ""
    ) + "  }\n}"
    return {
        "id": entry.id,
        "call_prefix": call_prefix,
        "api_path": api_path,
        "namespace": entry.namespace,
        "func_name": entry.func_name,
        "version": entry.version,
        "description": entry.zh_description or entry.en_description,
        "params": entry.params,
        "return_type": entry.return_type,
        "package_id": entry.package_id,
        "examples": {
            "python": f"result = {call_prefix}({', '.join(param['name'] for param in entry.params)})",
            "http": f"POST {api_path}\nContent-Type: application/json\n\n{body_example}",
        },
    }


def _find_entries_for_docs(registry: AlgorithmRegistry, call_namespace: str) -> list[AlgorithmEntry]:
    normalized = _normalize_call_namespace(call_namespace)
    entry = registry.get_by_id(normalized)
    if entry is not None:
        return [entry]
    entries = registry.get_by_namespace(normalized)
    if entries:
        return sorted(entries, key=lambda item: item.call_prefix)
    return []


from ..sdk.auth_utils import get_current_user

_ALGORITHMS_ROOT = Path(__file__).resolve().parents[2] / "algorithms_root"


@router.get("/algorithms")
async def list_algorithms(
    module_kind: str | None = Query(None, description="Filter by component/template/snippet"),
    registry: AlgorithmRegistry = Depends(get_registry),
    request: Request = None,
) -> dict[str, Any]:
    entries = registry.get_all()
    if module_kind:
        entries = [entry for entry in entries if entry.type == module_kind]
    # Optional owner-based filtering via Bearer token (no token = return all for backward compat)
    auth = (request.headers.get("Authorization", "") if request else "")
    if auth.startswith("Bearer "):
        try:
            current_user = get_current_user(request)
            if current_user.get("role") != "admin":
                user_id = current_user["id"]
                entries = [e for e in entries if getattr(e, "owner_id", "system") in ("system", user_id)]
        except Exception:
            pass
    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}


class UserAlgorithmCreateRequest(BaseModel):
    name: str
    zh_name: str = ""
    folder: str = "我的算法"
    description: str = ""
    tags: list[str] = []


class UserFolderCreateRequest(BaseModel):
    folder_name: str


@router.post("/user/algorithms")
async def create_user_algorithm(
    body: UserAlgorithmCreateRequest,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a private algorithm in the current user's directory."""
    current_user = get_current_user(request)
    user_id = current_user["id"]
    name = body.name.strip()
    folder = body.folder.strip() or "我的算法"
    if not name or not name.replace("_", "").isalnum():
        raise HTTPException(status_code=400, detail="算法名称只能包含字母、数字和下划线")

    user_dir = _ALGORITHMS_ROOT / "users" / user_id / folder / name
    if user_dir.exists():
        raise HTTPException(status_code=409, detail="该名称的算法已存在")
    user_dir.mkdir(parents=True, exist_ok=False)

    config = {
        "namespace": name,
        "owner_id": user_id,
        "zh_name": body.zh_name or name,
        "module_kind": "component",
        "publish_status": "draft",
        "zh_tags": body.tags,
        "zh_description": body.description,
    }
    (user_dir / "folder_config.json").write_text(
        json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    main_code = f'''# -*- coding: utf-8 -*-
"""
算法名称：{body.zh_name or name}
命名空间：alg.{name}.main
"""


def main():
    """
    功能描述：
    输入参数：
    返回值：
    """
    pass
'''
    (user_dir / "main.py").write_text(main_code, encoding="utf-8")

    # Scan to register
    scan_root = str(_ALGORITHMS_ROOT / "users" / user_id)
    registry.scan_directory(scan_root)
    entry = registry.get(f"{name}.main")
    return {
        "success": True,
        "algorithm": _entry_dict(entry) if entry else {"id": f"{name}.main", "namespace": name},
    }


@router.post("/user/folders")
async def create_user_folder(
    body: UserFolderCreateRequest,
    request: Request,
) -> dict[str, Any]:
    """Create an empty folder in the current user's directory."""
    current_user = get_current_user(request)
    user_id = current_user["id"]
    folder_name = body.folder_name.strip()
    if not folder_name:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")
    folder_dir = _ALGORITHMS_ROOT / "users" / user_id / folder_name
    folder_dir.mkdir(parents=True, exist_ok=True)
    # placeholder config
    cfg_path = folder_dir / "folder_config.json"
    if not cfg_path.exists():
        cfg_path.write_text(
            json.dumps({"namespace": folder_name, "owner_id": user_id, "module_kind": "component"}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    return {"success": True, "folder": folder_name}


@router.get("/algorithms/search")
async def search_algorithms(
    prefix: str | None = Query(None, description="前缀搜索，如 alg.statistics"),
    keyword: str | None = Query(None, description="中文关键词搜索"),
    namespace: str | None = Query(None, description="命名空间过滤"),
    type: str | None = Query(None, description="类型过滤 component/snippet"),
    module_kind: str | None = Query(None, description="Filter by component/template/snippet"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    if prefix:
        entries = registry.search_by_prefix(prefix)
    elif keyword:
        entries = registry.search_by_chinese(keyword)
    else:
        entries = registry.get_all()

    if namespace:
        entries = [entry for entry in entries if entry.namespace == namespace]
    if type:
        entries = [entry for entry in entries if entry.type == type]
    if module_kind:
        entries = [entry for entry in entries if entry.type == module_kind]

    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}


@router.post("/algorithms/{algorithm_id:path}/publish-as-component")
async def publish_template_as_component(
    algorithm_id: str,
    payload: PublishAsComponentRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Copy a template directory and register the copy as a component draft."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="Only template entries can be published as component")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be empty")
    new_namespace_raw = payload.new_namespace.strip()
    if not new_namespace_raw.startswith("alg."):
        raise HTTPException(status_code=400, detail="new_namespace must start with alg.")
    normalized_namespace = _normalize_call_namespace(new_namespace_raw)
    namespace_parts = [part for part in normalized_namespace.split(".") if part]
    if not namespace_parts:
        raise HTTPException(status_code=400, detail="new_namespace must look like alg.<category>")

    source_dir = Path(entry.package_root) if entry.package_root else Path(entry.source_file).parent
    source_resolved = source_dir.resolve()
    target_base = source_resolved.parent
    for root in registry.watch_roots:
        root_path = Path(root).resolve()
        try:
            if source_resolved.is_relative_to(root_path):
                target_base = root_path
                break
        except ValueError:
            continue
    target_dir = target_base.joinpath(*namespace_parts, name)
    if target_dir.exists():
        raise HTTPException(status_code=409, detail=f"Component directory already exists: {target_dir}")

    manifest_name = "algopack.json" if entry.package_root else "folder_config.json"
    manifest_path = target_dir / manifest_name

    try:
        if entry.package_root:
            shutil.copytree(source_dir, target_dir)
        else:
            target_dir.mkdir(parents=True, exist_ok=False)
            source_manifest = source_dir / "folder_config.json"
            manifest = json.loads(source_manifest.read_text(encoding="utf-8")) if source_manifest.exists() else {}
            target_func_name = _validate_identifier(name, "component name")
            source = Path(entry.source_file).read_text(encoding="utf-8")
            if payload.code:
                source = payload.code
            if target_func_name != entry.func_name:
                source = _rename_function_in_source(source, entry.func_name, target_func_name)
            source = _upsert_algo_meta(
                source,
                target_func_name,
                {
                    "zh_name": payload.zh_name or entry.zh_name or target_func_name,
                    "zh_description": payload.description or entry.zh_description,
                    "zh_tags": payload.zh_tags or entry.zh_tags,
                    "version": payload.version or "1.0.0",
                    "input_example": payload.input_example or entry.input_example,
                },
            )
            (target_dir / f"{target_func_name}.py").write_text(source, encoding="utf-8")
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        if not manifest_path.exists():
            raise HTTPException(status_code=500, detail=f"{manifest_name} not found in copied component")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["name"] = name
        manifest["zh_name"] = payload.zh_name
        manifest["namespace"] = normalized_namespace
        manifest["version"] = payload.version or "1.0.0"
        manifest["category"] = payload.category
        manifest["description"] = payload.description
        manifest["zh_description"] = payload.description
        manifest["module_kind"] = "component"
        manifest["published"] = False
        manifest["publish_status"] = "draft"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.scan_directory(str(target_dir.parent))
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update copied component manifest: {exc}") from exc

    target_resolved = target_dir.resolve()
    candidates = []
    for item in registry.get_all():
        try:
            is_in_target = Path(item.source_file).resolve().is_relative_to(target_resolved)
        except ValueError:
            is_in_target = False
        if is_in_target and item.type == "component":
            candidates.append(item)
    if not candidates:
        raise HTTPException(status_code=500, detail="Component copied but could not be registered")

    payload = _entry_dict(candidates[0])
    payload["source_template_id"] = entry.id
    return {"success": True, "algorithm": payload, "source_template_id": entry.id}


@router.post("/algorithms/reload")
async def reload_algorithms(registry: AlgorithmRegistry = Depends(get_registry)) -> dict[str, Any]:
    roots = list(registry.watch_roots)
    registry._store.clear()  # noqa: SLF001
    for root in roots:
        try:
            registry.scan_directory(root)
        except Exception as exc:  # noqa: BLE001
            logger.error("Rescan failed for %s: %s", root, exc)
    return {
        "success": True,
        "message": f"Reloaded. {registry.count} algorithms registered.",
        "count": registry.count,
    }


@router.post("/algorithms/create")
async def create_algorithm(
    payload: AlgorithmCreateRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a single-file component or template from plain user code."""

    module_kind = payload.module_kind.strip().lower() or "component"
    if module_kind not in {"component", "template"}:
        raise HTTPException(status_code=400, detail="module_kind must be component or template")

    func_name = _validate_identifier(payload.name, "name")
    namespace = _normalize_category(payload.category)
    root = _default_algorithm_root(registry)
    target_folder = root.joinpath(*namespace.split("."))
    target_file = target_folder / f"{func_name}.py"
    if target_file.exists():
        raise HTTPException(status_code=409, detail=f"Algorithm file already exists: {target_file.name}")

    try:
        function_names = _public_function_names(payload.code)
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"Python 语法错误：{exc}") from exc
    if func_name not in function_names:
        raise HTTPException(status_code=400, detail=f"源码中未找到函数定义：{func_name}")

    try:
        target_folder.mkdir(parents=True, exist_ok=True)
        _ensure_folder_kind_compatible(target_folder, module_kind)
        _write_folder_config(target_folder, namespace, module_kind, payload.publish_status or "draft", payload.category_zh_name or "")
        source = _upsert_algo_meta(
            payload.code,
            func_name,
            {
                "zh_name": payload.zh_name or func_name,
                "zh_description": payload.zh_description,
                "zh_tags": payload.zh_tags,
                "version": payload.version or "1.0.0",
                "input_example": payload.input_example or "",
            },
        )
        target_file.write_text(source, encoding="utf-8")
        registry.scan_directory(str(target_folder))
    except (OSError, SyntaxError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create algorithm: {exc}") from exc

    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=500, detail="Algorithm created but could not be registered")
    # Write per-algorithm status file immediately so this entry's status is
    # isolated from other algorithms in the same folder_config.json.
    try:
        init_status = payload.publish_status or "draft"
        _per_algo_status_path(entry).write_text(
            json.dumps({"publish_status": init_status, "published": init_status == "published"}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except OSError:
        pass  # Non-fatal; status will fall back to folder_config.json
    _append_entry_version(entry, "created", note="Created from frontend")
    sse_manager.broadcast({"event": "updated", "file": str(target_file), "algorithms": registry.to_completion_json()})
    return {"success": True, "algorithm": _entry_dict(entry)}


@router.get("/categories")
async def list_categories(
    module_kind: str | None = Query(None),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """List algorithm categories backed by folder_config.json."""

    categories = [_category_from_config(path, registry) for path in _category_config_paths(registry)]
    if module_kind:
        categories = [item for item in categories if item["module_kind"] == module_kind]
    # Only include top-level categories: must have a namespace and must NOT be
    # an algorithm-level folder_config (those have a "name" field = func name).
    categories = [item for item in categories if item.get("namespace") and not item.get("is_algo_folder")]
    seen_ns: set[str] = set()
    deduped: list[dict] = []
    for item in categories:
        key = (item["module_kind"], item["namespace"])
        if key not in seen_ns:
            seen_ns.add(key)
            deduped.append(item)
    deduped.sort(key=lambda item: (item["module_kind"], item["namespace"]))
    return {"success": True, "count": len(deduped), "categories": deduped}


@router.post("/categories")
async def create_category(
    payload: CategoryCreateRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a top-level algorithm category folder."""

    name = _validate_identifier(payload.name, "name")
    module_kind = normalize_module_kind(payload.module_kind)
    root = _default_algorithm_root(registry)
    target = root / name
    if target.exists():
        raise HTTPException(status_code=409, detail=f"Category already exists: {name}")
    try:
        target.mkdir(parents=True)
        _write_folder_config(target, name, module_kind, "draft")
        config_path = target / "folder_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["zh_name"] = payload.zh_name.strip() or name
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.scan_directory(str(target))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create category: {exc}") from exc

    category = _category_from_config(target / "folder_config.json", registry)
    sse_manager.broadcast({"event": "updated", "category": category, "algorithms": registry.to_completion_json()})
    return {"success": True, "category": category}


@router.patch("/categories/{namespace:path}")
async def update_category(
    namespace: str,
    payload: CategoryUpdateRequest,
    module_kind: str | None = Query(None),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Edit category display name and optionally move its namespace folder."""

    config_path = _find_category_config(registry, namespace, module_kind)
    if config_path is None:
        raise HTTPException(status_code=404, detail=f"Category not found: {namespace}")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read category config: {exc}") from exc

    old_namespace = str(config.get("namespace") or _normalize_category(namespace))
    new_namespace = _normalize_category(payload.new_namespace) if payload.new_namespace else old_namespace
    if payload.zh_name is not None:
        config["zh_name"] = payload.zh_name.strip() or new_namespace
    config["namespace"] = new_namespace

    old_folder = config_path.parent
    root = Path(registry._find_watch_root(str(old_folder)) or _default_algorithm_root(registry)).resolve()  # noqa: SLF001
    target_folder = root.joinpath(*new_namespace.split("."))
    if target_folder != old_folder.resolve() and target_folder.exists():
        raise HTTPException(status_code=409, detail=f"Target category already exists: {new_namespace}")

    try:
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        if target_folder != old_folder.resolve():
            target_folder.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_folder), str(target_folder))
            _rescan_all(registry)
        else:
            _rescan_all(registry)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update category: {exc}") from exc

    category = _category_from_config(target_folder / "folder_config.json", registry)
    sse_manager.broadcast({"event": "updated", "category": category, "algorithms": registry.to_completion_json()})
    return {"success": True, "category": category}


@router.post("/categories/{namespace:path}/subcategories")
async def create_subcategory(
    namespace: str,
    payload: CategoryCreateRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create an empty child category under an existing category."""

    parent_config = _find_category_config(registry, namespace, payload.module_kind)
    if parent_config is None:
        raise HTTPException(status_code=404, detail=f"Parent category not found: {namespace}")
    child_name = _validate_identifier(payload.name, "name")
    parent_namespace = _normalize_category(namespace)
    child_namespace = f"{parent_namespace}.{child_name}"
    parent_folder = parent_config.parent
    child_folder = parent_folder / child_name
    if child_folder.exists():
        raise HTTPException(status_code=409, detail=f"Subcategory already exists: {child_namespace}")
    try:
        child_folder.mkdir(parents=True)
        _write_folder_config(
            child_folder,
            child_namespace,
            normalize_module_kind(payload.module_kind),
            "draft",
        )
        config_path = child_folder / "folder_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["zh_name"] = payload.zh_name.strip() or child_name
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.scan_directory(str(child_folder))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create subcategory: {exc}") from exc

    category = _category_from_config(child_folder / "folder_config.json", registry)
    sse_manager.broadcast({"event": "updated", "category": category, "algorithms": registry.to_completion_json()})
    return {"success": True, "category": category}


@router.get("/algorithms/{algorithm_id:path}/versions")
async def list_algorithm_versions(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return version history for a component, template, or package entry."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    history = _load_version_history(_version_history_path_for_entry(entry))
    return {"success": True, "count": len(history), "versions": history}


@router.post("/algorithms/{algorithm_id:path}/versions/snapshot")
async def snapshot_algorithm_version(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a manual version snapshot."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    payload = await request.json()
    _append_entry_version(
        entry,
        "snapshot",
        operator=str(payload.get("operator") or "system"),
        note=str(payload.get("note") or ""),
    )
    history = _load_version_history(_version_history_path_for_entry(entry))
    return {"success": True, "version": history[-1], "count": len(history)}


@router.get("/algorithms/{algorithm_id:path}")
async def get_algorithm(algorithm_id: str, registry: AlgorithmRegistry = Depends(get_registry)) -> dict[str, Any]:
    if algorithm_id.endswith("/review-draft"):
        base_id = algorithm_id[: -len("/review-draft")]
        entry_for_draft = registry.get_by_id(_normalize_call_namespace(base_id)) or registry.get_by_id(base_id)
        if entry_for_draft is None:
            raise HTTPException(status_code=404, detail=f"Algorithm not found: {base_id}")
        draft = _load_review_draft(entry_for_draft)
        if draft is None:
            return {"success": True, "exists": False, "draft": None}
        return {"success": True, "exists": True, "draft": draft}
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    return {"success": True, "algorithm": _entry_dict(entry)}


@router.patch("/algorithms/{algorithm_id:path}/metadata")
async def update_algorithm_metadata(
    algorithm_id: str,
    payload: AlgorithmMetadataUpdateRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Update display metadata and category namespace for a component/template."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")

    metadata = {
        "zh_name": payload.zh_name if payload.zh_name is not None else entry.zh_name,
        "zh_description": payload.zh_description if payload.zh_description is not None else entry.zh_description,
        "zh_tags": payload.zh_tags if payload.zh_tags is not None else entry.zh_tags,
        "version": payload.version if payload.version is not None else entry.version,
        "input_example": payload.input_example if payload.input_example is not None else entry.input_example,
    }

    if entry.package_id:
        updates: dict[str, Any] = {
            "zh_name": metadata["zh_name"],
            "zh_description": metadata["zh_description"],
            "zh_tags": metadata["zh_tags"],
            "version": metadata["version"],
        }
        if payload.namespace:
            normalized = _normalize_call_namespace(payload.namespace)
            parts = [part for part in normalized.split(".") if part]
            if len(parts) < 2 or ".".join(parts[:-1]) != entry.namespace:
                raise HTTPException(status_code=400, detail="Package category is determined by its package manifest")
            if parts[-1] != entry.func_name:
                raise HTTPException(status_code=400, detail="Package export renaming is not supported here")
        package = registry.update_package_manifest(entry.package_id, updates)
        updated = next((item for item in registry.get_by_namespace(package.namespace) if item.func_name == entry.func_name), None)
        if updated is None:
            raise HTTPException(status_code=500, detail="Metadata updated but algorithm could not be reloaded")
        return {"success": True, "algorithm": _entry_dict(updated)}

    source_path = Path(entry.source_file).resolve()
    target_namespace = entry.namespace
    target_func_name = entry.func_name
    if payload.namespace:
        normalized = _normalize_call_namespace(payload.namespace)
        parts = [part for part in normalized.split(".") if part]
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="namespace must look like alg.<category>.<function>")
        target_namespace = ".".join(parts[:-1])
        if target_namespace != entry.namespace:
            raise HTTPException(status_code=400, detail="Category namespace is determined by the algorithm folder")
        target_func_name = _validate_identifier(parts[-1], "function name")

    root = Path(registry._find_watch_root(str(source_path)) or _default_algorithm_root(registry)).resolve()  # noqa: SLF001
    target_folder = root.joinpath(*target_namespace.split("."))
    target_file = target_folder / f"{target_func_name}.py"

    try:
        source = source_path.read_text(encoding="utf-8")
        if target_func_name != entry.func_name:
            source = _rename_function_in_source(source, entry.func_name, target_func_name)
        updated_source = _upsert_algo_meta(source, target_func_name, metadata)
        target_folder.mkdir(parents=True, exist_ok=True)
        _write_folder_config(target_folder, target_namespace, entry.type, _read_entry_publish_status(entry))
        if target_file != source_path and target_file.exists():
            raise HTTPException(status_code=409, detail=f"Target algorithm file already exists: {target_file}")
        _ensure_folder_kind_compatible(target_folder, entry.type)
        target_file.write_text(updated_source, encoding="utf-8")
        if target_file != source_path:
            source_path.unlink()
            registry.unregister_by_file(str(source_path))
        registry.rescan_file(str(target_file))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update metadata: {exc}") from exc

    updated = registry.get_by_id(f"{target_namespace}.{target_func_name}")
    if updated is None:
        raise HTTPException(status_code=500, detail="Metadata updated but algorithm could not be reloaded")
    _append_entry_version(updated, "metadata.updated", note="Metadata updated")
    sse_manager.broadcast({"event": "updated", "file": str(target_file), "algorithms": registry.to_completion_json()})
    return {"success": True, "algorithm": _entry_dict(updated)}


@router.delete("/algorithms/{algorithm_id:path}")
async def delete_algorithm(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Delete a single-file algorithm source."""

    if algorithm_id.endswith("/review-draft"):
        base_id = algorithm_id[: -len("/review-draft")]
        entry_for_draft = registry.get_by_id(_normalize_call_namespace(base_id)) or registry.get_by_id(base_id)
        if entry_for_draft is None:
            raise HTTPException(status_code=404, detail=f"Algorithm not found: {base_id}")
        draft = _load_review_draft(entry_for_draft)
        base_status = str((draft or {}).get("base_status") or "draft")
        config_path = _entry_config_path(entry_for_draft)
        if config_path.exists() and _read_entry_publish_status(entry_for_draft) == "rejected":
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
                config["publish_status"] = base_status
                config["published"] = base_status == "published"
                config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
            except (OSError, json.JSONDecodeError) as exc:
                raise HTTPException(status_code=500, detail=f"Failed to restore status: {exc}") from exc
        _delete_review_draft(entry_for_draft)
        registry.scan_directory(str(config_path.parent.parent))
        refreshed = registry.get_by_id(entry_for_draft.id) or entry_for_draft
        sse_manager.broadcast({"event": "updated", "file": str(config_path), "algorithms": registry.to_completion_json()})
        return {"success": True, "algorithm": _entry_dict(refreshed)}

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除他人的算法")
    if entry.package_id:
        package_root = Path(entry.package_root or "").resolve()
        if not package_root.exists():
            raise HTTPException(status_code=404, detail=f"Package root not found: {package_root}")
        root = Path(registry._find_watch_root(str(package_root)) or _default_algorithm_root(registry)).resolve()  # noqa: SLF001
        if not package_root.is_relative_to(root) or package_root == root:
            raise HTTPException(status_code=400, detail="Refusing to delete package outside algorithm root")
        try:
            shutil.rmtree(package_root)
            registry.scan_directory(str(root))
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to delete package algorithm: {exc}") from exc
        sse_manager.broadcast({"event": "updated", "file": str(package_root), "algorithms": registry.to_completion_json()})
        return {"success": True, "deleted": entry.id}
    source_path = Path(entry.source_file).resolve()
    try:
        _delete_review_draft(entry)
        source_path.unlink(missing_ok=True)
        registry.unregister_by_file(str(source_path))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to delete algorithm: {exc}") from exc
    sse_manager.broadcast({"event": "updated", "file": str(source_path), "algorithms": registry.to_completion_json()})
    return {"success": True, "deleted": entry.id}


@router.get("/algorithm-source/{algorithm_id:path}")
async def get_algorithm_source(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    source_path = Path(entry.source_file)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")
    # For published/reviewing/rejected algorithms, return draft content if available
    review_draft = _load_review_draft(entry)
    if review_draft and review_draft.get("files"):
        draft_files = review_draft["files"]
        if not entry.package_id:
            # Single-file: return draft content as the editable source
            draft_source = str(draft_files[0].get("content", "")) if draft_files else source_path.read_text(encoding="utf-8")
            draft_folder_files = [{"filename": f.get("filename", ""), "relative_path": f.get("relative_path", ""), "content": f.get("content", "")} for f in draft_files]
            return {
                "success": True,
                "algorithm": _entry_dict(entry),
                "source": draft_source,
                "source_file": str(source_path),
                "folder_files": draft_folder_files,
                "is_draft_mode": True,
            }
    return {
        "success": True,
        "algorithm": _entry_dict(entry),
        "source": source_path.read_text(encoding="utf-8"),
        "source_file": str(source_path),
        "folder_files": _folder_files_for_entry(entry),
        "is_draft_mode": False,
    }


@router.get("/algorithms/{algorithm_id:path}/review-draft")
async def get_algorithm_review_draft(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return the pending review draft for an algorithm."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    draft = _load_review_draft(entry)
    if draft is None:
        return {"success": True, "exists": False, "draft": None}
    return {"success": True, "exists": True, "draft": draft}


@router.post("/algorithms/{algorithm_id:path}/review-draft")
async def save_algorithm_review_draft(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Save pending review files without changing the published algorithm files."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    payload = await request.json()
    files = payload.get("files", [])
    if not isinstance(files, list) or not files:
        raise HTTPException(status_code=400, detail="Field 'files' must be a non-empty list")
    normalized_files: list[dict[str, str]] = []
    for item in files:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="Each file must be an object")
        filename = str(item.get("filename") or item.get("relative_path") or "").strip()
        content = str(item.get("content") or "")
        if not filename.endswith(".py") or filename == "__init__.py" or ".." in Path(filename).parts:
            raise HTTPException(status_code=400, detail=f"Invalid Python filename: {filename}")
        try:
            ast.parse(content)
        except SyntaxError as exc:
            raise HTTPException(status_code=400, detail=f"{filename} 中存在 Python 语法错误：{exc}") from exc
        normalized_files.append({"filename": filename, "relative_path": filename, "content": content})
    current_status = _read_entry_publish_status(entry)
    existing = _load_review_draft(entry) or {}
    draft = {
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": existing.get("base_status") or current_status,
        "status": "pending",
        "metadata": payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {},
        "files": normalized_files,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_review_draft(entry, draft)
    return {"success": True, "draft": {key: value for key, value in draft.items() if key != "files"}, "exists": True}


@router.delete("/algorithms/{algorithm_id:path}/review-draft")
async def discard_algorithm_review_draft(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Discard a pending/rejected review draft and restore the previous visible status."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    draft = _load_review_draft(entry)
    base_status = str((draft or {}).get("base_status") or "draft")
    current_status = _read_entry_publish_status(entry)
    _delete_review_draft(entry)
    if current_status == "rejected":
        refreshed = _update_publish_status(entry, base_status, registry)
    else:
        config_path = _entry_config_path(entry)
        registry.scan_directory(str(config_path.parent.parent if not entry.package_root else Path(entry.package_root).parent))
        refreshed = registry.get_by_id(entry.id) or entry
        sse_manager.broadcast({"event": "updated", "file": str(config_path), "algorithms": registry.to_completion_json()})
    return {"success": True, "algorithm": _entry_dict(refreshed)}


def _update_publish_status(entry: AlgorithmEntry, status: str, registry: AlgorithmRegistry) -> AlgorithmEntry:
    """Write publish_status to the appropriate config and rescan."""

    config_path = _entry_config_path(entry)
    if not entry.package_root:
        # For non-package (flat-file) entries write to a per-algorithm status file
        # so that multiple algorithms in the same folder never share status.
        status_path = _per_algo_status_path(entry)
        try:
            status_path.write_text(
                json.dumps({"publish_status": status, "published": status == "published"}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"Failed to update algorithm status: {exc}") from exc
        scan_root = str(config_path.parent.parent)
    else:
        # Package entries own their algopack.json exclusively.
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                config = {}
        else:
            config = {"namespace": entry.namespace, "type": entry.type, "module_kind": entry.type}
        config["publish_status"] = status
        config["published"] = status == "published"
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        scan_root = str(Path(entry.package_root).parent)
    registry.scan_directory(scan_root)
    refreshed = registry.get_by_id(entry.id) or entry
    sse_manager.broadcast({"event": "updated", "file": str(config_path), "algorithms": registry.to_completion_json()})
    return refreshed


@router.post("/algorithms/{algorithm_id:path}/submit")
async def submit_algorithm_review(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Submit an algorithm for review (draft → reviewing). Snapshots current code."""

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权提交他人的算法审核")
    current = _read_entry_publish_status(entry)
    if current not in ("draft", "rejected", "published"):
        raise HTTPException(status_code=400, detail=f"Cannot submit from status: {current}")
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        body = {}
    existing = _load_review_draft(entry) or {}
    # For published algorithms with no draft, snapshot current files
    if not existing.get("files"):
        snap_files = _folder_files_for_entry(entry)
        existing["files"] = [{"filename": f["filename"], "relative_path": f["relative_path"], "content": f["content"]} for f in snap_files]
    draft: dict[str, Any] = {
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": existing.get("base_status") or current,
        "status": "reviewing",
        "version_bump": str(body.get("version_bump") or ""),
        "metadata": body.get("metadata") if isinstance(body.get("metadata"), dict) else {},
        "files": existing["files"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_review_draft(entry, draft)
    refreshed = _update_publish_status(entry, "reviewing", registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/withdraw")
async def withdraw_algorithm_review(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Withdraw a submitted review (reviewing → original base status)."""

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权撤回他人的审核提交")
    draft = _load_review_draft(entry) or {}
    base_status = str(draft.get("base_status") or "draft")
    # Mark draft as pending (not yet reviewing)
    if draft:
        draft["status"] = "pending"
        _save_review_draft(entry, draft)
    refreshed = _update_publish_status(entry, base_status, registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/approve")
async def approve_algorithm_review(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Approve a review (reviewing → approved)."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可审批算法")
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    current = _read_entry_publish_status(entry)
    if current not in ("reviewing", "draft"):
        raise HTTPException(status_code=400, detail=f"Cannot approve from status: {current}")
    refreshed = _update_publish_status(entry, "approved", registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/reject")
async def reject_algorithm_review(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Reject a review (reviewing → rejected). Updates review draft with reason."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可驳回算法审核")
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        body = {}
    reason = str(body.get("reason") or "")
    # Always persist reject_reason; create a minimal draft if none exists
    existing = _load_review_draft(entry) or {
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": _read_entry_publish_status(entry),
        "metadata": {},
        "files": [],
    }
    existing["status"] = "rejected"
    existing["reject_reason"] = reason
    existing["updated_at"] = datetime.now(timezone.utc).isoformat()
    _save_review_draft(entry, existing)
    refreshed = _update_publish_status(entry, "rejected", registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/re-review")
async def re_review_algorithm(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Undo a rejection and put the algorithm back into reviewing state (rejected → reviewing)."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    current = _read_entry_publish_status(entry)
    if current != "rejected":
        raise HTTPException(status_code=400, detail=f"Cannot re-review from status: {current}")
    draft = _load_review_draft(entry)
    if draft:
        draft["status"] = "reviewing"
        _save_review_draft(entry, draft)
    refreshed = _update_publish_status(entry, "reviewing", registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/publish")
async def publish_algorithm(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Publish an approved algorithm (approved → published). Applies any pending review draft."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可发布算法")
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    # Apply review draft so code changes actually take effect (e.g. published → revised → approved → published)
    draft = _load_review_draft(entry)
    if draft and draft.get("files"):
        entry = _apply_review_draft(entry, registry)
    refreshed = _update_publish_status(entry, "published", registry)
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithm-source/{algorithm_id:path}/add-file")
async def add_algorithm_source_file(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a Python file in an algorithm folder and return refreshed folder files."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    payload = await request.json()
    filename = str(payload.get("filename", "")).strip().replace("\\", "/")
    content = str(payload.get("content", ""))
    if not filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="filename must end with .py")
    if "/" in filename or filename in {"", "__init__.py"}:
        raise HTTPException(status_code=400, detail="filename must be a plain Python filename")
    folder = Path(entry.source_file).parent
    new_file = folder / filename
    if new_file.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {filename}")
    try:
        new_file.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create file: {exc}") from exc
    registry.rescan_file(str(new_file))
    return {"success": True, "folder_files": _folder_files_for_entry(entry)}


@router.patch("/algorithm-source/{algorithm_id:path}/rename-file")
async def rename_algorithm_source_file(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Rename a Python file in an algorithm folder."""
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    payload = await request.json()
    old_name = str(payload.get("old_name", "")).strip().replace("\\", "/")
    new_name = str(payload.get("new_name", "")).strip().replace("\\", "/")
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name and new_name are required")
    if "/" in new_name or not new_name.endswith(".py"):
        raise HTTPException(status_code=400, detail="new_name must be a plain .py filename")
    if new_name in {"__init__.py"}:
        raise HTTPException(status_code=400, detail="Cannot rename to __init__.py")
    folder = Path(entry.source_file).parent
    old_path = folder / old_name
    new_path = folder / new_name
    if not old_path.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {old_name}")
    if new_path.exists():
        raise HTTPException(status_code=409, detail=f"File already exists: {new_name}")
    # Disallow renaming the entry file if it is a single-file algorithm
    is_entry = str(old_path.resolve()) == str(Path(entry.source_file).resolve())
    if is_entry and not entry.package_id:
        raise HTTPException(status_code=400, detail="不能重命名单文件算法的入口文件")
    try:
        old_path.rename(new_path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Rename failed: {exc}") from exc
    registry.rescan_file(str(new_path))
    return {"success": True, "old_name": old_name, "new_name": new_name, "folder_files": _folder_files_for_entry(entry)}


@router.post("/algorithm-source/{algorithm_id:path}/check-syntax")
async def check_algorithm_syntax(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Check Python syntax for a given source snippet."""
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    payload = await request.json()
    content = str(payload.get("content", ""))
    filename = str(payload.get("filename", "source.py"))
    errors: list[dict[str, Any]] = []
    try:
        ast.parse(content, filename=filename)
    except SyntaxError as exc:
        errors.append({"line": exc.lineno, "col": exc.offset, "message": str(exc.msg)})
    return {"success": True, "valid": len(errors) == 0, "errors": errors}


@router.get("/user/algorithms")
async def list_user_algorithms(
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """List current user's own private algorithms."""
    current_user = get_current_user(request)
    user_id = current_user["id"]
    # Ensure the user's directory is scanned so new algos are visible
    user_scan_root = _ALGORITHMS_ROOT / "users" / user_id
    if user_scan_root.exists():
        registry.scan_directory(str(user_scan_root))
    entries = [e for e in registry.get_all() if getattr(e, "owner_id", "system") == user_id]
    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(e) for e in entries]}


@router.patch("/algorithm-source/{algorithm_id:path}")
async def save_algorithm_source(
    algorithm_id: str,
    payload: AlgorithmSourceSaveRequest,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Save the source file for a single-file algorithm entry."""

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改他人的算法")
    if entry.package_id:
        raise HTTPException(status_code=400, detail="Use package file APIs for package algorithms")
    source_path = Path(entry.source_file)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"Source file not found: {source_path}")
    try:
        ast.parse(payload.content)
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"Python 语法错误：{exc}") from exc
    current_status = _read_entry_publish_status(entry)
    # For published/reviewing/approved algorithms, save to review draft (preserve live file)
    if current_status in ("published", "reviewing", "approved"):
        filename = Path(entry.source_file).name
        existing = _load_review_draft(entry) or {}
        draft: dict[str, Any] = {
            "algorithm_id": entry.id,
            "call_prefix": entry.call_prefix,
            "base_status": existing.get("base_status") or current_status,
            "status": existing.get("status") or "pending",
            "metadata": existing.get("metadata") or {},
            "files": [{"filename": filename, "relative_path": filename, "content": payload.content}],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_review_draft(entry, draft)
        return {
            "success": True,
            "algorithm": _entry_dict(entry),
            "folder_files": [{"filename": filename, "relative_path": filename, "content": payload.content}],
            "is_draft_mode": True,
        }
    try:
        source_path.write_text(payload.content, encoding="utf-8")
        registry.rescan_file(str(source_path))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save source: {exc}") from exc
    updated = registry.get_by_id(entry.id) or registry.get_by_id(f"{entry.namespace}.{entry.func_name}")
    _append_entry_version(updated or entry, "source.saved", note="Source saved")
    sse_manager.broadcast({"event": "updated", "file": str(source_path), "algorithms": registry.to_completion_json()})
    return {
        "success": True,
        "algorithm": _entry_dict(updated or entry),
        "folder_files": _folder_files_for_entry(updated or entry),
        "is_draft_mode": False,
    }


@router.patch("/algorithms/{algorithm_id:path}/namespace")
async def patch_algorithm_namespace(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")

    payload = await request.json()
    new_namespace_raw = str(payload.get("new_namespace", "")).strip()
    if not new_namespace_raw:
        raise HTTPException(status_code=400, detail="Field 'new_namespace' is required")
    if not new_namespace_raw.startswith("alg."):
        raise HTTPException(status_code=400, detail="new_namespace must start with alg.")

    normalized = _normalize_call_namespace(new_namespace_raw)
    parts = [part for part in normalized.split(".") if part]
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="Namespace must look like alg.<category>.<function_name>")

    new_func_name = parts[-1]
    new_namespace = ".".join(parts[:-1])
    if new_func_name != entry.func_name:
        raise HTTPException(status_code=400, detail="当前仅支持修改命名空间前缀，函数名请在源码中调整")

    old_call_prefix = entry.call_prefix
    if entry.package_id:
        package = registry.update_package_manifest(entry.package_id, {"namespace": new_namespace})
        updated_entries = registry.get_by_namespace(package.namespace)
    else:
        config_path = Path(entry.source_file).parent / "folder_config.json"
        if not config_path.exists():
            raise HTTPException(status_code=404, detail=f"folder_config.json not found for {entry.id}")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["namespace"] = new_namespace
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.rescan_file(entry.source_file)
        updated_entries = registry.get_by_namespace(new_namespace)

    updated_entry = next((item for item in updated_entries if item.func_name == entry.func_name), None)
    if updated_entry is None:
        raise HTTPException(status_code=500, detail="Namespace updated but algorithm could not be reloaded")

    sse_manager.broadcast(
        {
            "event": "namespace.changed",
            "old": old_call_prefix,
            "new": updated_entry.call_prefix,
            "algorithms": registry.to_completion_json(),
        },
    )
    return {
        "success": True,
        "old": old_call_prefix,
        "new": updated_entry.call_prefix,
        "algorithm": _entry_dict(updated_entry),
    }


@router.get("/invoke/docs/{call_namespace:path}")
async def get_invoke_docs(
    call_namespace: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entries = _find_entries_for_docs(registry, call_namespace)
    if not entries:
        raise HTTPException(status_code=404, detail=f"No published component found for: {call_namespace}")
    docs = [_entry_doc(entry) for entry in entries]
    return {
        "success": True,
        "query": call_namespace,
        "count": len(docs),
        "primary": docs[0],
        "entries": docs,
    }


@router.get("/events/algo-changes")
async def algo_changes_sse(registry: AlgorithmRegistry = Depends(get_registry)) -> StreamingResponse:
    queue = sse_manager.add_client()
    init_payload = json.dumps(
        {"event": "init", "algorithms": registry.to_completion_json()},
        ensure_ascii=False,
    )

    async def _generate() -> AsyncGenerator[str, None]:
        try:
            yield f"event: init\ndata: {init_payload}\n\n"
            async for chunk in sse_manager.event_stream(queue):
                event_name = "updated"
                try:
                    payload = chunk.removeprefix("data: ").strip()
                    event_name = str(json.loads(payload).get("event") or "updated")
                except (json.JSONDecodeError, AttributeError):
                    event_name = "updated"
                yield f"event: {event_name}\n{chunk}"
        finally:
            sse_manager.remove_client(queue)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/run-source")
async def run_source(request: Request) -> dict[str, Any]:
    payload = await request.json()
    content = str(payload.get("content", "") or "")
    function_name = str(payload.get("function", "") or "").strip()
    args = payload.get("args", [])
    kwargs = payload.get("kwargs", {})
    if not content.strip():
        raise HTTPException(status_code=400, detail="Field 'content' must not be empty")
    if not isinstance(args, list):
        raise HTTPException(status_code=400, detail="Field 'args' must be a list")
    if not isinstance(kwargs, dict):
        raise HTTPException(status_code=400, detail="Field 'kwargs' must be an object")

    module_key = f"_algo_inline_{int(time.time() * 1000)}"
    module = types.ModuleType(module_key)
    started = time.perf_counter()
    try:
        exec(compile(content, f"{module_key}.py", "exec"), module.__dict__)  # noqa: S102
        if not function_name:
            for name, value in module.__dict__.items():
                if callable(value) and not name.startswith("_"):
                    function_name = name
                    break
        if not function_name:
            raise ValueError("未在源码中找到可执行函数，请填写函数名")
        func = module.__dict__.get(function_name)
        if not callable(func):
            raise ValueError(f"函数不存在或不可调用: {function_name}")
        result = func(*args, **kwargs)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "success": True,
            "function": function_name,
            "result": _serialize_result(result),
            "elapsed_ms": elapsed_ms,
        }
    except Exception as exc:  # noqa: BLE001
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        raise HTTPException(status_code=400, detail=f"Run source failed: {exc}", headers={"X-Elapsed-MS": str(elapsed_ms)}) from exc


@router.post("/run")
async def run_registered_algorithm(request: Request, registry: AlgorithmRegistry = Depends(get_registry)) -> dict[str, Any]:
    payload = await request.json()
    namespace = str(payload.get("namespace", "")).strip()
    func_name = str(payload.get("function", "")).strip()
    params = payload.get("params", {})
    args = payload.get("args", [])
    kwargs = payload.get("kwargs", {})
    if params and isinstance(params, dict):
        kwargs = params
    if not namespace or not func_name:
        raise HTTPException(status_code=400, detail="Fields 'namespace' and 'function' are required")
    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {namespace}.{func_name}")
    if not bool(payload.get("allow_unpublished", False)):
        _ensure_callable_status(entry)
    return _execute_entry(entry, args if isinstance(args, list) else [], kwargs if isinstance(kwargs, dict) else {})


@router.post("/{namespace}/{func_name}")
async def execute_algorithm(
    namespace: str,
    func_name: str,
    request: ExecuteRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {namespace}.{func_name}")
    _ensure_callable_status(entry)
    return _execute_entry(entry, request.args, request.kwargs)


@router.post("/invoke/{call_namespace:path}")
async def invoke_algorithm_by_namespace(
    call_namespace: str,
    request: ExecuteRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    normalized = _normalize_call_namespace(call_namespace)
    entry = registry.get_by_id(normalized)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {call_namespace}")
    _ensure_callable_status(entry)
    return _execute_entry(entry, request.args, request.kwargs)


@external_router.post("/{namespace}/{func_name}")
async def invoke_external_algorithm(
    namespace: str,
    func_name: str,
    request: ExecuteRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Invoke a published component through the external API surface."""

    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {namespace}.{func_name}")
    if entry.type != "component":
        raise HTTPException(status_code=404, detail=f"Published component not found: {namespace}.{func_name}")
    if _read_entry_publish_status(entry) != "published":
        raise HTTPException(status_code=403, detail="Algorithm is not published")
    return _execute_entry(entry, request.args, request.kwargs)
