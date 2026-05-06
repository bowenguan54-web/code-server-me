"""JWT authentication utilities for AlgoLib service."""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import Depends, HTTPException, Request
from jose import JWTError, jwt

SECRET_KEY = os.environ.get("ALGOLIB_JWT_SECRET", "algolib-dev-secret")
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24

_USERS_FILE = Path(__file__).resolve().parents[2] / "users_store.json"


def _load_users() -> list[dict[str, Any]]:
    if not _USERS_FILE.exists():
        return []
    with open(_USERS_FILE, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("users", [])


def _save_users(users: list[dict[str, Any]]) -> None:
    _USERS_FILE.write_text(
        json.dumps({"users": users}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def find_user_by_username(username: str) -> dict[str, Any] | None:
    for user in _load_users():
        if user.get("username") == username:
            return user
    return None


def find_user_by_id(user_id: str) -> dict[str, Any] | None:
    for user in _load_users():
        if user.get("id") == user_id:
            return user
    return None


def update_user(user_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
    users = _load_users()
    for i, user in enumerate(users):
        if user.get("id") == user_id:
            users[i] = {**user, **updates}
            _save_users(users)
            return users[i]
    return None


def create_user_record(user: dict[str, Any]) -> None:
    users = _load_users()
    users.append(user)
    _save_users(users)


def get_all_users() -> list[dict[str, Any]]:
    return _load_users()


def create_access_token(user: dict[str, Any]) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "role": user.get("role", "user"),
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="无效或过期的 Token") from exc


def get_current_user(request: Request) -> dict[str, Any]:
    """FastAPI dependency: parse Bearer token and return user dict."""
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="缺少认证 Token")
    token = auth.removeprefix("Bearer ").strip()
    payload = decode_token(token)
    user_id: str = payload.get("sub", "")
    user = find_user_by_id(user_id)
    if user is None or user.get("disabled"):
        raise HTTPException(status_code=401, detail="用户不存在或已禁用")
    return user


def require_admin(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    """FastAPI dependency: require admin role."""
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
