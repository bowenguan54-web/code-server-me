"""Code snippet API routes backed by a local JSON store."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query, Request

from ..models.schemas import SnippetCreate, SnippetUpdate
from ..sdk.auth_utils import get_current_user, require_admin

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


def _normalize_tags(tags: list[str] | None) -> list[str]:
    """Normalize a snippet tag list."""

    return [str(tag).strip() for tag in (tags or []) if str(tag).strip()]


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
    item.setdefault("history", [])
    item.setdefault("review_draft", None)
    item["tags"] = _normalize_tags(item.get("tags", []))
    status = str(item.get("publish_status") or "draft")
    if status == "published":
        item["scope"] = "team"
        item["owner_id"] = "system"
    elif item.get("scope") == "team":
        item["scope"] = "private"
    if item.get("review_draft") is not None and not isinstance(item.get("review_draft"), dict):
        item["review_draft"] = None
    if not isinstance(item.get("history"), list):
        item["history"] = []
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


def _user_id(user: dict[str, Any] | None) -> str:
    """Return a stable user id for history records."""

    return str((user or {}).get("id") or "system")


def _user_name(user: dict[str, Any] | None) -> str:
    """Return a display name for history records."""

    if not user:
        return "system"
    return str(user.get("display_name") or user.get("username") or user.get("id") or "system")


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
    return owner_id in {"", _user_id(user)}


def _can_edit_snippet(snippet: dict[str, Any], user: dict[str, Any] | None) -> bool:
    """Return whether the current user can directly mutate a stored snippet."""

    if _is_admin(user):
        return True
    if user is None:
        return False
    if snippet.get("publish_status") == "published":
        return False
    owner_id = str(snippet.get("owner_id", ""))
    return owner_id in {"", _user_id(user)}


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


def _append_history(
    snippet: dict[str, Any],
    action: str,
    user: dict[str, Any] | None,
    *,
    from_version: str = "",
    to_version: str = "",
    note: str = "",
) -> None:
    """Append a persistent snippet contribution history item."""

    history = snippet.setdefault("history", [])
    if not isinstance(history, list):
        history = []
        snippet["history"] = history
    history.append(
        {
            "operator": _user_id(user),
            "operator_name": _user_name(user),
            "timestamp": _now_iso(),
            "action": action,
            "from_version": from_version,
            "to_version": to_version,
            "note": note,
        }
    )


def _get_json_body(request: Request) -> dict[str, Any]:
    """Placeholder for type checkers; async routes parse JSON directly."""

    raise RuntimeError("Use await request.json() inside async routes")


@router.get("/snippets")
async def list_snippets(
    request: Request,
    scope: str | None = Query(None),
    language: str | None = Query(None),
    q: str | None = Query(None),
) -> dict[str, Any]:
    """Return snippets filtered by scope, language, and fuzzy keyword."""

    user = _optional_current_user(request)
    items = [item for item in _load_store() if _snippet_visible(item, user)]
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
    """Create a new private snippet with a globally unique trigger name."""

    user = _optional_current_user(request)
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
        "scope": "private",
        "version": payload.version or "1.0",
        "owner_id": _user_id(user),
        "publish_status": "draft",
        "history": [],
        "review_draft": None,
        "created_at": now,
        "updated_at": now,
    }
    _append_history(snippet, "create", user, to_version=str(snippet["version"]), note="创建私有代码片段")
    items.append(snippet)
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.get("/snippets/{snippet_id}")
async def get_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Return one snippet including its raw body and history."""

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
    """Update a directly editable snippet and refresh its updated timestamp."""

    user = _optional_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    _require_snippet_edit(snippet, user)

    update = payload.model_dump(exclude_unset=True) if hasattr(payload, "model_dump") else payload.dict(exclude_unset=True)
    before_version = str(snippet.get("version") or "1.0")
    if "name" in update and update["name"] is not None:
        _assert_unique_name(items, str(update["name"]), current_id=snippet_id)
        snippet["name"] = str(update["name"]).strip()
    if "scope" in update and update["scope"] is not None and _is_admin(user):
        snippet["scope"] = _validate_scope(str(update["scope"]))
    if "tags" in update and update["tags"] is not None:
        snippet["tags"] = _normalize_tags(update["tags"])
    if "publish_status" in update and update["publish_status"] is not None and _is_admin(user):
        snippet["publish_status"] = _validate_status(str(update["publish_status"]))
    for key in ("zh_name", "body", "language", "version"):
        if key in update and update[key] is not None:
            snippet[key] = update[key]
    snippet["updated_at"] = _now_iso()
    _append_history(
        snippet,
        "update",
        user,
        from_version=before_version,
        to_version=str(snippet.get("version") or before_version),
        note="更新代码片段",
    )
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
    before_version = str(snippet.get("version") or "1.0")
    snippet["publish_status"] = _validate_status(target_status)
    if target_status == "published":
        snippet["scope"] = "team"
        snippet["owner_id"] = "system"
    if comment:
        snippet["review_comment"] = comment
    snippet["updated_at"] = _now_iso()
    _append_history(
        snippet,
        target_status,
        user,
        from_version=before_version,
        to_version=str(snippet.get("version") or before_version),
        note=comment,
    )
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

    return _transition_snippet_status(snippet_id, request, "approved", allowed_from={"reviewing"}, admin_only=True)


@router.post("/snippets/{snippet_id}/reject")
async def reject_snippet(snippet_id: str, request: Request) -> dict[str, Any]:
    """Reject a snippet review. Admin only."""

    payload: dict[str, Any] = {}
    try:
        payload = await request.json()
    except json.JSONDecodeError:
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


@router.get("/snippets/{snippet_id}/edit-draft")
async def get_snippet_edit_draft(snippet_id: str, request: Request) -> dict[str, Any]:
    """Return the current pending public-snippet edit draft."""

    user = _optional_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    draft = snippet.get("review_draft")
    if not draft:
        return {"success": True, "draft": None}
    allowed = _is_admin(user) or _user_id(user) in {str(draft.get("submitter_id", "")), str(snippet.get("owner_id", ""))}
    if not allowed:
        raise HTTPException(status_code=403, detail="无权查看该修改草稿")
    return {"success": True, "draft": draft}


@router.post("/snippets/{snippet_id}/edit-draft")
async def submit_snippet_edit_draft(snippet_id: str, request: Request) -> dict[str, Any]:
    """Submit a public snippet edit draft without mutating the published snippet."""

    user = get_current_user(request)
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    if snippet.get("publish_status") != "published":
        raise HTTPException(status_code=400, detail="只有公有代码片段需要提交修改审核")
    try:
        payload = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="请求体必须是 JSON") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="请求体必须是对象")
    new_name = str(payload.get("name") or snippet.get("name") or "").strip()
    _assert_unique_name(items, new_name, current_id=snippet_id)
    base_version = str(snippet.get("version") or "1.0")
    raw_tags = payload.get("tags", snippet.get("tags", []))
    if isinstance(raw_tags, str):
        raw_tags = raw_tags.split(",")
    metadata = {
        "name": new_name,
        "zh_name": str(payload.get("zh_name") or snippet.get("zh_name") or ""),
        "language": str(payload.get("language") or snippet.get("language") or "python"),
        "tags": _normalize_tags(raw_tags if isinstance(raw_tags, list) else []),
        "version": str(payload.get("version") or base_version),
    }
    draft = {
        "body": str(payload.get("body") if payload.get("body") is not None else snippet.get("body") or ""),
        "metadata": metadata,
        "submitter_id": _user_id(user),
        "submitter_name": _user_name(user),
        "status": "reviewing",
        "submitted_at": _now_iso(),
        "base_version": base_version,
        "reject_reason": "",
    }
    snippet["review_draft"] = draft
    snippet["updated_at"] = _now_iso()
    _append_history(snippet, "edit_submitted", user, from_version=base_version, to_version=metadata["version"], note="提交公有片段修改")
    _save_store(items)
    return {"success": True, "snippet": snippet, "draft": draft}


@router.post("/snippets/{snippet_id}/approve-edit")
async def approve_snippet_edit_draft(snippet_id: str, request: Request) -> dict[str, Any]:
    """Apply a pending public-snippet edit draft. Admin only."""

    user = require_admin(get_current_user(request))
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    draft = snippet.get("review_draft")
    if not isinstance(draft, dict) or draft.get("status") not in {"pending", "reviewing"}:
        raise HTTPException(status_code=400, detail="没有待审核的片段修改")
    before_version = str(snippet.get("version") or "1.0")
    metadata = draft.get("metadata") if isinstance(draft.get("metadata"), dict) else {}
    snippet["body"] = str(draft.get("body") or "")
    for key in ("name", "zh_name", "language", "version"):
        if key in metadata:
            snippet[key] = metadata[key]
    if isinstance(metadata.get("tags"), list):
        snippet["tags"] = _normalize_tags(metadata["tags"])
    snippet["publish_status"] = "published"
    snippet["scope"] = "team"
    snippet["owner_id"] = "system"
    snippet["updated_at"] = _now_iso()
    _append_history(
        snippet,
        "edit_approved",
        user,
        from_version=before_version,
        to_version=str(snippet.get("version") or before_version),
        note=f"通过 {draft.get('submitter_name') or draft.get('submitter_id') or '用户'} 的修改",
    )
    snippet["review_draft"] = None
    _save_store(items)
    return {"success": True, "snippet": snippet}


@router.post("/snippets/{snippet_id}/reject-edit")
async def reject_snippet_edit_draft(snippet_id: str, request: Request) -> dict[str, Any]:
    """Reject a pending public-snippet edit draft. Admin only."""

    user = require_admin(get_current_user(request))
    items = _load_store()
    snippet = _find_snippet(items, snippet_id)
    if snippet is None:
        raise HTTPException(status_code=404, detail=f"Snippet not found: {snippet_id}")
    draft = snippet.get("review_draft")
    if not isinstance(draft, dict) or draft.get("status") not in {"pending", "reviewing"}:
        raise HTTPException(status_code=400, detail="没有待审核的片段修改")
    payload: dict[str, Any] = {}
    try:
        payload = await request.json()
    except json.JSONDecodeError:
        payload = {}
    reason = str(payload.get("comment") or payload.get("reason") or "")
    draft["status"] = "rejected"
    draft["reviewed_at"] = _now_iso()
    draft["reviewer_id"] = _user_id(user)
    draft["reviewer_name"] = _user_name(user)
    draft["reject_reason"] = reason
    snippet["review_draft"] = draft
    snippet["updated_at"] = _now_iso()
    _append_history(snippet, "edit_rejected", user, from_version=str(snippet.get("version") or "1.0"), note=reason)
    _save_store(items)
    return {"success": True, "snippet": snippet, "draft": draft}
