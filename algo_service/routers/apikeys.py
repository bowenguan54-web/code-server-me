"""API key management routes and reusable validation helpers."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["apikeys"])

STORE_PATH = Path(__file__).resolve().parents[2] / "apikeys_store.json"
LOG_PATH = Path(__file__).resolve().parents[2] / "call_logs.json"
VALID_STATUS = {"active", "disabled"}


class ApiKeyCreate(BaseModel):
    """Request body for creating an API key."""

    name: str
    owner: str = ""
    allowed_namespaces: list[str] = Field(default_factory=list)
    rate_limit: int = 60
    expires_at: str | None = None


class ApiKeyUpdate(BaseModel):
    """Request body for updating an API key."""

    name: str | None = None
    owner: str | None = None
    allowed_namespaces: list[str] | None = None
    rate_limit: int | None = None
    expires_at: str | None = None
    status: str | None = None


def _now_iso() -> str:
    """Return the current UTC timestamp."""

    return datetime.now(timezone.utc).isoformat()


def _load_keys() -> list[dict[str, Any]]:
    """Load API keys from local JSON storage."""

    if not STORE_PATH.exists():
        return []
    try:
        data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read API key store: {exc}") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=500, detail="apikeys_store.json must contain a list")
    return [item for item in data if isinstance(item, dict)]


def _save_keys(items: list[dict[str, Any]]) -> None:
    """Persist API keys to local JSON storage."""

    try:
        STORE_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write API key store: {exc}") from exc


def load_api_keys() -> list[dict[str, Any]]:
    """Public helper used by middleware to read API keys."""

    return _load_keys()


def save_api_keys(items: list[dict[str, Any]]) -> None:
    """Public helper used by middleware to persist key usage metadata."""

    _save_keys(items)


def find_key_by_value(key_value: str) -> dict[str, Any] | None:
    """Return the stored API key matching a raw key value."""

    return next((item for item in _load_keys() if item.get("key_value") == key_value), None)


def _find_key(items: list[dict[str, Any]], key_id: str) -> dict[str, Any] | None:
    """Find an API key by id in a loaded collection."""

    return next((item for item in items if item.get("id") == key_id), None)


def _normalize_namespaces(values: list[str]) -> list[str]:
    """Normalize allowed namespace patterns."""

    return [str(value).strip() for value in values if str(value).strip()]


def _validate_rate_limit(value: int) -> int:
    """Validate and return a positive rate limit."""

    if value <= 0:
        raise HTTPException(status_code=400, detail="rate_limit must be greater than 0")
    return value


def _validate_status(value: str) -> str:
    """Validate and return an API key status."""

    if value not in VALID_STATUS:
        raise HTTPException(status_code=400, detail="status must be active or disabled")
    return value


def is_expired(key: dict[str, Any]) -> bool:
    """Return whether a key has expired."""

    expires_at = key.get("expires_at")
    if not expires_at:
        return False
    try:
        expires = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
    except ValueError:
        return True
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    return expires <= datetime.now(timezone.utc)


def namespace_allowed(key: dict[str, Any], namespace: str, func_name: str) -> bool:
    """Return whether a key can call the requested namespace/function."""

    patterns = key.get("allowed_namespaces") or []
    if not patterns:
        return True
    full_call = f"alg.{namespace}.{func_name}"
    namespace_value = f"alg.{namespace}"
    for pattern in patterns:
        text = str(pattern).strip()
        if text == "*" or text == full_call or text == namespace_value:
            return True
        if text.endswith(".*") and full_call.startswith(text[:-1]):
            return True
    return False


def touch_key_last_used(key_id: str) -> None:
    """Update last_used_at for an API key."""

    items = _load_keys()
    key = _find_key(items, key_id)
    if key is None:
        return
    key["last_used_at"] = _now_iso()
    _save_keys(items)


def _load_logs() -> list[dict[str, Any]]:
    """Load call logs for API key statistics."""

    if not LOG_PATH.exists():
        return []
    try:
        data = json.loads(LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _public_key(item: dict[str, Any], include_secret: bool = False) -> dict[str, Any]:
    """Return an API key record for API responses."""

    payload = dict(item)
    if not include_secret:
        payload["key_value"] = f"{str(item.get('key_value', ''))[:8]}..."
    return payload


@router.get("/apikeys")
async def list_apikeys() -> dict[str, Any]:
    """Return all API keys."""

    items = [_public_key(item) for item in _load_keys()]
    return {"success": True, "count": len(items), "apikeys": items}


@router.post("/apikeys")
async def create_apikey(payload: ApiKeyCreate) -> dict[str, Any]:
    """Create a new API key and return its raw key value once."""

    items = _load_keys()
    now = _now_iso()
    key = {
        "id": f"key_{uuid4().hex[:8]}",
        "key_value": secrets.token_urlsafe(48)[:64],
        "name": payload.name.strip(),
        "owner": payload.owner,
        "allowed_namespaces": _normalize_namespaces(payload.allowed_namespaces),
        "rate_limit": _validate_rate_limit(payload.rate_limit),
        "expires_at": payload.expires_at,
        "status": "active",
        "created_at": now,
        "last_used_at": None,
    }
    if not key["name"]:
        raise HTTPException(status_code=400, detail="name must not be empty")
    items.append(key)
    _save_keys(items)
    return {"success": True, "apikey": _public_key(key, include_secret=True)}


@router.patch("/apikeys/{key_id}")
async def update_apikey(key_id: str, payload: ApiKeyUpdate) -> dict[str, Any]:
    """Update an API key record."""

    items = _load_keys()
    key = _find_key(items, key_id)
    if key is None:
        raise HTTPException(status_code=404, detail=f"API key not found: {key_id}")
    update = payload.model_dump(exclude_unset=True)
    for field_name in ("name", "owner", "expires_at"):
        if field_name in update:
            key[field_name] = update[field_name]
    if "allowed_namespaces" in update and update["allowed_namespaces"] is not None:
        key["allowed_namespaces"] = _normalize_namespaces(update["allowed_namespaces"])
    if "rate_limit" in update and update["rate_limit"] is not None:
        key["rate_limit"] = _validate_rate_limit(update["rate_limit"])
    if "status" in update and update["status"] is not None:
        key["status"] = _validate_status(update["status"])
    _save_keys(items)
    return {"success": True, "apikey": _public_key(key)}


@router.delete("/apikeys/{key_id}")
async def delete_apikey(key_id: str) -> dict[str, Any]:
    """Delete an API key by id."""

    items = _load_keys()
    if _find_key(items, key_id) is None:
        raise HTTPException(status_code=404, detail=f"API key not found: {key_id}")
    _save_keys([item for item in items if item.get("id") != key_id])
    return {"success": True, "deleted": key_id}


@router.get("/apikeys/{key_id}/stats")
async def get_apikey_stats(key_id: str) -> dict[str, Any]:
    """Return basic usage statistics for one API key."""

    items = _load_keys()
    if _find_key(items, key_id) is None:
        raise HTTPException(status_code=404, detail=f"API key not found: {key_id}")
    logs = [item for item in _load_logs() if item.get("api_key_id") == key_id]
    total = len(logs)
    successes = len([item for item in logs if item.get("success") is True])
    avg_elapsed = round(sum(float(item.get("elapsed_ms") or 0) for item in logs) / total, 3) if total else 0
    return {
        "success": True,
        "stats": {
            "total_calls": total,
            "success_calls": successes,
            "failed_calls": total - successes,
            "success_rate": round(successes / total, 4) if total else 0,
            "avg_elapsed_ms": avg_elapsed,
        },
    }
