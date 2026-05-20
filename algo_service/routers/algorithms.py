"""Algorithm API routes (/api/v1/...)."""

from __future__ import annotations

import importlib.util
import ast
import json
import logging
import re
import shutil
import sys
import tempfile
import time
import types
import uuid as uuid_lib
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
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
from ..sdk.auth_utils import get_current_user
from ..sdk.param_inferrer import infer_output_widget
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
        raise HTTPException(status_code=503, detail="注册表未初始化")
    return _registry


def _entry_client_id(entry: AlgorithmEntry) -> str:
    """Return the id exposed to frontend callers."""

    owner_id = str(getattr(entry, "owner_id", "system") or "system").strip()
    if owner_id and owner_id != "system":
        return f"{entry.id}@@{owner_id}"
    return entry.id


def _entry_dict(entry: AlgorithmEntry) -> dict[str, Any]:
    publish_status = _read_entry_publish_status(entry)
    display_namespace = entry.call_prefix or f"alg.{entry.namespace}.{entry.func_name}"
    category = _read_entry_category(entry)
    review_draft = _load_review_draft(entry)
    return {
        "id": _entry_client_id(entry),
        "registryId": entry.id,
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
        "widgetOverrides": getattr(entry, "widget_overrides", {}) or {},
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
        "reviewKind": review_draft.get("review_kind", "") if review_draft else "",
        "targetPublicCallPrefix": review_draft.get("target_public_call_prefix", "") if review_draft else "",
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
        raise HTTPException(status_code=500, detail=f"保存审核草稿失败：{exc}") from exc


def _delete_review_draft(entry: AlgorithmEntry) -> None:
    """Delete a pending review draft if it exists."""

    try:
        _review_draft_path(entry).unlink(missing_ok=True)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除审核草稿失败：{exc}") from exc


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
        raise HTTPException(status_code=403, detail=f"算法在 {status} 状态下不可调用")


def _ensure_user_callable_status(entry: AlgorithmEntry, request: Request) -> None:
    """Allow published algorithms and the current user's private algorithms."""

    status = _read_entry_publish_status(entry)
    if status == "published":
        return
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            current_user = get_current_user(request)
        except HTTPException as exc:
            raise HTTPException(status_code=401, detail="请先登录后调用私有算法") from exc
        owner_id = getattr(entry, "owner_id", "system")
        if current_user.get("role") == "admin" or owner_id == current_user.get("id"):
            return
    raise HTTPException(status_code=403, detail=f"私有算法仅创建者可调用，当前状态：{status}")


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
        folder = entry_path.parent
        dedicated_folder_names = {entry_path.stem, entry.func_name}
        is_dedicated_algorithm_folder = folder.name in dedicated_folder_names
        if is_dedicated_algorithm_folder:
            paths = [
                file_path.resolve()
                for file_path in sorted(folder.glob("*.py"), key=lambda item: item.name)
                if file_path.name != "__init__.py" and "__pycache__" not in file_path.parts
            ]
        else:
            paths = [entry_path]
            for extra_name in _load_entry_extra_files(entry):
                extra_path = (folder / extra_name).resolve()
                if extra_path.exists() and extra_path.suffix == ".py" and extra_path.name != "__init__.py":
                    paths.append(extra_path)

    paths = sorted(paths, key=lambda item: (item.resolve() != entry_path, item.name))
    files: list[dict[str, Any]] = []
    seen: set[Path] = set()
    for file_path in paths:
        resolved = file_path.resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        try:
            content = resolved.read_text(encoding="utf-8")
        except OSError as exc:
            logger.warning("Cannot read folder file %s: %s", resolved, exc)
            continue
        relative_path = resolved.name if not entry.package_root else resolved.relative_to(Path(entry.package_root)).as_posix()
        files.append(
            {
                "filename": resolved.name,
                "relative_path": relative_path,
                "content": _strip_algo_meta_for_editor(content),
                "is_entry": resolved == entry_path,
                "functions": AstParser.extract_functions(str(resolved)),
            }
        )
    return files


def _entry_extra_files_manifest(entry: AlgorithmEntry) -> Path:
    """Return the sidecar manifest used by legacy flat-file algorithms."""

    return Path(entry.source_file).parent / ".algofiles" / f"{entry.func_name}.json"


def _load_entry_extra_files(entry: AlgorithmEntry) -> list[str]:
    """Load helper files associated with a legacy flat-file algorithm."""

    manifest = _entry_extra_files_manifest(entry)
    if not manifest.exists():
        return []
    try:
        data = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    raw_files = data.get("files") if isinstance(data, dict) else data
    if not isinstance(raw_files, list):
        return []
    files: list[str] = []
    for item in raw_files:
        clean = str(item).strip().replace("\\", "/")
        if clean and "/" not in clean and clean.endswith(".py") and clean != "__init__.py":
            files.append(clean)
    return sorted(set(files))


def _save_entry_extra_files(entry: AlgorithmEntry, files: list[str]) -> None:
    """Persist helper files associated with a legacy flat-file algorithm."""

    clean_files = sorted({
        str(item).strip().replace("\\", "/")
        for item in files
        if str(item).strip().endswith(".py") and "/" not in str(item).strip().replace("\\", "/")
    })
    manifest = _entry_extra_files_manifest(entry)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"files": clean_files}, ensure_ascii=False, indent=2), encoding="utf-8")


def _merge_review_draft_files(entry: AlgorithmEntry, draft_files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge review draft files with physical folder files, preserving helper files."""

    merged: dict[str, dict[str, Any]] = {}
    for item in _folder_files_for_entry(entry):
        key = str(item.get("relative_path") or item.get("filename") or "")
        if key:
            merged[key] = item
    entry_name = Path(entry.source_file).name
    for raw in draft_files:
        if not isinstance(raw, dict):
            continue
        filename = str(raw.get("filename") or raw.get("relative_path") or "").strip().replace("\\", "/")
        if not filename or not filename.endswith(".py") or "/" in filename or filename == "__init__.py":
            continue
        previous = merged.get(filename, {})
        raw_content = str(raw.get("content", previous.get("content", "")))
        merged[filename] = {
            "filename": Path(filename).name,
            "relative_path": filename,
            "content": _strip_algo_meta_for_editor(raw_content),
            "is_entry": filename == entry_name or bool(previous.get("is_entry")),
            "functions": previous.get("functions", []),
        }
    return sorted(merged.values(), key=lambda item: (not bool(item.get("is_entry")), str(item.get("relative_path") or item.get("filename") or "")))


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
        raise HTTPException(status_code=400, detail=f"{field_name} 只能包含字母、数字和下划线，且必须以字母开头")
    return normalized


def _normalize_category(value: str) -> str:
    """Normalize a category or alg.category namespace into registry namespace form."""

    text = value.strip().strip("/")
    if text.startswith("alg."):
        text = text[4:]
    parts = [part for part in text.replace("/", ".").split(".") if part]
    if not parts:
        raise HTTPException(status_code=400, detail="分类不能为空")
    return ".".join(_validate_identifier(part, "category") for part in parts)


def _algo_meta_decorator(
    *,
    zh_name: str,
    zh_description: str,
    zh_tags: list[str],
    version: str,
    input_example: str = "",
    widget_overrides: dict[str, str] | None = None,
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
    if widget_overrides:
        lines.append(f"    widget_overrides={json.dumps(widget_overrides, ensure_ascii=False)},")
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
        raise HTTPException(status_code=400, detail=f"源码中未找到函数定义：{func_name}")

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
        raise HTTPException(status_code=400, detail=f"元数据更新后源码中未找到函数：{func_name}")

    insert_at = adjusted_target.lineno - 1
    decorator_text = _algo_meta_decorator(
        zh_name=str(metadata.get("zh_name") or func_name),
        zh_description=str(metadata.get("zh_description") or ""),
        zh_tags=[str(tag).strip() for tag in metadata.get("zh_tags", []) if str(tag).strip()],
        version=str(metadata.get("version") or "1.0.0"),
        input_example=str(metadata.get("input_example") or ""),
        widget_overrides=metadata.get("widget_overrides") if isinstance(metadata.get("widget_overrides"), dict) else {},
    )
    lines[insert_at:insert_at] = [decorator_text]
    return "\n".join(lines).rstrip() + "\n"


def _entry_meta_payload(entry: AlgorithmEntry) -> dict[str, Any]:
    """Build metadata used by backend-side algo_meta wrapping."""

    return {
        "zh_name": entry.zh_name or entry.func_name,
        "zh_description": entry.zh_description or "",
        "zh_tags": entry.zh_tags or [],
        "version": entry.version or "1.0.0",
        "input_example": entry.input_example or "",
        "widget_overrides": getattr(entry, "widget_overrides", {}) or {},
    }


def _select_meta_function_name(source: str, preferred: str) -> str:
    """Pick the function that should receive backend metadata wrapping."""

    names = _public_function_names(source)
    if preferred in names:
        return preferred
    if names:
        return names[0]
    return preferred


def _upsert_entry_algo_meta(source: str, entry: AlgorithmEntry) -> str:
    """Wrap editable user source with platform metadata before persistence."""

    func_name = _select_meta_function_name(source, entry.func_name)
    return _upsert_algo_meta(source, func_name, _entry_meta_payload(entry))


def _strip_algo_meta_for_editor(source: str) -> str:
    """Remove platform-only algo_meta decorator lines before returning source to editor."""

    try:
        tree = ast.parse(source)
    except SyntaxError:
        return source
    lines = source.splitlines()
    remove_ranges: list[tuple[int, int]] = []
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module == "algo_service.sdk.decorators":
            if node.names and all(alias.name == "algo_meta" for alias in node.names):
                remove_ranges.append((node.lineno - 1, int(getattr(node, "end_lineno", node.lineno))))
            continue
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if _decorator_name(decorator) == "algo_meta":
                remove_ranges.append((decorator.lineno - 1, int(getattr(decorator, "end_lineno", decorator.lineno))))
    for start, end in sorted(remove_ranges, reverse=True):
        del lines[start:end]
    return "\n".join(lines).rstrip() + ("\n" if lines else "")


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


def _write_widget_overrides_to_manifest(manifest_path: Path, widget_overrides: dict[str, str] | None) -> None:
    """Persist manually selected parameter widgets to folder_config/algopack."""

    overrides = {str(key): str(value) for key, value in (widget_overrides or {}).items() if str(key).strip() and str(value).strip()}
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
    except (OSError, json.JSONDecodeError):
        data = {}
    if overrides:
        data["widget_overrides"] = overrides
    else:
        data.pop("widget_overrides", None)
    manifest_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


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
            detail=f"该目录已包含 {existing_kind} 类型的算法，无法添加 {module_kind} 类型",
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
    owner_id = str(config.get("owner_id") or "").strip() or None
    return {
        "namespace": namespace,
        "zh_name": str(config.get("zh_name") or config.get("display_name") or namespace),
        "module_kind": module_kind,
        "path": str(path.parent),
        "count": len(entries),
        "is_algo_folder": is_algo_folder,
        "owner_id": owner_id,
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
        raise HTTPException(status_code=400, detail=f"源码中未找到函数：{old_name}")
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
        raise HTTPException(status_code=500, detail=f"写入版本历史失败：{exc}") from exc


def _normalize_call_namespace(value: str) -> str:
    normalized = value.strip().strip("/")
    if normalized.startswith("alg."):
        normalized = normalized[4:]
    return normalized


def _entry_by_owner(registry: AlgorithmRegistry, algorithm_id: str, owner_id: str | None) -> AlgorithmEntry | None:
    """Find an entry by base id and owner_id."""

    base_id = _normalize_call_namespace(algorithm_id)
    if "@@" in base_id:
        base_id, owner_hint = base_id.split("@@", 1)
        owner_id = owner_id or owner_hint
    for entry in registry.get_all():
        if entry.id == base_id and str(getattr(entry, "owner_id", "system") or "system") == str(owner_id or "system"):
            return entry
    return None


def _entry_from_client_id(registry: AlgorithmRegistry, algorithm_id: str) -> AlgorithmEntry | None:
    """Resolve a public id or private frontend id."""

    normalized = _normalize_call_namespace(algorithm_id)
    return registry.get_by_id(normalized) or registry.get_by_id(algorithm_id)


def _public_conflict_for_entry(registry: AlgorithmRegistry, entry: AlgorithmEntry) -> AlgorithmEntry | None:
    """Return a published public entry using the same callable id."""

    if str(getattr(entry, "owner_id", "system") or "system") == "system":
        return None
    for item in registry.get_all():
        if item.id == entry.id and item.type == entry.type and str(getattr(item, "owner_id", "system") or "system") == "system":
            if _read_entry_publish_status(item) == "published":
                return item
    return None


def _bump_semver(version: str, bump_type: str = "patch") -> str:
    """Bump a semantic version using patch/minor/major semantics."""

    parts = [int(part) if part.isdigit() else 0 for part in str(version or "1.0.0").split(".")[:3]]
    while len(parts) < 3:
        parts.append(0)
    major, minor, patch = parts
    if bump_type == "major":
        return f"{major + 1}.0.0"
    if bump_type == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def _version_bump_options(version: str) -> list[dict[str, str]]:
    """Return version iteration options for submit/review UI."""

    return [
        {"type": "patch", "label": f"补丁版本：{version} → {_bump_semver(version, 'patch')}", "value": _bump_semver(version, "patch")},
        {"type": "minor", "label": f"次版本：{version} → {_bump_semver(version, 'minor')}", "value": _bump_semver(version, "minor")},
        {"type": "major", "label": f"主版本：{version} → {_bump_semver(version, 'major')}", "value": _bump_semver(version, "major")},
    ]


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
        raise HTTPException(status_code=500, detail="审核草稿的 files 字段必须是列表")
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
                    raise HTTPException(status_code=400, detail=f"无效的草稿文件名：{filename}")
                ast.parse(content)
                target = (package_root / filename).resolve()
                if not target.is_relative_to(package_root):
                    raise HTTPException(status_code=400, detail=f"草稿文件路径越界：{filename}")
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
                raise HTTPException(status_code=400, detail="无效的审核草稿文件格式")
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
        raise HTTPException(status_code=500, detail=f"更新包清单失败：{exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"应用审核草稿失败：{exc}") from exc
    refreshed = _entry_by_owner(registry, entry.id, getattr(entry, "owner_id", "system")) or registry.get_by_id(entry.id) or registry.get_by_id(f"{entry.namespace}.{entry.func_name}") or entry
    _delete_review_draft(refreshed)
    return refreshed


def _apply_review_files_to_entry(
    target_entry: AlgorithmEntry,
    files: list[Any],
    metadata: dict[str, Any],
    registry: AlgorithmRegistry,
) -> AlgorithmEntry:
    """Apply reviewed file snapshots to another entry while preserving ownership."""

    if not files:
        return target_entry
    target_root = Path(target_entry.package_root or Path(target_entry.source_file).parent).resolve()
    source_filename = Path(target_entry.source_file).name
    written_names: list[str] = []
    try:
        for index, item in enumerate(files):
            if not isinstance(item, dict):
                continue
            filename = str(item.get("filename") or item.get("relative_path") or "").strip().replace("\\", "/")
            content = str(item.get("content") or "")
            if not filename.endswith(".py") or filename == "__init__.py" or ".." in Path(filename).parts:
                raise HTTPException(status_code=400, detail=f"无效的审核文件名：{filename}")
            ast.parse(content)
            if filename == source_filename or index == 0:
                content = _upsert_algo_meta(
                    content,
                    target_entry.func_name,
                    {
                        "zh_name": str(metadata.get("zh_name") or target_entry.zh_name),
                        "zh_description": str(metadata.get("zh_description") or target_entry.zh_description),
                        "zh_tags": metadata.get("zh_tags") if isinstance(metadata.get("zh_tags"), list) else target_entry.zh_tags,
                        "version": str(metadata.get("version") or target_entry.version),
                        "input_example": str(metadata.get("input_example") or target_entry.input_example),
                    },
                )
            target = (target_root / filename).resolve()
            if not target.is_relative_to(target_root):
                raise HTTPException(status_code=400, detail=f"审核文件路径越界：{filename}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content, encoding="utf-8")
            written_names.append(filename)
        if not target_entry.package_root:
            extras = [name for name in written_names if name != source_filename]
            _save_entry_extra_files(target_entry, extras)
            registry.scan_directory(str(target_root))
        else:
            registry.scan_directory(str(target_root.parent))
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"审核代码存在 Python 语法错误：{exc}") from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"应用版本迭代代码失败：{exc}") from exc
    return _entry_by_owner(registry, target_entry.id, getattr(target_entry, "owner_id", "system")) or registry.get_by_id(target_entry.id) or target_entry


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
        raise HTTPException(status_code=500, detail="无法加载算法模块")

    _clear_cached_modules(module_key)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_key] = module
    try:
        spec.loader.exec_module(module)  # type: ignore[union-attr]
    except Exception as exc:  # noqa: BLE001
        _clear_cached_modules(module_key)
        raise HTTPException(status_code=500, detail=f"算法模块加载失败：{exc}") from exc
    return module


def _preprocess_kwargs(kwargs: dict[str, Any]) -> dict[str, Any]:
    """预处理 kwargs 中的 base64 数据，便于算法直接使用。

    - 自动剥离 Data URL 前缀：data:image/png;base64,xxx -> xxx
    - 对纯 base64 字符串自动补齐 "=" padding
    - list 参数递归执行同样处理
    """

    def _normalize_value(value: Any) -> Any:
        if isinstance(value, list):
            return [_normalize_value(item) for item in value]
        if not isinstance(value, str):
            return value

        text = value
        if text.startswith("data:") and ";base64," in text[:100]:
            comma_idx = text.index(",")
            text = text[comma_idx + 1:]

        compact = "".join(text.split())
        if len(compact) > 100 and re.fullmatch(r"[A-Za-z0-9+/=_-]+", compact):
            remainder = len(compact) % 4
            if remainder:
                compact += "=" * (4 - remainder)
            return compact
        return text

    return {key: _normalize_value(value) for key, value in kwargs.items()}


def _execute_entry(entry: AlgorithmEntry, args: list[Any], kwargs: dict[str, Any]) -> dict[str, Any]:
    kwargs = _preprocess_kwargs(kwargs)
    module = _load_entry_module(entry)
    func = getattr(module, entry.func_name, None)
    if func is None or not callable(func):
        raise HTTPException(status_code=404, detail=f"模块中未找到函数 '{entry.func_name}'")

    started = time.perf_counter()
    try:
        result = func(*args, **kwargs)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "success": True,
            "result": _serialize_result(result),
            "output_hint": infer_output_widget(entry.return_type, result),
            "error": "",
            "elapsed_ms": elapsed_ms,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("Execution error for %s", entry.call_prefix)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        return {
            "success": False,
            "result": None,
            "output_hint": "error",
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


_ALGORITHMS_ROOT = Path(__file__).resolve().parents[2] / "algorithms_root"
_REVIEW_LOG_PATH = _ALGORITHMS_ROOT / ".review_log.json"


def _load_review_log() -> list[dict[str, Any]]:
    """Load the persistent review history log."""
    try:
        if _REVIEW_LOG_PATH.exists():
            data = json.loads(_REVIEW_LOG_PATH.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _save_review_log(log: list[dict[str, Any]]) -> None:
    try:
        _ALGORITHMS_ROOT.mkdir(parents=True, exist_ok=True)
        _REVIEW_LOG_PATH.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError:
        pass


def _upsert_review_log(algorithm_id: str, updates: dict[str, Any]) -> None:
    """Create or update the most recent active (non-terminal) log entry for an algorithm."""
    log = _load_review_log()
    # Find the most recent entry that is still active (not published/rejected already)
    target = next(
        (e for e in reversed(log)
         if e.get("algorithm_id") == algorithm_id and e.get("status") not in ("published", "rejected", "withdrawn")),
        None,
    )
    if target is not None:
        target.update(updates)
    else:
        log.append({"algorithm_id": algorithm_id, **updates})
    _save_review_log(log)


def _visible_entries_for_request(entries: list[AlgorithmEntry], request: Request | None) -> list[AlgorithmEntry]:
    """Filter algorithms to public entries plus the current user's private entries."""

    auth = request.headers.get("Authorization", "") if request else ""
    if not auth.startswith("Bearer "):
        return [entry for entry in entries if getattr(entry, "owner_id", "system") == "system"]
    try:
        current_user = get_current_user(request)
    except HTTPException:
        return [entry for entry in entries if getattr(entry, "owner_id", "system") == "system"]
    user_id = str(current_user.get("id", ""))
    if current_user.get("role") == "admin":
        return entries
    return [
        entry
        for entry in entries
        if getattr(entry, "owner_id", "system") == "system"
        or getattr(entry, "owner_id", "system") == user_id
    ]


@router.get("/algorithms")
async def list_algorithms(
    module_kind: str | None = Query(None, description="Filter by component/template/snippet"),
    registry: AlgorithmRegistry = Depends(get_registry),
    request: Request = None,
) -> dict[str, Any]:
    entries = registry.get_all()
    if module_kind:
        entries = [entry for entry in entries if entry.type == module_kind]
    entries = _visible_entries_for_request(entries, request)
    # Owner-based visibility: draft/rejected items are private to their owner
    auth = (request.headers.get("Authorization", "") if request else "")
    if auth.startswith("Bearer "):
        try:
            current_user = get_current_user(request)
            user_id = current_user["id"]
            is_admin = current_user.get("role") == "admin"

            def _is_visible(e: AlgorithmEntry) -> bool:
                owner = getattr(e, "owner_id", "system")
                # Always show the user's own items
                if owner == user_id:
                    return True
                # System-owned items are always visible
                if owner == "system":
                    return True
                # Another user's item: hide if draft or rejected (private)
                status = _read_entry_publish_status(e)
                if status in ("draft", "rejected"):
                    return False
                # Admin sees reviewing/approved/published; regular users see published only
                return is_admin or status == "published"

            entries = [e for e in entries if _is_visible(e)]
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
    zh_name: str = ""


class UserFolderUpdateRequest(BaseModel):
    """Request body for renaming a user's private category folder."""

    new_folder_name: str
    zh_name: str = ""


def _safe_user_folder_name(value: str) -> str:
    """Validate and normalize a user folder/category path."""

    text = value.strip().strip("/").replace("\\", "/")
    if not text:
        raise HTTPException(status_code=400, detail="文件夹名称不能为空")
    parts = [part.strip() for part in text.split("/") if part.strip()]
    if any(part in {".", ".."} for part in parts):
        raise HTTPException(status_code=400, detail="文件夹路径不合法")
    return "/".join(parts)


def _user_folder_response(folder_dir: Path, user_root: Path) -> dict[str, Any]:
    """Return one user folder response item."""

    config_path = folder_dir / "folder_config.json"
    config: dict[str, Any] = {}
    if config_path.exists():
        try:
            config = json.loads(config_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            config = {}
    rel = folder_dir.relative_to(user_root).as_posix()
    namespace = str(config.get("namespace") or rel.replace("/", ".")).strip()
    return {
        "folder_name": rel,
        "namespace": namespace,
        "zh_name": str(config.get("zh_name") or config.get("display_name") or rel),
        "owner_id": str(config.get("owner_id") or ""),
        "module_kind": normalize_module_kind(config.get("module_kind", config.get("type", "component"))),
        "path": str(folder_dir),
    }


def _write_user_folder_config(folder_dir: Path, namespace: str, user_id: str, zh_name: str = "") -> None:
    """Create or update the folder_config.json for a private user folder."""

    cfg_path = folder_dir / "folder_config.json"
    config: dict[str, Any] = {}
    if cfg_path.exists():
        try:
            config = json.loads(cfg_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            config = {}
    config.update(
        {
            "namespace": namespace,
            "owner_id": user_id,
            "module_kind": "component",
            "type": "component",
            "publish_status": config.get("publish_status", "draft"),
            "published": bool(config.get("published", False)),
        }
    )
    if zh_name:
        config["zh_name"] = zh_name
    cfg_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")


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
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create an empty folder in the current user's directory."""
    current_user = get_current_user(request)
    user_id = current_user["id"]
    folder_name = _safe_user_folder_name(body.folder_name)
    user_root = _ALGORITHMS_ROOT / "users" / user_id
    folder_dir = user_root / folder_name
    folder_dir.mkdir(parents=True, exist_ok=True)
    namespace = folder_name.replace("/", ".")
    _write_user_folder_config(folder_dir, namespace, user_id, body.zh_name.strip())
    registry.scan_directory(str(user_root))
    return {"success": True, "folder": _user_folder_response(folder_dir, user_root)}


@router.get("/user/folders")
async def list_user_folders(
    request: Request,
) -> dict[str, Any]:
    """List the current user's private category folders."""

    current_user = get_current_user(request)
    user_id = current_user["id"]
    user_root = _ALGORITHMS_ROOT / "users" / user_id
    folders: list[dict[str, Any]] = []
    if user_root.exists():
        for cfg_path in sorted(user_root.rglob("folder_config.json")):
            folder_dir = cfg_path.parent
            try:
                config = json.loads(cfg_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                config = {}
            if str(config.get("owner_id") or "") != user_id:
                continue
            if config.get("name"):
                continue
            folders.append(_user_folder_response(folder_dir, user_root))
    return {"success": True, "count": len(folders), "folders": folders}


@router.patch("/user/folders/{folder_name:path}")
async def rename_user_folder(
    folder_name: str,
    body: UserFolderUpdateRequest,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Rename the current user's private category folder."""

    current_user = get_current_user(request)
    user_id = current_user["id"]
    user_root = _ALGORITHMS_ROOT / "users" / user_id
    old_name = _safe_user_folder_name(folder_name)
    new_name = _safe_user_folder_name(body.new_folder_name)
    old_dir = (user_root / old_name).resolve()
    new_dir = (user_root / new_name).resolve()
    if not old_dir.is_relative_to(user_root.resolve()) or not new_dir.is_relative_to(user_root.resolve()):
        raise HTTPException(status_code=400, detail="文件夹路径不合法")
    if not old_dir.exists():
        raise HTTPException(status_code=404, detail=f"文件夹不存在：{old_name}")
    if new_dir.exists() and new_dir != old_dir:
        raise HTTPException(status_code=409, detail=f"目标文件夹已存在：{new_name}")
    try:
        for py_file in old_dir.rglob("*.py"):
            registry.unregister_by_file(str(py_file))
        if new_dir != old_dir:
            new_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_dir), str(new_dir))
        old_namespace = old_name.replace("/", ".")
        new_namespace = new_name.replace("/", ".")
        for cfg_path in new_dir.rglob("folder_config.json"):
            try:
                config = json.loads(cfg_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                config = {}
            if str(config.get("owner_id") or "") != user_id:
                continue
            current_ns = str(config.get("namespace") or "")
            if current_ns == old_namespace or current_ns.startswith(f"{old_namespace}."):
                config["namespace"] = new_namespace + current_ns[len(old_namespace) :]
            elif cfg_path.parent == new_dir:
                config["namespace"] = new_namespace
            if cfg_path.parent == new_dir and body.zh_name:
                config["zh_name"] = body.zh_name
            cfg_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        if not (new_dir / "folder_config.json").exists():
            _write_user_folder_config(new_dir, new_namespace, user_id, body.zh_name)
        registry.scan_directory(str(user_root))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"重命名文件夹失败：{exc}") from exc
    return {"success": True, "folder": _user_folder_response(new_dir, user_root)}


@router.delete("/user/folders/{folder_name:path}")
async def delete_user_folder(
    folder_name: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Delete the current user's private category folder and its contents."""

    current_user = get_current_user(request)
    user_id = current_user["id"]
    user_root = _ALGORITHMS_ROOT / "users" / user_id
    safe_name = _safe_user_folder_name(folder_name)
    folder_dir = (user_root / safe_name).resolve()
    if not folder_dir.is_relative_to(user_root.resolve()):
        raise HTTPException(status_code=400, detail="文件夹路径不合法")
    if not folder_dir.exists():
        raise HTTPException(status_code=404, detail=f"文件夹不存在：{safe_name}")
    try:
        for py_file in folder_dir.rglob("*.py"):
            registry.unregister_by_file(str(py_file))
        shutil.rmtree(folder_dir)
        registry.scan_directory(str(user_root))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除文件夹失败：{exc}") from exc
    return {"success": True, "deleted": safe_name}


@router.get("/algorithms/search")
async def search_algorithms(
    prefix: str | None = Query(None, description="前缀搜索，如 alg.statistics"),
    keyword: str | None = Query(None, description="中文关键词搜索"),
    namespace: str | None = Query(None, description="命名空间过滤"),
    type: str | None = Query(None, description="类型过滤 component/snippet"),
    module_kind: str | None = Query(None, description="Filter by component/template/snippet"),
    registry: AlgorithmRegistry = Depends(get_registry),
    request: Request = None,
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
    entries = _visible_entries_for_request(entries, request)

    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}


@router.post("/algorithms/{algorithm_id:path}/publish-as-component")
async def publish_template_as_component(
    algorithm_id: str,
    payload: PublishAsComponentRequest,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Copy a template directory and register the copy as a component draft."""

    # Determine current user for ownership checks (upsert support)
    current_user_id: str | None = None
    try:
        u = get_current_user(request)
        current_user_id = u.get("id")
    except Exception:
        pass

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="只有算法模板可以发布为组件")

    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="函数名不能为空")
    new_namespace_raw = payload.new_namespace.strip()
    if not new_namespace_raw.startswith("alg."):
        raise HTTPException(status_code=400, detail="new_namespace 必须以 alg. 开头")
    normalized_namespace = _normalize_call_namespace(new_namespace_raw)
    namespace_parts = [part for part in normalized_namespace.split(".") if part]
    if not namespace_parts:
        raise HTTPException(status_code=400, detail="new_namespace 格式应为 alg.<分类>")

    source_dir = Path(entry.package_root) if entry.package_root else Path(entry.source_file).parent
    source_resolved = source_dir.resolve()
    if current_user_id:
        # User-owned: place in user's private directory to preserve ownership
        target_dir = _ALGORITHMS_ROOT / "users" / current_user_id / Path(*namespace_parts) / name
    else:
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
    # Upsert: if directory already exists and the current user owns it, allow update in-place
    is_upsert = False
    if target_dir.exists():
        cfg_path = target_dir / "folder_config.json"
        existing_owner: str | None = None
        try:
            cfg_data = json.loads(cfg_path.read_text(encoding="utf-8"))
            existing_owner = cfg_data.get("owner_id")
        except Exception:
            pass
        if current_user_id and existing_owner == current_user_id:
            is_upsert = True
        else:
            raise HTTPException(status_code=409, detail="同名组件已存在，请使用不同的函数名")

    manifest_name = "algopack.json" if entry.package_root else "folder_config.json"
    manifest_path = target_dir / manifest_name

    dir_created = False
    try:
        if entry.package_root:
            if not is_upsert:
                shutil.copytree(source_dir, target_dir)
                dir_created = True
        else:
            if not is_upsert:
                target_dir.mkdir(parents=True, exist_ok=False)
                dir_created = True
            if is_upsert:
                manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {}
            else:
                source_manifest = source_dir / "folder_config.json"
                manifest = json.loads(source_manifest.read_text(encoding="utf-8")) if source_manifest.exists() else {}
            target_func_name = _validate_identifier(name, "component name")
            source = Path(entry.source_file).read_text(encoding="utf-8")
            if payload.code:
                source = payload.code
            if target_func_name != entry.func_name:
                # If payload.code is provided, find what function name is actually in it
                src_tree = ast.parse(source)
                src_public = [
                    node.name
                    for node in src_tree.body
                    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                    and not node.name.startswith("_")
                ]
                if target_func_name not in src_public:
                    # Rename from either entry.func_name or the first public function found
                    old_name = entry.func_name if entry.func_name in src_public else (src_public[0] if src_public else None)
                    if old_name is None:
                        raise HTTPException(status_code=400, detail="代码中未找到可重命名的公共函数")
                    source = _rename_function_in_source(source, old_name, target_func_name)
            source = _upsert_algo_meta(
                source,
                target_func_name,
                {
                    "zh_name": payload.zh_name or entry.zh_name or target_func_name,
                    "zh_description": payload.description or entry.zh_description,
                    "zh_tags": payload.zh_tags or entry.zh_tags,
                    "version": payload.version or "1.0.0",
                    "input_example": payload.input_example or entry.input_example,
                    "widget_overrides": payload.widget_overrides or getattr(entry, "widget_overrides", {}) or {},
                },
            )
            (target_dir / f"{target_func_name}.py").write_text(source, encoding="utf-8")
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        if not manifest_path.exists():
            raise HTTPException(status_code=500, detail=f"组件目录中未找到 {manifest_name} 文件")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["name"] = name
        manifest["zh_name"] = payload.zh_name
        manifest["namespace"] = normalized_namespace
        manifest["version"] = payload.version or "1.0.0"
        manifest["category"] = payload.category
        manifest["description"] = payload.description
        manifest["zh_description"] = payload.description
        manifest["widget_overrides"] = payload.widget_overrides or getattr(entry, "widget_overrides", {}) or {}
        manifest["module_kind"] = "component"
        manifest["published"] = False
        manifest["publish_status"] = "draft"
        if current_user_id:
            manifest["owner_id"] = current_user_id
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        scan_root = str(_ALGORITHMS_ROOT / "users" / current_user_id) if current_user_id else str(target_dir.parent)
        registry.scan_directory(scan_root)
    except HTTPException:
        if dir_created and target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)
        raise
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        if dir_created and target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"更新组件清单失败：{exc}") from exc

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
        raise HTTPException(status_code=500, detail="组件目录已创建但无法注册，请刷新页面重试")

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
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a single-file component or template from plain user code."""

    module_kind = payload.module_kind.strip().lower() or "component"
    if module_kind not in {"component", "template"}:
        raise HTTPException(status_code=400, detail="module_kind 必须为 component 或 template")

    func_name = _validate_identifier(payload.name, "name")
    namespace = _normalize_category(payload.category)

    # Determine owner: if a user is authenticated, create in their private directory
    # so they retain ownership and can submit the algorithm for review later.
    current_user_id: str | None = None
    try:
        u = get_current_user(request)
        current_user_id = u.get("id")
    except Exception:
        pass

    if current_user_id:
        # Create algorithm in user's private directory to preserve ownership
        user_algo_dir = _ALGORITHMS_ROOT / "users" / current_user_id / namespace / func_name
        target_folder = user_algo_dir
        target_file = target_folder / f"{func_name}.py"
    else:
        root = _default_algorithm_root(registry)
        target_folder = root.joinpath(*namespace.split("."))
        target_file = target_folder / f"{func_name}.py"

    if target_file.exists():
        # Allow upsert if the current user already owns this algorithm
        owner_cfg = target_folder / "folder_config.json"
        existing_owner_id: str | None = None
        existing_publish_status: str = "draft"
        try:
            existing_cfg = json.loads(owner_cfg.read_text(encoding="utf-8"))
            existing_owner_id = existing_cfg.get("owner_id")
            existing_publish_status = existing_cfg.get("publish_status", "draft")
        except Exception:
            pass
        if current_user_id and existing_owner_id == current_user_id:
            # User owns this private algorithm → allow overwrite (upsert)
            pass
        elif not existing_owner_id or existing_owner_id == "system":
            # The file belongs to a public (system-owned) algorithm at the user's path.
            # This happens when the user originally created this algorithm and it was published
            # (owner_id was removed during publish but the folder was not moved to global location).
            # We need a separate private folder for the new draft.
            draft_folder = target_folder.parent / f"_draft_{func_name}"
            target_folder = draft_folder
            target_file = draft_folder / f"{func_name}.py"
            # If draft folder also already exists and is owned by this user, allow overwrite
            if target_file.exists():
                draft_cfg_path = draft_folder / "folder_config.json"
                draft_owner: str | None = None
                try:
                    draft_cfg = json.loads(draft_cfg_path.read_text(encoding="utf-8"))
                    draft_owner = draft_cfg.get("owner_id")
                except Exception:
                    pass
                if not (current_user_id and draft_owner == current_user_id):
                    raise HTTPException(status_code=409, detail=f"算法文件已存在：{func_name}，请换一个函数名")
        else:
            raise HTTPException(status_code=409, detail=f"算法文件已存在：{target_file.name}，请换一个函数名")

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
        _write_widget_overrides_to_manifest(target_folder / "folder_config.json", payload.widget_overrides)
        # Write owner_id into folder_config.json when user is authenticated
        if current_user_id:
            cfg_path = target_folder / "folder_config.json"
            try:
                cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
            except Exception:
                cfg = {}
            cfg["owner_id"] = current_user_id
            cfg_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        source = _upsert_algo_meta(
            payload.code,
            func_name,
            {
                "zh_name": payload.zh_name or func_name,
                "zh_description": payload.zh_description,
                "zh_tags": payload.zh_tags,
                "version": payload.version or "1.0.0",
                "input_example": payload.input_example or "",
                "widget_overrides": payload.widget_overrides,
            },
        )
        target_file.write_text(source, encoding="utf-8")
        if payload.blocks and module_kind == "template":
            blocks_path = target_folder / f"{func_name}.blocks.json"
            blocks_payload = {"schema_version": "1.0", "blocks": payload.blocks}
            blocks_path.write_text(json.dumps(blocks_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        scan_root = str(_ALGORITHMS_ROOT / "users" / current_user_id) if current_user_id else str(target_folder)
        registry.scan_directory(scan_root)
    except (OSError, SyntaxError) as exc:
        raise HTTPException(status_code=500, detail=f"创建算法失败：{exc}") from exc

    entry = _entry_by_owner(registry, f"{namespace}.{func_name}", current_user_id or "system") or registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=500, detail="算法文件已创建但无法注册，请刷新页面重试")
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
    with_mine: bool = Query(False, description="Include caller's own private categories"),
    request: Request = None,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """List algorithm categories backed by folder_config.json.

    By default only public categories (no owner_id) are returned.
    Pass with_mine=true to also include the authenticated user's own private categories.
    """

    categories = [_category_from_config(path, registry) for path in _category_config_paths(registry)]
    if module_kind:
        categories = [item for item in categories if item["module_kind"] == module_kind]
    # Only include top-level categories: must have a namespace and must NOT be
    # an algorithm-level folder_config (those have a "name" field = func name).
    categories = [item for item in categories if item.get("namespace") and not item.get("is_algo_folder")]

    # Determine caller identity for private-category filtering
    caller_id: str | None = None
    if request:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            try:
                caller_id = get_current_user(request).get("id")
            except Exception:
                pass

    # Filter: keep only public categories (no owner_id), plus optionally the
    # caller's own private categories when with_mine=True.
    def _is_visible(item: dict) -> bool:
        oid = item.get("owner_id")
        if not oid:
            return True  # public category
        if with_mine and caller_id and oid == caller_id:
            return True  # caller's own private category
        return False

    categories = [item for item in categories if _is_visible(item)]

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
        raise HTTPException(status_code=409, detail=f"分类已存在：{name}")
    try:
        target.mkdir(parents=True)
        _write_folder_config(target, name, module_kind, "draft")
        config_path = target / "folder_config.json"
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["zh_name"] = payload.zh_name.strip() or name
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.scan_directory(str(target))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"创建分类失败：{exc}") from exc

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
        raise HTTPException(status_code=404, detail=f"分类不存在：{namespace}")
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"读取分类配置失败：{exc}") from exc

    old_namespace = str(config.get("namespace") or _normalize_category(namespace))
    new_namespace = _normalize_category(payload.new_namespace) if payload.new_namespace else old_namespace
    if payload.zh_name is not None:
        config["zh_name"] = payload.zh_name.strip() or new_namespace
    config["namespace"] = new_namespace

    old_folder = config_path.parent
    root = Path(registry._find_watch_root(str(old_folder)) or _default_algorithm_root(registry)).resolve()  # noqa: SLF001
    target_folder = root.joinpath(*new_namespace.split("."))
    if target_folder != old_folder.resolve() and target_folder.exists():
        raise HTTPException(status_code=409, detail=f"目标分类已存在：{new_namespace}")

    try:
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        if target_folder != old_folder.resolve():
            target_folder.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_folder), str(target_folder))
            _rescan_all(registry)
        else:
            _rescan_all(registry)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"更新分类失败：{exc}") from exc

    category = _category_from_config(target_folder / "folder_config.json", registry)
    sse_manager.broadcast({"event": "updated", "category": category, "algorithms": registry.to_completion_json()})
    return {"success": True, "category": category}


@router.delete("/categories/{namespace:path}")
async def delete_category(
    namespace: str,
    request: Request,
    action: str = Query("delete", description="'delete' to remove all algorithms; 'move' to move them to target"),
    target_namespace: str = Query("", alias="target", description="Target category namespace when action=move"),
    module_kind: str | None = Query(None),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Delete a category. Admin only.

    action=delete  → permanently delete the category folder and all algorithms inside.
    action=move    → move all algorithms to target_namespace, then delete the (now empty) category.
    """
    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="只有管理员可以删除分类")

    config_path = _find_category_config(registry, namespace, module_kind)
    if config_path is None:
        raise HTTPException(status_code=404, detail=f"分类不存在：{namespace}")

    category_folder = config_path.parent

    if action == "move":
        # Find the target folder
        if not target_namespace:
            raise HTTPException(status_code=400, detail="移动操作需要指定目标命名空间（target 参数）")
        target_config = _find_category_config(registry, target_namespace, module_kind)
        if target_config is None:
            raise HTTPException(status_code=404, detail=f"目标分类不存在：{target_namespace}")
        target_folder = target_config.parent
        try:
            # Move all algorithm files (and subdirectories) into the target folder
            for item in category_folder.iterdir():
                if item.name == "folder_config.json":
                    continue  # keep source config in place until we delete the whole folder
                dest = target_folder / item.name
                if dest.exists():
                    # Avoid collision: suffix with source namespace
                    dest = target_folder / f"{namespace.replace('.', '_')}_{item.name}"
                shutil.move(str(item), str(dest))
            # Now delete the (empty) source folder
            shutil.rmtree(str(category_folder))
            _rescan_all(registry)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"移动分类失败：{exc}") from exc
    elif action == "delete":
        try:
            shutil.rmtree(str(category_folder))
            _rescan_all(registry)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"删除分类失败：{exc}") from exc
    else:
        raise HTTPException(status_code=400, detail="action 参数必须为 delete 或 move")

    sse_manager.broadcast({"event": "updated", "algorithms": registry.to_completion_json()})
    return {"success": True, "deleted": namespace, "action": action}


@router.post("/categories/{namespace:path}/subcategories")
async def create_subcategory(
    namespace: str,
    payload: CategoryCreateRequest,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create an empty child category under an existing category."""

    parent_config = _find_category_config(registry, namespace, payload.module_kind)
    if parent_config is None:
        raise HTTPException(status_code=404, detail=f"父分类不存在：{namespace}")
    child_name = _validate_identifier(payload.name, "name")
    parent_namespace = _normalize_category(namespace)
    child_namespace = f"{parent_namespace}.{child_name}"
    parent_folder = parent_config.parent
    child_folder = parent_folder / child_name
    if child_folder.exists():
        raise HTTPException(status_code=409, detail=f"子分类已存在：{child_namespace}")
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
        raise HTTPException(status_code=500, detail=f"创建子分类失败：{exc}") from exc

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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
async def get_algorithm(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    if algorithm_id.endswith("/submit-check"):
        base_id = algorithm_id[: -len("/submit-check")]
        current_user = get_current_user(request)
        entry_for_check = _entry_from_client_id(registry, base_id)
        if entry_for_check is None:
            raise HTTPException(status_code=404, detail=f"算法不存在：{base_id}")
        if current_user.get("role") != "admin" and getattr(entry_for_check, "owner_id", "system") != current_user["id"]:
            raise HTTPException(status_code=403, detail="无权提交他人的算法审核")
        public_entry = _public_conflict_for_entry(registry, entry_for_check)
        if public_entry is None:
            return {"success": True, "hasConflict": False, "isVersionIteration": False}
        return {
            "success": True,
            "hasConflict": True,
            "isVersionIteration": True,
            "publicAlgorithm": _entry_dict(public_entry),
            "baseVersion": public_entry.version,
            "versionOptions": _version_bump_options(public_entry.version),
            "message": "该命名空间已被公有算法占用，可作为现有公有算法的版本迭代提交审核；如果不是版本迭代，请先修改命名空间。",
        }
    if algorithm_id.endswith("/review-draft"):
        base_id = algorithm_id[: -len("/review-draft")]
        entry_for_draft = registry.get_by_id(_normalize_call_namespace(base_id)) or registry.get_by_id(base_id)
        if entry_for_draft is None:
            raise HTTPException(status_code=404, detail=f"算法不存在：{base_id}")
        draft = _load_review_draft(entry_for_draft)
        if draft is None:
            return {"success": True, "exists": False, "draft": None}
        return {"success": True, "exists": True, "draft": draft}
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")

    metadata = {
        "zh_name": payload.zh_name if payload.zh_name is not None else entry.zh_name,
        "zh_description": payload.zh_description if payload.zh_description is not None else entry.zh_description,
        "zh_tags": payload.zh_tags if payload.zh_tags is not None else entry.zh_tags,
        "version": payload.version if payload.version is not None else entry.version,
        "input_example": payload.input_example if payload.input_example is not None else entry.input_example,
        "widget_overrides": payload.widget_overrides if payload.widget_overrides is not None else (getattr(entry, "widget_overrides", {}) or {}),
    }

    if entry.package_id:
        updates: dict[str, Any] = {
            "zh_name": metadata["zh_name"],
            "zh_description": metadata["zh_description"],
            "zh_tags": metadata["zh_tags"],
            "version": metadata["version"],
            "input_example": metadata["input_example"],
            "widget_overrides": metadata["widget_overrides"],
        }
        if payload.namespace:
            normalized = _normalize_call_namespace(payload.namespace)
            parts = [part for part in normalized.split(".") if part]
            if len(parts) < 2 or ".".join(parts[:-1]) != entry.namespace:
                raise HTTPException(status_code=400, detail="算法包的分类由其 algopack.json 决定，不可在此修改")
            if parts[-1] != entry.func_name:
                raise HTTPException(status_code=400, detail="算法包导出函数重命名不支持此操作")
        package = registry.update_package_manifest(entry.package_id, updates)
        updated = next((item for item in registry.get_by_namespace(package.namespace) if item.func_name == entry.func_name), None)
        if updated is None:
            raise HTTPException(status_code=500, detail="元数据已更新但无法重新加载算法，请刷新页面")
        return {"success": True, "algorithm": _entry_dict(updated)}

    source_path = Path(entry.source_file).resolve()
    target_namespace = entry.namespace
    target_func_name = entry.func_name
    if payload.namespace:
        normalized = _normalize_call_namespace(payload.namespace)
        parts = [part for part in normalized.split(".") if part]
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="namespace 格式应为 alg.<分类>.<函数名>")
        target_namespace = ".".join(parts[:-1])
        if target_namespace != entry.namespace:
            raise HTTPException(status_code=400, detail="分类命名空间由算法所在目录决定，请直接移动目录")
        target_func_name = _validate_identifier(parts[-1], "function name")

    # Determine target file location.
    # When the function name is not changing (most metadata updates), we always
    # update the file in-place.  Recomputing the target path from _find_watch_root
    # would return the GLOBAL algorithms_root for private algos (because it is
    # registered first), causing the code to incorrectly target the public algo's
    # path and raise a 409 conflict.
    is_rename = target_func_name != entry.func_name
    if not is_rename:
        target_folder = source_path.parent
        target_file = source_path
    else:
        is_folder_based = source_path.parent.name == entry.func_name
        if is_folder_based:
            # Folder-based algo: rename means a new sibling subfolder
            target_folder = source_path.parent.parent / target_func_name
        else:
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
        _write_widget_overrides_to_manifest(target_folder / "folder_config.json", metadata["widget_overrides"])
        if target_file != source_path and target_file.exists():
            raise HTTPException(status_code=409, detail=f"目标算法文件已存在：{target_file}")
        _ensure_folder_kind_compatible(target_folder, entry.type)
        target_file.write_text(updated_source, encoding="utf-8")
        if target_file != source_path:
            source_path.unlink()
            registry.unregister_by_file(str(source_path))
        registry.rescan_file(str(target_file))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"更新元数据失败：{exc}") from exc

    owner_id = str(getattr(entry, "owner_id", "system") or "system").strip()
    base_new_id = f"{target_namespace}.{target_func_name}"
    if owner_id and owner_id != "system":
        updated = registry.get_by_id(f"{base_new_id}@@{owner_id}") or registry.get_by_id(base_new_id)
    else:
        updated = registry.get_by_id(base_new_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="元数据已更新但无法重新加载算法，请刷新页面")
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
            raise HTTPException(status_code=404, detail=f"算法不存在：{base_id}")
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
                raise HTTPException(status_code=500, detail=f"恢复状态失败：{exc}") from exc
        _delete_review_draft(entry_for_draft)
        registry.scan_directory(str(config_path.parent.parent))
        refreshed = registry.get_by_id(entry_for_draft.id) or entry_for_draft
        sse_manager.broadcast({"event": "updated", "file": str(config_path), "algorithms": registry.to_completion_json()})
        return {"success": True, "algorithm": _entry_dict(refreshed)}

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权删除他人的算法")
    if entry.package_id:
        package_root = Path(entry.package_root or "").resolve()
        if not package_root.exists():
            raise HTTPException(status_code=404, detail=f"算法包目录不存在：{package_root}")
        root = Path(registry._find_watch_root(str(package_root)) or _default_algorithm_root(registry)).resolve()  # noqa: SLF001
        if not package_root.is_relative_to(root) or package_root == root:
            raise HTTPException(status_code=400, detail="不允许删除算法根目录外的算法包")
        try:
            shutil.rmtree(package_root)
            registry.scan_directory(str(root))
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"删除算法包失败：{exc}") from exc
        sse_manager.broadcast({"event": "updated", "file": str(package_root), "algorithms": registry.to_completion_json()})
        return {"success": True, "deleted": entry.id}
    source_path = Path(entry.source_file).resolve()
    try:
        _delete_review_draft(entry)
        source_path.unlink(missing_ok=True)
        registry.unregister_by_file(str(source_path))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除算法失败：{exc}") from exc
    sse_manager.broadcast({"event": "updated", "file": str(source_path), "algorithms": registry.to_completion_json()})
    return {"success": True, "deleted": entry.id}


@router.get("/algorithm-source/{algorithm_id:path}")
async def get_algorithm_source(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    source_path = Path(entry.source_file)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"源文件不存在：{source_path}")
    # For published/reviewing/rejected algorithms, return draft content if available
    review_draft = _load_review_draft(entry)
    if review_draft and review_draft.get("files"):
        draft_files = review_draft["files"]
        if not entry.package_id:
            # Treat every algorithm as an editable folder. Draft files override
            # physical files, but helper files created after the draft remain visible.
            draft_folder_files = _merge_review_draft_files(entry, draft_files)
            entry_file = next((item for item in draft_folder_files if item.get("is_entry")), None) or (draft_folder_files[0] if draft_folder_files else None)
            draft_source = str((entry_file or {}).get("content") or source_path.read_text(encoding="utf-8"))
            return {
                "success": True,
                "algorithm": _entry_dict(entry),
                "source": _strip_algo_meta_for_editor(draft_source),
                "source_file": str(source_path),
                "folder_files": draft_folder_files,
                "is_draft_mode": True,
            }
    return {
        "success": True,
        "algorithm": _entry_dict(entry),
        "source": _strip_algo_meta_for_editor(source_path.read_text(encoding="utf-8")),
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    payload = await request.json()
    files = payload.get("files", [])
    if not isinstance(files, list) or not files:
        raise HTTPException(status_code=400, detail="files 字段必须是非空列表")
    normalized_files: list[dict[str, str]] = []
    for item in files:
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail="每个文件条目必须是对象")
        filename = str(item.get("filename") or item.get("relative_path") or "").strip()
        content = str(item.get("content") or "")
        if not filename.endswith(".py") or filename == "__init__.py" or ".." in Path(filename).parts:
            raise HTTPException(status_code=400, detail=f"无效的 Python 文件名：{filename}")
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
            raise HTTPException(status_code=500, detail=f"更新算法状态失败：{exc}") from exc
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
    refreshed = _entry_by_owner(registry, entry.id, getattr(entry, "owner_id", "system")) or registry.get_by_id(entry.id) or entry
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
    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权提交他人的算法审核")
    current = _read_entry_publish_status(entry)
    if current not in ("draft", "rejected", "published"):
        raise HTTPException(status_code=400, detail=f"当前状态为 {current}，不允许提交审核")
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        body = {}
    existing = _load_review_draft(entry) or {}
    # For published algorithms with no draft, snapshot current files
    if not existing.get("files"):
        snap_files = _folder_files_for_entry(entry)
        existing["files"] = [{"filename": f["filename"], "relative_path": f["relative_path"], "content": f["content"]} for f in snap_files]
    public_entry = _public_conflict_for_entry(registry, entry)
    is_version_iteration = bool(body.get("is_version_iteration"))
    if public_entry is not None and not is_version_iteration:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "namespace_conflict",
                "message": "该命名空间已被公有算法占用；如果不是版本迭代，请先修改命名空间。",
                "public_algorithm": _entry_dict(public_entry),
                "version_options": _version_bump_options(public_entry.version),
            },
        )
    bump_type = str(body.get("version_bump_type") or "patch")
    version_bump = str(body.get("version_bump") or "")
    if public_entry is not None and not version_bump:
        version_bump = _bump_semver(public_entry.version, bump_type)

    draft: dict[str, Any] = {
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": existing.get("base_status") or current,
        "status": "reviewing",
        "review_kind": "version_iteration" if public_entry is not None else "new_publish",
        "target_public_id": public_entry.id if public_entry is not None else "",
        "target_public_call_prefix": public_entry.call_prefix if public_entry is not None else "",
        "base_public_version": public_entry.version if public_entry is not None else "",
        "version_bump_type": bump_type,
        "version_bump": version_bump,
        "metadata": body.get("metadata") if isinstance(body.get("metadata"), dict) else {},
        "files": existing["files"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_review_draft(entry, draft)
    refreshed = _update_publish_status(entry, "reviewing", registry)
    _upsert_review_log(
        _entry_client_id(refreshed),
        {
            "name": refreshed.zh_name or refreshed.func_name,
            "call_prefix": refreshed.call_prefix,
            "owner_id": getattr(refreshed, "owner_id", "system"),
            "review_kind": draft["review_kind"],
            "target_public_call_prefix": draft.get("target_public_call_prefix", ""),
            "status": "reviewing",
            "submitted_at": draft["updated_at"],
            "approved_at": None,
            "published_at": None,
            "rejected_at": None,
            "reject_reason": "",
            "version_bump": draft.get("version_bump", ""),
        },
    )
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
    """Approve a review and immediately publish (reviewing → published)."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可审批算法")
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    current = _read_entry_publish_status(entry)
    if current not in ("reviewing", "draft"):
        raise HTTPException(status_code=400, detail=f"当前状态为 {current}，不允许审批")
    draft = _load_review_draft(entry)
    now_iso = datetime.now(timezone.utc).isoformat()
    if draft and draft.get("review_kind") == "version_iteration":
        try:
            body: dict[str, Any] = await request.json()
        except Exception:
            body = {}
        bump_type = str(body.get("version_bump_type") or draft.get("version_bump_type") or "patch")
        base_version = str(draft.get("base_public_version") or entry.version or "1.0.0")
        version_bump = str(body.get("version_bump") or draft.get("version_bump") or _bump_semver(base_version, bump_type))
        metadata = draft.get("metadata") if isinstance(draft.get("metadata"), dict) else {}
        metadata["version"] = version_bump
        draft["metadata"] = metadata
        draft["version_bump_type"] = bump_type
        draft["version_bump"] = version_bump
        draft["approved_at"] = now_iso
        _save_review_draft(entry, draft)
    # Auto-publish immediately — no separate "正式发布" step required
    client_id = _entry_client_id(entry)
    published = await _do_publish_algorithm(entry, registry)
    _upsert_review_log(
        client_id,
        {"status": "published", "approved_at": now_iso, "published_at": now_iso},
    )
    return {"success": True, "algorithm": _entry_dict(published), "autoPublished": True}


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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
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
    _upsert_review_log(
        _entry_client_id(refreshed),
        {"status": "rejected", "rejected_at": existing["updated_at"], "reject_reason": reason},
    )
    return {"success": True, "algorithm": _entry_dict(refreshed)}


@router.post("/algorithms/{algorithm_id:path}/re-review")
async def re_review_algorithm(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Undo a rejection and put the algorithm back into reviewing state (rejected → reviewing)."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    current = _read_entry_publish_status(entry)
    if current != "rejected":
        raise HTTPException(status_code=400, detail=f"当前状态为 {current}，不允许重新审评")
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    result = await _do_publish_algorithm(entry, registry)
    return {"success": True, "algorithm": _entry_dict(result)}


async def _do_publish_algorithm(
    entry: AlgorithmEntry,
    registry: AlgorithmRegistry,
) -> AlgorithmEntry:
    """Core publish logic shared by approve (auto-publish) and publish endpoints."""

    draft = _load_review_draft(entry)
    if draft and draft.get("review_kind") == "version_iteration":
        target_public_id = str(draft.get("target_public_id") or entry.id)
        public_entry = _entry_by_owner(registry, target_public_id, "system") or registry.get_by_id(target_public_id)
        if public_entry is None:
            raise HTTPException(status_code=404, detail="没有找到要迭代的公有算法")
        metadata = draft.get("metadata") if isinstance(draft.get("metadata"), dict) else {}
        if draft.get("version_bump"):
            metadata["version"] = str(draft.get("version_bump"))
        public_entry = _apply_review_files_to_entry(public_entry, draft.get("files", []), metadata, registry)
        public_entry = _update_publish_status(public_entry, "published", registry)
        _delete_review_draft(entry)
        # Delete the private draft entry (no longer needed after version iteration)
        try:
            if getattr(entry, "package_root", None):
                pkg_root = Path(entry.package_root).resolve()
                if pkg_root.exists():
                    shutil.rmtree(pkg_root, ignore_errors=True)
                registry.scan_directory(str(pkg_root.parent))
            else:
                src = Path(entry.source_file).resolve()
                src.unlink(missing_ok=True)
                registry.unregister_by_file(str(src))
        except Exception:
            pass  # Non-fatal: public entry already published
        _append_entry_version(public_entry, "version.iterated", note=f"Version iteration from {entry.call_prefix}")
        return public_entry
    if draft and draft.get("files"):
        entry = _apply_review_draft(entry, registry)
    # If private algorithm (has owner_id), promote to public.
    owner_id = getattr(entry, "owner_id", None) or "system"
    if owner_id != "system":
        config_path = _entry_config_path(entry)
        if config_path.exists():
            try:
                current_folder = config_path.parent
                namespace_parts = entry.namespace.split(".")
                global_folder = _ALGORITHMS_ROOT.joinpath(*namespace_parts, entry.func_name)
                moved = False
                if not global_folder.exists() and current_folder != global_folder:
                    try:
                        global_folder.parent.mkdir(parents=True, exist_ok=True)
                        for old_file in current_folder.glob("*.py"):
                            registry.unregister_by_file(str(old_file))
                        shutil.move(str(current_folder), str(global_folder))
                        new_config_path = global_folder / "folder_config.json"
                        cfg = json.loads(new_config_path.read_text(encoding="utf-8"))
                        cfg.pop("owner_id", None)
                        new_config_path.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
                        registry.scan_directory(str(global_folder.parent))
                        entry = registry.get_by_id(entry.id) or entry
                        moved = True
                    except OSError:
                        moved = False
                if not moved:
                    config = json.loads(config_path.read_text(encoding="utf-8"))
                    config.pop("owner_id", None)
                    config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
                    registry.scan_directory(str(config_path.parent.parent))
                    entry = registry.get_by_id(entry.id) or entry
            except (OSError, json.JSONDecodeError) as exc:
                raise HTTPException(status_code=500, detail=f"发布算法失败（无法移除私有标记）: {exc}") from exc
    return _update_publish_status(entry, "published", registry)


@router.get("/review-log")
async def get_review_log(
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return the full review submission history log."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可查看审核日志")
    log = _load_review_log()
    return {"log": log}


@router.post("/algorithms/{algorithm_id:path}/admin-publish")
async def admin_publish_algorithm(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Admin direct publish without review. Accepts version_bump and metadata overrides."""

    current_user = get_current_user(request)
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可直接发布算法")
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    try:
        body: dict[str, Any] = await request.json()
    except Exception:
        body = {}
    version_bump = str(body.get("version_bump") or "").strip()
    metadata_override = body.get("metadata") if isinstance(body.get("metadata"), dict) else {}

    # For public algo admin edit (version iteration): check if there's a public conflict
    public_entry = _public_conflict_for_entry(registry, entry)
    is_iteration = public_entry is not None

    # Prefer an existing review draft. Normal users may have saved the changed
    # code into the draft layer, so publishing from the physical folder would
    # lose the actual submitted changes.
    existing_draft = _load_review_draft(entry)
    existing_files = existing_draft.get("files") if isinstance(existing_draft, dict) else None
    if isinstance(existing_files, list) and existing_files:
        draft_files = [
            {
                "filename": str(f.get("filename") or f.get("relative_path") or ""),
                "relative_path": str(f.get("relative_path") or f.get("filename") or ""),
                "content": str(f.get("content") or ""),
            }
            for f in existing_files
            if isinstance(f, dict)
        ]
    else:
        snap_files = _folder_files_for_entry(entry)
        draft_files = [
            {"filename": f["filename"], "relative_path": f["relative_path"], "content": f["content"]}
            for f in snap_files
        ]
    if not version_bump and is_iteration:
        bump_type = str(body.get("version_bump_type") or "patch")
        version_bump = _bump_semver(public_entry.version if public_entry else entry.version, bump_type)
    existing_metadata = existing_draft.get("metadata") if isinstance(existing_draft, dict) and isinstance(existing_draft.get("metadata"), dict) else {}
    metadata = {
        "zh_name": str(metadata_override.get("zh_name") or existing_metadata.get("zh_name") or entry.zh_name or ""),
        "zh_description": str(metadata_override.get("zh_description") or existing_metadata.get("zh_description") or entry.zh_description or ""),
        "zh_tags": metadata_override.get("zh_tags") if isinstance(metadata_override.get("zh_tags"), list) else (existing_metadata.get("zh_tags") if isinstance(existing_metadata.get("zh_tags"), list) else (entry.zh_tags or [])),
        "version": version_bump or entry.version or "1.0.0",
    }

    synthetic_draft: dict[str, Any] = {
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": str(existing_draft.get("base_status") or _read_entry_publish_status(entry)) if isinstance(existing_draft, dict) else _read_entry_publish_status(entry),
        "status": "reviewing",
        "review_kind": str(existing_draft.get("review_kind") or ("version_iteration" if is_iteration else "new_publish")) if isinstance(existing_draft, dict) else ("version_iteration" if is_iteration else "new_publish"),
        "target_public_id": str(existing_draft.get("target_public_id") or (public_entry.id if is_iteration else "")) if isinstance(existing_draft, dict) else (public_entry.id if is_iteration else ""),
        "target_public_call_prefix": str(existing_draft.get("target_public_call_prefix") or (public_entry.call_prefix if is_iteration else "")) if isinstance(existing_draft, dict) else (public_entry.call_prefix if is_iteration else ""),
        "base_public_version": str(existing_draft.get("base_public_version") or (public_entry.version if is_iteration else "")) if isinstance(existing_draft, dict) else (public_entry.version if is_iteration else ""),
        "version_bump": version_bump or entry.version or "1.0.0",
        "version_bump_type": str(body.get("version_bump_type") or "patch"),
        "metadata": metadata,
        "files": draft_files,
        "approved_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    _save_review_draft(entry, synthetic_draft)
    published = await _do_publish_algorithm(entry, registry)
    now_iso = datetime.now(timezone.utc).isoformat()
    _upsert_review_log(
        _entry_client_id(entry),
        {
            "name": entry.zh_name or entry.func_name,
            "call_prefix": entry.call_prefix,
            "owner_id": getattr(entry, "owner_id", "system"),
            "review_kind": synthetic_draft["review_kind"],
            "target_public_call_prefix": synthetic_draft.get("target_public_call_prefix", ""),
            "status": "published",
            "submitted_at": now_iso,
            "approved_at": now_iso,
            "published_at": now_iso,
            "rejected_at": None,
            "reject_reason": "",
            "version_bump": version_bump,
            "admin_direct": True,
        },
    )
    return {"success": True, "algorithm": _entry_dict(published), "adminDirect": True}


@router.post("/algorithm-source/{algorithm_id:path}/add-file")
async def add_algorithm_source_file(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Create a Python file in an algorithm folder and return refreshed folder files."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    payload = await request.json()
    filename = str(payload.get("filename", "")).strip().replace("\\", "/")
    content = str(payload.get("content", ""))
    if not filename.endswith(".py"):
        raise HTTPException(status_code=400, detail="文件名必须以 .py 结尾")
    if "/" in filename or filename in {"", "__init__.py"}:
        raise HTTPException(status_code=400, detail="文件名必须是合法的 Python 文件名")
    folder = Path(entry.source_file).parent
    new_file = folder / filename
    if new_file.exists():
        raise HTTPException(status_code=409, detail=f"文件已存在：{filename}")
    try:
        new_file.write_text(content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"创建文件失败：{exc}") from exc
    if not entry.package_root:
        extras = _load_entry_extra_files(entry)
        if filename not in extras and Path(entry.source_file).name != filename:
            extras.append(filename)
            try:
                _save_entry_extra_files(entry, extras)
            except OSError as exc:
                raise HTTPException(status_code=500, detail=f"保存文件关联失败：{exc}") from exc
        draft = _load_review_draft(entry)
        if draft and isinstance(draft.get("files"), list):
            draft_files = [
                item for item in draft["files"]
                if isinstance(item, dict) and str(item.get("filename") or item.get("relative_path") or "") != filename
            ]
            draft_files.append({"filename": filename, "relative_path": filename, "content": content})
            draft["files"] = draft_files
            draft["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_review_draft(entry, draft)
    registry.scan_directory(str(folder))
    refreshed = registry.get_by_id(_entry_client_id(entry)) or registry.get_by_id(entry.id) or entry
    return {"success": True, "algorithm": _entry_dict(refreshed), "folder_files": _folder_files_for_entry(refreshed)}


@router.patch("/algorithm-source/{algorithm_id:path}/rename-file")
async def rename_algorithm_source_file(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Rename a Python file in an algorithm folder."""
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    payload = await request.json()
    old_name = str(payload.get("old_name", "")).strip().replace("\\", "/")
    new_name = str(payload.get("new_name", "")).strip().replace("\\", "/")
    if not old_name or not new_name:
        raise HTTPException(status_code=400, detail="old_name 和 new_name 字段不能为空")
    if "/" in new_name or not new_name.endswith(".py"):
        raise HTTPException(status_code=400, detail="new_name 必须是合法的 .py 文件名")
    if new_name in {"__init__.py"}:
        raise HTTPException(status_code=400, detail="不允许重命名为 __init__.py")
    folder = Path(entry.source_file).parent
    old_path = folder / old_name
    new_path = folder / new_name
    if not old_path.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{old_name}")
    if new_path.exists():
        raise HTTPException(status_code=409, detail=f"目标文件已存在：{new_name}")
    try:
        old_path.rename(new_path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"重命名失败：{exc}") from exc
    if not entry.package_root:
        extras = [new_name if item == old_name else item for item in _load_entry_extra_files(entry)]
        if Path(entry.source_file).name != new_name and new_name not in extras:
            extras.append(new_name)
        try:
            _save_entry_extra_files(entry, extras)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"保存文件关联失败：{exc}") from exc
        draft = _load_review_draft(entry)
        if draft and isinstance(draft.get("files"), list):
            for item in draft["files"]:
                if not isinstance(item, dict):
                    continue
                if str(item.get("filename") or item.get("relative_path") or "") == old_name:
                    item["filename"] = new_name
                    item["relative_path"] = new_name
            draft["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_review_draft(entry, draft)
    registry.unregister_by_file(str(old_path))
    registry.scan_directory(str(folder))
    refreshed = registry.get_by_id(_entry_client_id(entry)) or registry.get_by_id(entry.id) or entry
    return {
        "success": True,
        "old_name": old_name,
        "new_name": new_name,
        "algorithm": _entry_dict(refreshed),
        "folder_files": _folder_files_for_entry(refreshed),
    }


@router.post("/algorithm-source/{algorithm_id:path}/check-syntax")
async def check_algorithm_syntax(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Check Python syntax for a given source snippet."""
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    payload = await request.json()
    content = str(payload.get("content", ""))
    filename = str(payload.get("filename", "source.py"))
    errors: list[dict[str, Any]] = []
    try:
        ast.parse(content, filename=filename)
    except SyntaxError as exc:
        errors.append({"line": exc.lineno, "col": exc.offset, "message": str(exc.msg)})
    return {"success": True, "valid": len(errors) == 0, "errors": errors}


@router.post("/algorithm-source/{algorithm_id:path}/files/{filename:path}")
async def save_algorithm_folder_file(
    algorithm_id: str,
    filename: str,
    payload: AlgorithmSourceSaveRequest,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Save one Python file in an algorithm folder."""

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改他人的算法")
    clean = filename.strip().replace("\\", "/")
    if not clean.endswith(".py") or clean == "__init__.py" or ".." in Path(clean).parts:
        raise HTTPException(status_code=400, detail="文件名必须是合法的 .py 文件")
    folder = Path(entry.source_file).parent.resolve()
    target = (folder / clean).resolve()
    if not target.is_relative_to(folder):
        raise HTTPException(status_code=400, detail="文件路径不合法")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{clean}")
    content_to_save = payload.content
    if target == Path(entry.source_file).resolve():
        content_to_save = _upsert_entry_algo_meta(payload.content, entry)
    current_status = _read_entry_publish_status(entry)
    draft = _load_review_draft(entry)
    if (draft and isinstance(draft.get("files"), list)) or current_status in {"published", "reviewing", "approved", "rejected"}:
        draft = draft or {
            "algorithm_id": entry.id,
            "call_prefix": entry.call_prefix,
            "base_status": current_status,
            "status": "pending",
            "metadata": {},
            "files": [],
        }
        files = [
            item for item in draft.get("files", [])
            if isinstance(item, dict) and str(item.get("filename") or item.get("relative_path") or "") != clean
        ]
        files.append({"filename": clean, "relative_path": clean, "content": content_to_save})
        draft["files"] = files
        draft["updated_at"] = datetime.now(timezone.utc).isoformat()
        _save_review_draft(entry, draft)
        merged_files = _merge_review_draft_files(entry, files)
        return {"success": True, "algorithm": _entry_dict(entry), "folder_files": merged_files, "is_draft_mode": True}
    try:
        target.write_text(content_to_save, encoding="utf-8")
        registry.rescan_file(str(target))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"保存文件失败：{exc}") from exc
    refreshed = registry.get_by_id(_entry_client_id(entry)) or registry.get_by_id(entry.id) or entry
    sse_manager.broadcast({"event": "updated", "file": str(target), "algorithms": registry.to_completion_json()})
    return {"success": True, "algorithm": _entry_dict(refreshed), "folder_files": _folder_files_for_entry(refreshed)}


@router.delete("/algorithm-source/{algorithm_id:path}/files/{filename:path}")
async def delete_algorithm_folder_file(
    algorithm_id: str,
    filename: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Delete one non-entry Python file from an algorithm folder."""

    current_user = get_current_user(request)
    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改他人的算法")
    clean = filename.strip().replace("\\", "/")
    if not clean.endswith(".py") or clean == "__init__.py" or ".." in Path(clean).parts:
        raise HTTPException(status_code=400, detail="文件名必须是合法的 .py 文件")
    folder = Path(entry.source_file).parent.resolve()
    target = (folder / clean).resolve()
    if not target.is_relative_to(folder):
        raise HTTPException(status_code=400, detail="文件路径不合法")
    if target == Path(entry.source_file).resolve():
        raise HTTPException(status_code=400, detail="入口文件不能删除")
    if not target.exists():
        raise HTTPException(status_code=404, detail=f"文件不存在：{clean}")
    try:
        target.unlink()
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"删除文件失败：{exc}") from exc
    if not entry.package_root:
        extras = [item for item in _load_entry_extra_files(entry) if item != clean]
        try:
            _save_entry_extra_files(entry, extras)
        except OSError as exc:
            raise HTTPException(status_code=500, detail=f"保存文件关联失败：{exc}") from exc
        draft = _load_review_draft(entry)
        if draft and isinstance(draft.get("files"), list):
            draft["files"] = [
                item for item in draft["files"]
                if isinstance(item, dict) and str(item.get("filename") or item.get("relative_path") or "") != clean
            ]
            draft["updated_at"] = datetime.now(timezone.utc).isoformat()
            _save_review_draft(entry, draft)
    registry.unregister_by_file(str(target))
    registry.scan_directory(str(folder))
    refreshed = registry.get_by_id(_entry_client_id(entry)) or registry.get_by_id(entry.id) or entry
    sse_manager.broadcast({"event": "updated", "file": str(target), "algorithms": registry.to_completion_json()})
    return {"success": True, "algorithm": _entry_dict(refreshed), "folder_files": _folder_files_for_entry(refreshed)}


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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    if current_user.get("role") != "admin" and getattr(entry, "owner_id", "system") != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权修改他人的算法")
    if entry.package_id:
        raise HTTPException(status_code=400, detail="算法包请使用文件级 API 操作")
    source_path = Path(entry.source_file)
    if not source_path.exists():
        raise HTTPException(status_code=404, detail=f"源文件不存在：{source_path}")
    try:
        ast.parse(payload.content)
    except SyntaxError as exc:
        raise HTTPException(status_code=400, detail=f"Python 语法错误：{exc}") from exc
    content_to_save = _upsert_entry_algo_meta(payload.content, entry)
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
            "files": [{"filename": filename, "relative_path": filename, "content": content_to_save}],
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
        source_path.write_text(content_to_save, encoding="utf-8")
        registry.rescan_file(str(source_path))
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"保存源码失败：{exc}") from exc
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
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")

    payload = await request.json()
    new_namespace_raw = str(payload.get("new_namespace", "")).strip()
    if not new_namespace_raw:
        raise HTTPException(status_code=400, detail="new_namespace 字段不能为空")
    if not new_namespace_raw.startswith("alg."):
        raise HTTPException(status_code=400, detail="new_namespace 必须以 alg. 开头")

    normalized = _normalize_call_namespace(new_namespace_raw)
    parts = [part for part in normalized.split(".") if part]
    if len(parts) < 2:
        raise HTTPException(status_code=400, detail="命名空间格式应为 alg.<分类>.<函数名>")

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
            raise HTTPException(status_code=404, detail=f"算法 {entry.id} 的 folder_config.json 不存在")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        config["namespace"] = new_namespace
        config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.rescan_file(entry.source_file)
        updated_entries = registry.get_by_namespace(new_namespace)

    updated_entry = next((item for item in updated_entries if item.func_name == entry.func_name), None)
    if updated_entry is None:
        raise HTTPException(status_code=500, detail="命名空间已更新但无法重新加载算法，请刷新页面")

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
        raise HTTPException(status_code=404, detail=f"未找到已发布的组件：{call_namespace}")
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


@router.post("/upload-temp")
async def upload_temp_file(file: UploadFile = File(...), request: Request = None) -> dict[str, Any]:
    """上传文件到当前用户的临时目录，并返回服务端临时路径。"""
    current_user = get_current_user(request)
    user_id = str(current_user.get("id") or "anon")

    temp_dir = Path(tempfile.gettempdir()) / "algolib_uploads" / user_id
    temp_dir.mkdir(parents=True, exist_ok=True)

    original = file.filename or "upload"
    suffix = Path(original).suffix
    safe_name = f"{uuid_lib.uuid4().hex}{suffix}"
    dest = temp_dir / safe_name
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="上传文件不能为空")
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="上传文件不能超过 50MB")
        dest.write_bytes(content)
    except HTTPException:
        raise
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"文件上传失败：{exc}") from exc
    return {
        "success": True,
        "path": str(dest),
        "filename": original,
        "size": len(content),
    }


@router.post("/test/upload-temp")
async def upload_temp_test_file(file: UploadFile = File(...)) -> dict[str, str]:
    """Upload a file to a temp path and return its path (for use in test kwargs)."""
    original = file.filename or "upload"
    suffix = Path(original).suffix
    tmp_path = Path(tempfile.gettempdir()) / f"algolib_test_{uuid_lib.uuid4().hex}{suffix}"
    try:
        data = await file.read()
        tmp_path.write_bytes(data)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"文件上传失败：{exc}") from exc
    return {"path": str(tmp_path), "filename": original}


@router.post("/run-source")
async def run_source(request: Request) -> dict[str, Any]:
    payload = await request.json()
    content = str(payload.get("content", "") or "")
    function_name = str(payload.get("function", "") or "").strip()
    args = payload.get("args", [])
    kwargs = payload.get("kwargs", {})
    if not content.strip():
        raise HTTPException(status_code=400, detail="content 字段不能为空")
    if not isinstance(args, list):
        raise HTTPException(status_code=400, detail="args 字段必须是列表")
    if not isinstance(kwargs, dict):
        raise HTTPException(status_code=400, detail="kwargs 字段必须是字典")
    kwargs = _preprocess_kwargs(kwargs)

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
        raise HTTPException(status_code=400, detail=f"代码执行失败：{exc}", headers={"X-Elapsed-MS": str(elapsed_ms)}) from exc


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
        raise HTTPException(status_code=400, detail="namespace 和 function 字段不能为空")
    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{namespace}.{func_name}")
    if not bool(payload.get("allow_unpublished", False)):
        _ensure_user_callable_status(entry, request)
    return _execute_entry(entry, args if isinstance(args, list) else [], kwargs if isinstance(kwargs, dict) else {})


@router.post("/invoke/{call_namespace:path}")
async def invoke_algorithm_by_namespace(
    call_namespace: str,
    request: ExecuteRequest,
    http_request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    normalized = _normalize_call_namespace(call_namespace)
    entry = registry.get_by_id(normalized)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{call_namespace}")
    _ensure_user_callable_status(entry, http_request)
    return _execute_entry(entry, request.args, request.kwargs)


@router.post("/algorithms/{algorithm_id:path}/execute")
async def execute_algorithm_by_id(
    algorithm_id: str,
    request: ExecuteRequest,
    http_request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """按前端暴露的 algorithm_id 执行算法，供全屏测试页使用。"""

    base_id = algorithm_id
    owner_id: str | None = None
    if "@@" in algorithm_id:
        base_id, owner_id = algorithm_id.split("@@", 1)

    entry = (
        _entry_by_owner(registry, base_id, owner_id)
        or registry.get_by_id(algorithm_id)
        or registry.get_by_id(base_id)
    )
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{algorithm_id}")
    _ensure_user_callable_status(entry, http_request)
    return _execute_entry(entry, request.args, request.kwargs)


@router.post("/{namespace}/{func_name}")
async def execute_algorithm(
    namespace: str,
    func_name: str,
    request: ExecuteRequest,
    http_request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entry = registry.get_by_id(f"{namespace}.{func_name}")
    if entry is None:
        raise HTTPException(status_code=404, detail=f"算法不存在：{namespace}.{func_name}")
    _ensure_user_callable_status(entry, http_request)
    return _execute_entry(entry, request.args, request.kwargs)


# ============================================================
# 模板分块编辑 (Template Blocks) — 工具函数
# ============================================================

def _template_blocks_path(entry: AlgorithmEntry) -> Path:
    """返回模板 blocks JSON 的存储路径。"""
    return Path(entry.source_file).parent / f"{entry.func_name}.blocks.json"


def _parse_blocks_from_source(source: str) -> list[dict[str, Any]] | None:
    """从源码中的特殊注释标记解析 blocks。
    标记格式：# === BLOCK: 标题 [LOCKED] ===
    如果源码中没有任何 BLOCK 标记，返回 None。
    """
    lines = source.split("\n")
    block_pattern = re.compile(r"^#\s*===\s*BLOCK:\s*(.+?)(?:\s*\[LOCKED\])?\s*===\s*$")
    locked_pattern = re.compile(r"\[LOCKED\]")
    desc_pattern = re.compile(r"^#\s*DESC:\s*(.+)$")
    hint_pattern = re.compile(r"^#\s*HINT:\s*(.+)$")

    markers: list[tuple[int, str, bool]] = []
    for i, line in enumerate(lines):
        m = block_pattern.match(line)
        if m:
            title = m.group(1).strip()
            locked = bool(locked_pattern.search(line))
            title = re.sub(r"\s*\[LOCKED\]\s*", "", title).strip()
            markers.append((i, title, locked))

    if not markers:
        return None

    blocks: list[dict[str, Any]] = []
    for idx, (line_idx, title, locked) in enumerate(markers):
        start = line_idx + 1
        end = markers[idx + 1][0] if idx + 1 < len(markers) else len(lines)
        description = ""
        hint = ""
        code_start = start
        for j in range(start, min(start + 5, end)):
            dm = desc_pattern.match(lines[j])
            hm = hint_pattern.match(lines[j])
            if dm:
                description = dm.group(1).strip()
                code_start = j + 1
            elif hm:
                hint = hm.group(1).strip()
                code_start = j + 1
            else:
                break
        code = "\n".join(lines[code_start:end])
        code = code.rstrip("\n") + "\n" if code.strip() else "\n"
        blocks.append({
            "id": f"blk_{idx + 1:03d}",
            "order": idx + 1,
            "title": title,
            "description": description,
            "code": code,
            "locked": locked,
            "hint": hint,
        })
    return blocks


def _load_template_blocks(entry: AlgorithmEntry) -> list[dict[str, Any]] | None:
    """加载模板的 blocks 数据。
    优先级：1) .blocks.json 文件  2) 从源码注释解析  3) 返回 None
    """
    blocks_path = _template_blocks_path(entry)
    if blocks_path.exists():
        try:
            data = json.loads(blocks_path.read_text(encoding="utf-8"))
            blocks = data.get("blocks") if isinstance(data, dict) else data
            if isinstance(blocks, list) and blocks:
                return blocks
        except (OSError, json.JSONDecodeError):
            pass
    try:
        source = Path(entry.source_file).read_text(encoding="utf-8")
        parsed = _parse_blocks_from_source(source)
        if parsed:
            return parsed
    except OSError:
        pass
    return None


def _save_template_blocks(entry: AlgorithmEntry, blocks: list[dict[str, Any]]) -> None:
    """保存 blocks 到 sidecar JSON 文件。"""
    blocks_path = _template_blocks_path(entry)
    payload = {"schema_version": "1.0", "blocks": blocks}
    blocks_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _assemble_source_from_blocks(blocks: list[dict[str, Any]]) -> str:
    """将 blocks 按 order 排序后拼接为完整的 .py 源码（含注释标记）。"""
    sorted_blocks = sorted(blocks, key=lambda b: b.get("order", 0))
    parts: list[str] = []
    for block in sorted_blocks:
        locked_tag = " [LOCKED]" if block.get("locked") else ""
        marker = f"# === BLOCK: {block.get('title', '未命名步骤')}{locked_tag} ==="
        parts.append(marker)
        if block.get("description"):
            parts.append(f"# DESC: {block['description']}")
        if block.get("hint"):
            parts.append(f"# HINT: {block['hint']}")
        code = block.get("code", "")
        parts.append(code.rstrip("\n"))
        parts.append("")  # 块之间空一行
    return "\n".join(parts).rstrip("\n") + "\n"


# ============================================================
# 模板分块编辑 (Template Blocks) — API 路由
# ============================================================

@router.get("/templates/{algorithm_id}/blocks")
async def get_template_blocks(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """获取模板的分块信息。"""
    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="算法不存在")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="仅模板类型支持分块编辑")
    blocks = _load_template_blocks(entry)
    if blocks is None:
        try:
            source = Path(entry.source_file).read_text(encoding="utf-8")
        except OSError:
            source = ""
        return {
            "success": True,
            "algorithm_id": entry.id,
            "has_blocks": False,
            "blocks": [{
                "id": "blk_full",
                "order": 1,
                "title": "完整代码",
                "description": "",
                "code": source,
                "locked": False,
                "hint": "",
            }],
        }
    return {
        "success": True,
        "algorithm_id": entry.id,
        "has_blocks": True,
        "blocks": blocks,
    }


@router.put("/templates/{algorithm_id}/blocks")
async def save_template_blocks(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """完整保存模板分块（Design Mode — 创建者/管理员使用）。"""
    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="算法不存在")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="仅模板类型支持分块编辑")
    body = await request.json()
    blocks = body.get("blocks", [])
    if not blocks:
        raise HTTPException(status_code=400, detail="blocks 不能为空")
    for i, block in enumerate(blocks):
        if not block.get("id"):
            block["id"] = f"blk_{i + 1:03d}"
        if "order" not in block:
            block["order"] = i + 1
        if "code" not in block:
            block["code"] = ""
    _save_template_blocks(entry, blocks)
    full_source = _assemble_source_from_blocks(blocks)
    try:
        ast.parse(full_source)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"拼接后的代码存在语法错误（第 {exc.lineno} 行）：{exc.msg}",
        ) from exc
    Path(entry.source_file).write_text(full_source, encoding="utf-8")
    registry.rescan_file(entry.source_file)
    return {"success": True, "message": "模板分块已保存"}


@router.put("/templates/{algorithm_id}/blocks/editable")
async def save_template_editable_blocks(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """仅保存可编辑块的代码（Use Mode — 普通用户使用）。"""
    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="算法不存在")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="仅模板类型支持分块编辑")
    existing_blocks = _load_template_blocks(entry)
    if not existing_blocks:
        raise HTTPException(status_code=400, detail="该模板未配置分块信息")
    body = await request.json()
    editable_updates = body.get("blocks", [])
    updates_map: dict[str, str] = {}
    for item in editable_updates:
        if isinstance(item, dict) and "id" in item and "code" in item:
            updates_map[item["id"]] = item["code"]
    for block in existing_blocks:
        block_id = block.get("id", "")
        if block_id in updates_map:
            if block.get("locked"):
                raise HTTPException(
                    status_code=403,
                    detail=f"块 '{block.get('title', block_id)}' 已锁定，不允许修改",
                )
            block["code"] = updates_map[block_id]
    _save_template_blocks(entry, existing_blocks)
    full_source = _assemble_source_from_blocks(existing_blocks)
    try:
        ast.parse(full_source)
    except SyntaxError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"代码存在语法错误（第 {exc.lineno} 行）：{exc.msg}",
        ) from exc
    Path(entry.source_file).write_text(full_source, encoding="utf-8")
    registry.rescan_file(entry.source_file)
    return {"success": True, "message": "可编辑块已保存"}


@router.post("/templates/{algorithm_id}/blocks/convert")
async def convert_to_block_template(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """将旧模板转换为分块模板（从源码注释解析或创建单块）。"""
    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="算法不存在")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="仅模板类型支持此操作")
    blocks_path = _template_blocks_path(entry)
    if blocks_path.exists():
        return {"success": True, "message": "该模板已有分块配置", "has_blocks": True}
    try:
        source = Path(entry.source_file).read_text(encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    blocks = _parse_blocks_from_source(source)
    if not blocks:
        blocks = [{
            "id": "blk_001",
            "order": 1,
            "title": "完整代码",
            "description": "此模板尚未分块，请在设计模式下进行分块设置",
            "code": source,
            "locked": False,
            "hint": "",
        }]
    _save_template_blocks(entry, blocks)
    return {
        "success": True,
        "message": "已转换为分块模板",
        "has_blocks": True,
        "block_count": len(blocks),
    }


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
        raise HTTPException(status_code=404, detail=f"算法不存在：{namespace}.{func_name}")
    if entry.type != "component":
        raise HTTPException(status_code=404, detail=f"Published component not found: {namespace}.{func_name}")
    if _read_entry_publish_status(entry) != "published":
        raise HTTPException(status_code=403, detail="该算法未发布，无法通过外部接口调用")
    return _execute_entry(entry, request.args, request.kwargs)
