"""Authentication routes: login, me, logout, change password."""

from __future__ import annotations

from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..sdk.auth_utils import (
    create_access_token,
    find_user_by_username,
    find_user_by_id,
    get_current_user,
    update_user,
)

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str


def _public_user(user: dict) -> dict:
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user.get("role", "user"),
        "display_name": user.get("display_name", user["username"]),
    }


@router.post("/login")
async def login(body: LoginRequest) -> dict:
    user = find_user_by_username(body.username)
    if user is None or user.get("disabled"):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    stored_hash = user.get("password_hash", "")
    if not bcrypt.checkpw(body.password.encode(), stored_hash.encode()):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_access_token(user)
    return {"success": True, "token": token, "user": _public_user(user)}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)) -> dict:
    return {"success": True, "user": _public_user(current_user)}


@router.post("/logout")
async def logout() -> dict:
    return {"success": True}


@router.patch("/me/password")
async def change_my_password(
    body: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    stored_hash = current_user.get("password_hash", "")
    if not bcrypt.checkpw(body.old_password.encode(), stored_hash.encode()):
        raise HTTPException(status_code=400, detail="旧密码不正确")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")
    new_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
    update_user(current_user["id"], {"password_hash": new_hash})
    return {"success": True}
