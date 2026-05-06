#!/usr/bin/env python3
import json
users = json.load(open("/home/guan/code-server-me/users_store.json"))
for u in users.get("users", []):
    print(u["username"], u["status"], u.get("role"))
