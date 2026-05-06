"""User management routes (admin only)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..sdk.auth_utils import (
    create_user_record,
    find_user_by_id,
    get_all_users,
    require_admin,
    update_user,
    get_current_user,
    _load_users,
    _save_users,
)

router = APIRouter(prefix="/api/v1/admin/users", tags=["users"])

_BASE_DIR = Path(__file__).resolve().parents[2]
_USERS_DIR = _BASE_DIR / "algorithms_root" / "users"


def _make_public(user: dict) -> dict:
    return {k: v for k, v in user.items() if k != "password_hash"}


class UserCreateRequest(BaseModel):
    username: str
    password: str
    role: str = "user"
    display_name: str = ""


class UserPatchRequest(BaseModel):
    role: str | None = None
    display_name: str | None = None
    disabled: bool | None = None


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.get("")
async def list_users(admin: dict = Depends(require_admin)) -> dict:
    users = get_all_users()
    return {"success": True, "users": [_make_public(u) for u in users]}


@router.post("")
async def create_user(body: UserCreateRequest, admin: dict = Depends(require_admin)) -> dict:
    existing = [u for u in get_all_users() if u.get("username") == body.username]
    if existing:
        raise HTTPException(status_code=409, detail="用户名已存在")
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    user_id = f"usr_{uuid4().hex[:8]}"
    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user: dict[str, Any] = {
        "id": user_id,
        "username": body.username,
        "password_hash": password_hash,
        "role": body.role,
        "display_name": body.display_name or body.username,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "disabled": False,
    }
    create_user_record(user)

    # Create private user directory with a default placeholder folder
    user_dir = _USERS_DIR / user_id
    user_dir.mkdir(parents=True, exist_ok=True)
    readme_dir = user_dir / "我的算法"
    readme_dir.mkdir(exist_ok=True)
    (readme_dir / "folder_config.json").write_text(
        '{\n  "namespace": "' + body.username + '",\n  "owner_id": "' + user_id
        + '",\n  "module_kind": "component",\n  "publish_status": "draft"\n}\n',
        encoding="utf-8",
    )

    return {"success": True, "user": _make_public(user)}


@router.patch("/{user_id}")
async def patch_user(
    user_id: str,
    body: UserPatchRequest,
    admin: dict = Depends(require_admin),
) -> dict:
    target = find_user_by_id(user_id)
    if target is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if admin["id"] == user_id and body.role is not None and body.role != admin.get("role"):
        raise HTTPException(status_code=400, detail="不能修改自己的角色")
    updates: dict[str, Any] = {}
    if body.role is not None:
        updates["role"] = body.role
    if body.display_name is not None:
        updates["display_name"] = body.display_name
    if body.disabled is not None:
        updates["disabled"] = body.disabled
    updated = update_user(user_id, updates)
    return {"success": True, "user": _make_public(updated)}


@router.post("/{user_id}/reset-password")
async def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    admin: dict = Depends(require_admin),
) -> dict:
    if find_user_by_id(user_id) is None:
        raise HTTPException(status_code=404, detail="用户不存在")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="密码至少 6 位")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    update_user(user_id, {"password_hash": new_hash})
    return {"success": True}


@router.delete("/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)) -> dict:
    if admin["id"] == user_id:
        raise HTTPException(status_code=400, detail="不能删除自己")
    users = _load_users()
    new_users = [u for u in users if u.get("id") != user_id]
    if len(new_users) == len(users):
        raise HTTPException(status_code=404, detail="用户不存在")
    _save_users(new_users)
    return {"success": True}
