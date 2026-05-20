"""Package management API routes for multi-file algorithm packages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .algorithms import _append_entry_version, _upsert_algo_meta, _upsert_entry_algo_meta, get_registry
from ..sdk.auth_utils import get_current_user
from ..sdk.registry import AlgorithmRegistry

_ALGORITHMS_ROOT = Path(__file__).resolve().parents[2] / "algorithms_root"

router = APIRouter(prefix="/api/v1", tags=["packages"])


def _default_root(registry: AlgorithmRegistry) -> str:
    roots = registry.watch_roots
    if roots:
        return roots[0]
    return str(Path(__file__).resolve().parents[2] / "algorithms_root")


async def _json_body(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"JSON parse error: {exc}") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Request body must be a JSON object")
    return payload


@router.get("/packages")
async def list_packages(registry: AlgorithmRegistry = Depends(get_registry)) -> dict:
    packages = registry.get_packages()
    return {
        "success": True,
        "count": len(packages),
        "packages": [package.to_dict() for package in packages],
    }


@router.get("/packages/{package_id}")
async def get_package(
    package_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    package = registry.get_package(package_id)
    if package is None:
        raise HTTPException(status_code=404, detail=f"Package not found: {package_id}")
    return {"success": True, "package": package.to_dict()}


@router.post("/packages/{package_id}/files/{filename:path}")
async def save_package_file(
    package_id: str,
    filename: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    payload = await _json_body(request)
    content = payload.get("content")
    if not isinstance(content, str):
        raise HTTPException(status_code=400, detail="Field 'content' must be a string")
    package = registry.get_package(package_id)
    if package is not None and filename.strip().replace("\\", "/") == package.entry:
        for export_name in package.exports:
            entry = registry.get_by_id(f"{package.namespace}.{export_name}")
            if entry is not None:
                content = _upsert_entry_algo_meta(content, entry)
                break
    try:
        functions = registry.save_package_file(package_id, filename, content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if package is not None:
        for export_name in package.exports:
            entry = registry.get_by_id(f"{package.namespace}.{export_name}")
            if entry is not None:
                _append_entry_version(entry, "package.file.saved", note=f"Saved {filename}")
                break
    return {"success": True, "functions_detected": functions}


@router.post("/packages/create")
async def create_package(
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    payload = await _json_body(request)
    files = payload.pop("files", [])
    root_dir = str(payload.pop("root_dir", "") or _default_root(registry))
    if not isinstance(files, list):
        raise HTTPException(status_code=400, detail="Field 'files' must be a list")

    # Determine owner: if a user is authenticated, create in their private directory
    current_user_id: str | None = None
    try:
        u = get_current_user(request)
        current_user_id = u.get("id")
    except Exception:
        pass

    if current_user_id:
        namespace = str(payload.get("namespace", "")).strip()
        name = str(payload.get("name", "")).strip()
        if namespace and name:
            root_dir = str(_ALGORITHMS_ROOT / "users" / current_user_id)
        payload["owner_id"] = current_user_id

    entry_name = str(payload.get("entry", "main.py")).strip() or "main.py"
    export_name = str((payload.get("exports") or [""])[0] or "").strip()
    if export_name:
        for file_item in files:
            relative_path = str(file_item.get("relative_path") or file_item.get("filename") or "").strip().replace("\\", "/")
            if relative_path == entry_name:
                file_item["content"] = _upsert_algo_meta(
                    str(file_item.get("content", "")),
                    export_name,
                    {
                        "zh_name": str(payload.get("zh_name", "")).strip() or export_name,
                        "zh_description": str(payload.get("zh_description", "")).strip(),
                        "zh_tags": payload.get("zh_tags", []),
                        "version": str(payload.get("version", "1.0.0")).strip() or "1.0.0",
                        "input_example": str(payload.get("input_example", "")).strip(),
                        "widget_overrides": payload.get("widget_overrides", {}) if isinstance(payload.get("widget_overrides"), dict) else {},
                    },
                )
                break

    try:
        package = registry.create_package(payload, files, root_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    for export_name in package.exports:
        entry = registry.get_by_id(f"{package.namespace}.{export_name}")
        if entry is not None:
            _append_entry_version(entry, "package.created", note="Created multi-file package")
            break
    return {"success": True, "package": package.to_dict()}


@router.patch("/packages/{package_id}/manifest")
async def update_package_manifest(
    package_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    payload = await _json_body(request)
    try:
        package = registry.update_package_manifest(package_id, payload)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    for export_name in package.exports:
        entry = registry.get_by_id(f"{package.namespace}.{export_name}")
        if entry is not None:
            _append_entry_version(entry, "package.manifest.updated", note="Package manifest updated")
            break
    return {"success": True, "package": package.to_dict()}


@router.delete("/packages/{package_id}/files/{filename:path}")
async def delete_package_file(
    package_id: str,
    filename: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    try:
        functions = registry.delete_package_file(package_id, filename)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"success": True, "functions_detected": functions}
