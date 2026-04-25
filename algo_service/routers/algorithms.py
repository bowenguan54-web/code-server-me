"""Algorithm API routes (/api/v1/...)."""

from __future__ import annotations

import importlib.util
import json
import logging
import shutil
import sys
import time
import types
from collections.abc import AsyncGenerator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from ..models.schemas import ExecuteRequest
from ..sdk.registry import AlgorithmEntry, AlgorithmRegistry
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
    return {
        "id": entry.id,
        "callPrefix": entry.call_prefix,
        "callSnippet": entry.call_snippet,
        "snippetBody": entry.snippet_body,
        "type": entry.type,
        "moduleKind": entry.type,
        "lifecycleStatus": publish_status,
        "publishStatus": publish_status,
        "apiPath": f"/api/v1/invoke/{entry.call_prefix}",
        "externalApiPath": f"/api/external/v1/{entry.namespace}/{entry.func_name}",
        "zhName": entry.zh_name,
        "zhDescription": entry.zh_description,
        "zhTags": entry.zh_tags,
        "enDescription": entry.en_description,
        "params": entry.params,
        "namespace": entry.namespace,
        "version": entry.version,
        "funcName": entry.func_name,
        "packageId": entry.package_id,
        "packageRoot": entry.package_root,
        "sourceFile": entry.source_file,
    }


def _entry_config_path(entry: AlgorithmEntry) -> Path:
    """Return the manifest path that owns an algorithm entry."""

    if entry.package_root:
        return Path(entry.package_root) / "algopack.json"
    return Path(entry.source_file).parent / "folder_config.json"


def _read_entry_publish_status(entry: AlgorithmEntry) -> str:
    """Read an entry publish status from its manifest."""

    config_path = _entry_config_path(entry)
    if not config_path.exists():
        return "published"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return "published"
    return str(config.get("publish_status") or ("published" if config.get("published", True) else "draft"))


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


@router.get("/algorithms")
async def list_algorithms(
    module_kind: str | None = Query(None, description="Filter by component/template/snippet"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    entries = registry.get_all()
    if module_kind:
        entries = [entry for entry in entries if entry.type == module_kind]
    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}


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
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Copy a template directory and register the copy as a component draft."""

    entry = registry.get_by_id(_normalize_call_namespace(algorithm_id)) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if entry.type != "template":
        raise HTTPException(status_code=400, detail="Only template entries can be published as component")

    source_dir = Path(entry.package_root) if entry.package_root else Path(entry.source_file).parent
    target_dir = source_dir.with_name(f"{source_dir.name}_component")
    if target_dir.exists():
        raise HTTPException(status_code=409, detail=f"Component directory already exists: {target_dir}")

    try:
        shutil.copytree(source_dir, target_dir)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to copy template: {exc}") from exc

    manifest_name = "algopack.json" if entry.package_root else "folder_config.json"
    manifest_path = target_dir / manifest_name
    if not manifest_path.exists():
        raise HTTPException(status_code=500, detail=f"{manifest_name} not found in copied component")

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["module_kind"] = "component"
        manifest["published"] = False
        manifest["publish_status"] = "draft"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        registry.scan_directory(str(target_dir.parent))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Failed to update copied component manifest: {exc}") from exc

    target_resolved = target_dir.resolve()
    candidates = []
    for item in registry.get_all():
        try:
            is_in_target = Path(item.source_file).resolve().is_relative_to(target_resolved)
        except ValueError:
            is_in_target = False
        if is_in_target and item.type == "component" and item.func_name == entry.func_name:
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


@router.get("/algorithms/{algorithm_id:path}")
async def get_algorithm(algorithm_id: str, registry: AlgorithmRegistry = Depends(get_registry)) -> dict[str, Any]:
    entry = registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    return {"success": True, "algorithm": _entry_dict(entry)}


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
    return {
        "success": True,
        "algorithm": _entry_dict(entry),
        "source": source_path.read_text(encoding="utf-8"),
        "source_file": str(source_path),
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
