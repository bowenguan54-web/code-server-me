#!/usr/bin/env python3
import urllib.request, urllib.error, json, os

BASE = "http://localhost:8000"
DRAFT_FILE = "/home/guan/code-server-me/algorithms_root/custom/my_algorithm/.review_draft_custom_my_algorithm.json"

def api(path, method="GET", data=None):
    url = BASE + path
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method,
                                  headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as r:
        return json.load(r)

# Use existing package algorithm
algo_id = "custom.my_algorithm"
print(f"=== Testing {algo_id} ===")
print(f"Draft file exists before test: {os.path.exists(DRAFT_FILE)}")

r0 = api(f"/api/v1/algorithms/{algo_id}/withdraw", "POST", {})
print(f"After withdraw: status={r0['algorithm']['publishStatus']}, hasDraft={r0['algorithm']['hasReviewDraft']}")
print(f"Draft file exists after withdraw: {os.path.exists(DRAFT_FILE)}")

# Submit for review
print("Submitting for review...")
r2 = api(f"/api/v1/algorithms/{algo_id}/submit", "POST", {})
status2 = r2["algorithm"]["publishStatus"]
has_draft = r2["algorithm"]["hasReviewDraft"]
print(f"  status={status2}, hasReviewDraft={has_draft}")

# Verify via GET
print("Verifying via GET...")
r3 = api("/api/v1/algorithms?module_kind=component")
entry = next((a for a in r3["algorithms"] if a["id"] == algo_id), None)
if entry:
    print(f"  GET status={entry['publishStatus']}, hasReviewDraft={entry['hasReviewDraft']}")
else:
    print("  NOT FOUND in list!")
