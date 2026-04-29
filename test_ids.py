#!/usr/bin/env python3
import sys, json, urllib.request

BASE = "http://localhost:8000"

# Get all algorithms and find my_algorithm entries
req = urllib.request.Request(f"{BASE}/api/v1/algorithms?module_kind=component")
with urllib.request.urlopen(req) as r:
    data = json.load(r)

for a in data.get("algorithms", []):
    if "my_algor" in a.get("id", "").lower():
        print(f"id={a['id']} status={a['publishStatus']} hasDraft={a['hasReviewDraft']} packageRoot={a.get('packageRoot')}")
