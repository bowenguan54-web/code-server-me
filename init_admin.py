#!/usr/bin/env python3
"""
Initialize the admin user in users_store.json.

Usage:
    python init_admin.py

Environment variables:
    ADMIN_PASSWORD  - Admin password (default: Admin@123)
    ADMIN_USERNAME  - Admin username (default: admin)
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from uuid import uuid4

try:
    import bcrypt
except ImportError:
    print("ERROR: bcrypt not installed. Run: pip install bcrypt", file=sys.stderr)
    sys.exit(1)

_USERS_FILE = Path(__file__).resolve().parent / "users_store.json"
_ALGORITHMS_ROOT = Path(__file__).resolve().parent / "algorithms_root"


def _load_users() -> list[dict]:
    if not _USERS_FILE.exists():
        return []
    with open(_USERS_FILE, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("users", [])


def _save_users(users: list[dict]) -> None:
    _USERS_FILE.write_text(
        json.dumps({"users": users}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def main() -> None:
    username = os.environ.get("ADMIN_USERNAME", "admin").strip()
    password = os.environ.get("ADMIN_PASSWORD", "Admin@123").strip()

    users = _load_users()

    # Check if admin already exists
    for user in users:
        if user.get("username") == username:
            print(f"Admin user '{username}' already exists (id={user['id']}). Skipping.")
            return

    # Create admin user
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = "usr_admin"
    # Ensure unique id
    existing_ids = {u["id"] for u in users}
    if user_id in existing_ids:
        user_id = f"usr_{uuid4().hex[:8]}"

    admin_user = {
        "id": user_id,
        "username": username,
        "display_name": "管理员",
        "password_hash": hashed,
        "role": "admin",
        "status": "active",
        "created_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    }
    users.append(admin_user)
    _save_users(users)

    # Create algorithms_root/users/usr_admin directory
    user_algo_dir = _ALGORITHMS_ROOT / "users" / user_id / "我的算法"
    user_algo_dir.mkdir(parents=True, exist_ok=True)
    cfg_path = user_algo_dir / "folder_config.json"
    if not cfg_path.exists():
        cfg_path.write_text(
            json.dumps({
                "namespace": "我的算法",
                "owner_id": user_id,
                "module_kind": "component",
                "zh_name": "我的算法",
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # Create algorithms_root/library directory
    library_dir = _ALGORITHMS_ROOT / "library"
    library_dir.mkdir(parents=True, exist_ok=True)

    print(f"Admin user created: username='{username}', id='{user_id}'")
    print(f"User directory: {user_algo_dir}")


if __name__ == "__main__":
    main()
