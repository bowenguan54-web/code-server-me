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


def _package_entry(package: Any, registry: AlgorithmRegistry) -> Any | None:
    """Return the registry entry that belongs to the concrete package root."""

    package_root = Path(package.root_path).resolve()
    for entry in registry.get_all():
        if getattr(entry, "package_id", "") != package.package_id:
            continue
        entry_root = getattr(entry, "package_root", "")
        if entry_root and Path(entry_root).resolve() == package_root:
            return entry
    for export_name in package.exports:
        entry = registry.get_by_id(f"{package.namespace}.{export_name}")
        if entry is not None:
            return entry
    return None


def _assert_can_modify_package(package_id: str, request: Request, registry: AlgorithmRegistry) -> Any | None:
    """Ensure the current user may write files inside a package."""

    package = registry.get_package(package_id)
    if package is None:
        return None
    entry = _package_entry(package, registry)
    owner_id = str(getattr(entry, "owner_id", "system") or "system")
    try:
        user = get_current_user(request)
    except HTTPException as exc:
        raise HTTPException(
            status_code=403,
            detail="公有算法不能直接修改，请另存为私有草稿后提交审核",
        ) from exc
    if user.get("role") == "admin":
        return package
    if owner_id == "system":
        raise HTTPException(
            status_code=403,
            detail="公有算法不能直接修改，请另存为私有草稿后提交审核",
        )
    if user.get("id") != owner_id:
        raise HTTPException(status_code=403, detail="只有算法创建者可以修改")
    return package


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
    package = _assert_can_modify_package(package_id, request, registry)
    payload = await _json_body(request)
    content = payload.get("content")
    if not isinstance(content, str):
        raise HTTPException(status_code=400, detail="Field 'content' must be a string")
    if package is not None and filename.strip().replace("\\", "/") == package.entry_file:
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
        entry = _package_entry(package, registry)
        if entry is not None:
            _append_entry_version(entry, "package.file.saved", note=f"Saved {filename}")
            try:
                from .publish import _append_history

                user = get_current_user(request)
                operator = str(user.get("id") or user.get("username") or request.headers.get("X-Operator") or "system")
                operator_name = str(
                    user.get("display_name")
                    or user.get("displayName")
                    or user.get("username")
                    or operator
                )
                clean_filename = filename.strip().replace("\\", "/")
                _append_history(
                    entry,
                    "saved",
                    operator=operator,
                    reason=f"代码保存：{clean_filename}",
                    operator_name=operator_name,
                    from_version=str(entry.version or ""),
                    to_version=str(entry.version or ""),
                    action_type="code_save",
                )
            except HTTPException:
                raise
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
    except HTTPException:
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
