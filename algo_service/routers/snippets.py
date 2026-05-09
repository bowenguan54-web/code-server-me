"""Code snippet API routes backed by a local JSON store."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.schemas import SnippetCreate, SnippetUpdate
from ..sdk.auth_utils import get_current_user

router = APIRouter(prefix="/api/v1", tags=["snippets"])

STORE_PATH = Path(__file__).resolve().parents[2] / "snippets_store.json"
VALID_SCOPES = {"private", "team"}
VALID_STATUSES = {"draft", "reviewing", "approved", "published", "rejected"}


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
    return [_normalize_snippet(item) for item in data if isinstance(item, dict)]


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


def _validate_status(status: str) -> str:
    """Validate and return a snippet publish status."""

    normalized = str(status or "draft").strip()
    if normalized not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="publish_status is invalid")
    return normalized


def _normalize_snippet(item: dict[str, Any]) -> dict[str, Any]:
    """Backfill newer snippet fields for older JSON records."""

    item.setdefault("owner_id", "system" if item.get("scope") == "team" else "")
    item.setdefault("publish_status", "published" if item.get("scope") == "team" else "draft")
    item.setdefault("tags", [])
    item.setdefault("language", "python")
    item.setdefault("version", "1.0")
    status = str(item.get("publish_status") or "draft")
    if status == "published":
        item["scope"] = "team"
        item["owner_id"] = "system"
    elif item.get("scope") == "team":
        item["scope"] = "private"
    return item


def _optional_current_user(request: Request) -> dict[str, Any] | None:
    """Return the current user when a Bearer token is present."""

    try:
        return get_current_user(request)
    except HTTPException:
        return None


def _is_admin(user: dict[str, Any] | None) -> bool:
    """Return whether the user has administrator privileges."""

    return bool(user and user.get("role") == "admin")


def _snippet_visible(snippet: dict[str, Any], user: dict[str, Any] | None) -> bool:
    """Return whether a snippet is visible to the current user."""

    if _is_admin(user):
        return True
    owner_id = str(snippet.get("owner_id", ""))
    status = str(snippet.get("publish_status", "draft"))
    if status == "published":
        return True
    if user is None:
        return False
    return bool(user and owner_id == user.get("id"))


def _can_edit_snippet(snippet: dict[str, Any], user: dict[str, Any] | None) -> bool:
    """Return whether the current user can mutate a stored snippet."""

    if _is_admin(user):
        return True
    if user is None:
        return False
    if snippet.get("publish_status") == "published":
        return False
    owner_id = str(snippet.get("owner_id", ""))
    return owner_id in {"", str(user.get("id", ""))}


def _require_snippet_edit(snippet: dict[str, Any], user: dict[str, Any] | None) -> None:
    """Raise when the current user cannot edit the snippet."""

    if not _can_edit_snippet(snippet, user):
        raise HTTPException(status_code=403, detail="无权修改该代码片段")


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
    request: Request,
    scope: str | None = Query(None),
    language: str | None = Query(None),
    q: str | None = Query(None),
) -> dict[str, Any]:
    """Return snippets filtered by scope, language, and fuzzy keyword."""

    user = _optional_current_user(request)
    items = _load_store()
    items = [item for item in items if _snippet_visible(item, user)]
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
async def create_snippet(payload: SnippetCreate, request: Request) -> dict[str, Any]:
    """Create a new snippet with a globally unique trigger name."""

    user = _optional_current_user(request)
    items = _load_store()
    _assert_unique_name(items, payload.name)
    now = _now_iso()
    status = "draft"
    snippet = {
        "id": f"snip_{uuid4().hex[:8]}",
        "name": payload.name.strip(),
        "zh_name": payload.zh_name,
        "body": payload.body,
        "language": payload.language or "python",
        "tags": _normalize_tags(payload.tags),
        "scope": "private",
        "version": payload.version or "1.0",
        "owner_id": str(user.get("id")) if user else "system",
        "publish_status": status,
        "created_at": now,
        "updated_at": now,
    }
    items.append(snippet)
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.get("/snippets/{snippet_id}")
async def get_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Return one snippet including its raw body."""

    user = _optional_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    if not _snippet_visible(snippet, user):
        raise HTTPException(status_code=403, detail="无权查看该代码片段")
    return {"success": True, "snippet": snippet}


@router.patch("/snippets/{snippet_id}")
async def update_snippet(snippet_id: str, payload: SnippetUpdate, request: Request) -> dict[str, Any]:
    """Update a snippet and refresh its updated timestamp."""

    user = _optional_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    _require_snippet_edit(snippet, user)

    update = payload.model_dump(exclude_unset=True)
    if "name" in update and update["name"] is not None:
        _assert_unique_name(items, str(update["name"]), current_id=snippet_id)
        snippet["name"] = str(update["name"]).strip()
    if "scope" in update and update["scope"] is not None and user and user.get("role") == "admin":
        snippet["scope"] = _validate_scope(str(update["scope"]))
    if "tags" in update and update["tags"] is not None:
        snippet["tags"] = _normalize_tags(update["tags"])
    if "publish_status" in update and update["publish_status"] is not None and user and user.get("role") == "admin":
        snippet["publish_status"] = _validate_status(str(update["publish_status"]))
    for key in ("zh_name", "body", "language", "version"):
        if key in update and update[key] is not None:
            snippet[key] = update[key]
    snippet["updated_at"] = _now_iso()
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.delete("/snippets/{snippet_id}")
async def delete_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Delete a snippet by id."""

    user = _optional_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    if snippet.get("publish_status") == "published" and not _is_admin(user):
        raise HTTPException(status_code=403, detail="公有代码片段不能由普通用户删除")
    _require_snippet_edit(snippet, user)
    if user and not snippet.get("owner_id") and snippet.get("scope") == "private":
        snippet["owner_id"] = str(user.get("id", ""))
    remaining = [item for item in items if item.get("id") != snippet_id]
    _save_store(remaining)
    return {"success": True, "deleted": snippet_id}


def _transition_snippet_status(
    snippet_id: str,
    request: Request,
    target_status: str,
    *,
    allowed_from: set[str],
    admin_only: bool = False,
    comment: str = "",
) -> dict[str, Any]:
    """Apply a snippet review status transition and persist it."""

    user = _optional_current_user(request)
    if admin_only and not _is_admin(user):
        raise HTTPException(status_code=403, detail="需要管理员权限")
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    if not admin_only and not _can_edit_snippet(snippet, user):
        raise HTTPException(status_code=403, detail="无权操作该代码片段")
    current = str(snippet.get("publish_status", "draft"))
    if current not in allowed_from:
        raise HTTPException(status_code=400, detail=f"当前状态 {current} 不允许执行该操作")
    if user and not snippet.get("owner_id") and snippet.get("scope") == "private":
        snippet["owner_id"] = str(user.get("id", ""))
    snippet["publish_status"] = _validate_status(target_status)
    if target_status == "published":
        snippet["scope"] = "team"
        snippet["owner_id"] = "system"
    if comment:
        snippet["review_comment"] = comment
    snippet["updated_at"] = _now_iso()
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.post("/snippets/{snippet_id}/submit")
async def submit_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Submit a private snippet draft for administrator review."""

    return _transition_snippet_status(snippet_id, request, "reviewing", allowed_from={"draft", "rejected"})


@router.post("/snippets/{snippet_id}/withdraw")
async def withdraw_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Withdraw a snippet from review back to draft."""

    return _transition_snippet_status(snippet_id, request, "draft", allowed_from={"reviewing"})


@router.post("/snippets/{snippet_id}/approve")
async def approve_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Mark a snippet review as approved. Admin only."""

    return _transition_snippet_status(
        snippet_id,
        request,
        "approved",
        allowed_from={"reviewing"},
        admin_only=True,
    )


@router.post("/snippets/{snippet_id}/reject")
async def reject_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Reject a snippet review. Admin only."""

    payload: dict[str, Any] = {}
    try:
        payload = await request.json()
    except ValueError:
        payload = {}
    return _transition_snippet_status(
        snippet_id,
        request,
        "rejected",
        allowed_from={"reviewing"},
        admin_only=True,
        comment=str(payload.get("comment") or payload.get("reason") or ""),
    )


@router.post("/snippets/{snippet_id}/publish")
async def publish_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Publish an approved snippet into the shared library. Admin only."""

    return _transition_snippet_status(
        snippet_id,
        request,
        "published",
        allowed_from={"approved", "reviewing"},
        admin_only=True,
    )
