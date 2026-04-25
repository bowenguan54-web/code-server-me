"""Code snippet API routes backed by a local JSON store."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from ..models.schemas import SnippetCreate, SnippetUpdate

router = APIRouter(prefix="/api/v1", tags=["snippets"])

STORE_PATH = Path(__file__).resolve().parents[2] / "snippets_store.json"
VALID_SCOPES = {"private", "team"}


def _now_iso() -> str:
    """Return the current UTC timestamp in ISO 8601 format."""

    return datetime.now(timezone.utc).isoformat()


def _load_store() -> list[dict[str, Any]]:
    """Load all snippets from the JSON store."""

    if not STORE_PATH.exists():
        return []
    try:
        data = json.loads(STORE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read snippets store: {exc}") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=500, detail="snippets_store.json must contain a list")
    return [item for item in data if isinstance(item, dict)]


def _save_store(items: list[dict[str, Any]]) -> None:
    """Persist all snippets to the JSON store."""

    try:
        STORE_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write snippets store: {exc}") from exc


def _normalize_tags(tags: list[str]) -> list[str]:
    """Normalize a snippet tag list."""

    return [str(tag).strip() for tag in tags if str(tag).strip()]


def _validate_scope(scope: str) -> str:
    """Validate and return a snippet scope value."""

    normalized = str(scope or "private").strip()
    if normalized not in VALID_SCOPES:
        raise HTTPException(status_code=400, detail="scope must be private or team")
    return normalized


def _find_snippet(items: list[dict[str, Any]], snippet_id: str) -> dict[str, Any] | None:
    """Find a snippet by id in a loaded item list."""

    return next((item for item in items if item.get("id") == snippet_id), None)


def _assert_unique_name(items: list[dict[str, Any]], name: str, current_id: str | None = None) -> None:
    """Raise when another snippet already uses the same trigger name."""

    normalized = name.strip()
    if not normalized:
        raise HTTPException(status_code=400, detail="name must not be empty")
    for item in items:
        if item.get("name") == normalized and item.get("id") != current_id:
            raise HTTPException(status_code=409, detail=f"Snippet name already exists: {normalized}")


@router.get("/snippets")
async def list_snippets(
    scope: str | None = Query(None),
    language: str | None = Query(None),
    q: str | None = Query(None),
) -> dict[str, Any]:
    """Return snippets filtered by scope, language, and fuzzy keyword."""

    items = _load_store()
    if scope:
        items = [item for item in items if item.get("scope") == scope]
    if language:
        items = [item for item in items if str(item.get("language", "")).lower() == language.lower()]
    if q:
        needle = q.lower()
        items = [
            item
            for item in items
            if needle in str(item.get("name", "")).lower()
            or needle in str(item.get("zh_name", "")).lower()
            or any(needle in str(tag).lower() for tag in item.get("tags", []))
        ]
    return {"success": True, "count": len(items), "snippets": items}


@router.post("/snippets")
async def create_snippet(payload: SnippetCreate) -> dict[str, Any]:
    """Create a new snippet with a globally unique trigger name."""

    items = _load_store()
    _assert_unique_name(items, payload.name)
    now = _now_iso()
    snippet = {
        "id": f"snip_{uuid4().hex[:8]}",
        "name": payload.name.strip(),
        "zh_name": payload.zh_name,
        "body": payload.body,
        "language": payload.language or "python",
        "tags": _normalize_tags(payload.tags),
        "scope": _validate_scope(payload.scope),
        "version": payload.version or "1.0",
        "created_at": now,
        "updated_at": now,
    }
    items.append(snippet)
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.get("/snippets/{snippet_id}")
async def get_snippet(snippet_id: str) -> dict[str, Any]:
    """Return one snippet including its raw body."""

    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    return {"success": True, "snippet": snippet}


@router.patch("/snippets/{snippet_id}")
async def update_snippet(snippet_id: str, payload: SnippetUpdate) -> dict[str, Any]:
    """Update a snippet and refresh its updated timestamp."""

    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")

    update = payload.model_dump(exclude_unset=True)
    if "name" in update and update["name"] is not None:
        _assert_unique_name(items, str(update["name"]), current_id=snippet_id)
        snippet["name"] = str(update["name"]).strip()
    if "scope" in update and update["scope"] is not None:
        snippet["scope"] = _validate_scope(str(update["scope"]))
    if "tags" in update and update["tags"] is not None:
        snippet["tags"] = _normalize_tags(update["tags"])
    for key in ("zh_name", "body", "language", "version"):
        if key in update and update[key] is not None:
            snippet[key] = update[key]
    snippet["updated_at"] = _now_iso()
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.delete("/snippets/{snippet_id}")
async def delete_snippet(snippet_id: str) -> dict[str, Any]:
    """Delete a snippet by id."""

    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    remaining = [item for item in items if item.get("id") != snippet_id]
    _save_store(remaining)
    return {"success": True, "deleted": snippet_id}
