"""Package management API routes for multi-file algorithm packages."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from .algorithms import get_registry
from ..sdk.registry import AlgorithmRegistry

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
    try:
        functions = registry.save_package_file(package_id, filename, content)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
    try:
        package = registry.create_package(payload, files, root_dir)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
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
