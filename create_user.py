#!/usr/bin/env python3
"""Create a regular test user."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

try:
    import bcrypt
except ImportError:
    print("bcrypt not installed")
    sys.exit(1)

store = Path(__file__).parent / "users_store.json"
data = json.loads(store.read_text(encoding="utf-8")) if store.exists() else {"users": []}

existing = [u["username"] for u in data.get("users", [])]
if "zhangsan" in existing:
    print("User zhangsan already exists")
else:
    pw = bcrypt.hashpw(b"Zhangsan@123", bcrypt.gensalt()).decode()
    data.setdefault("users", []).append({
        "id": "usr_zhangsan",
        "username": "zhangsan",
        "password_hash": pw,
        "role": "user",
        "status": "active",
        "display_name": "张三",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    store.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print("User zhangsan created with password Zhangsan@123")
