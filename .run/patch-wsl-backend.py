from pathlib import Path

root = Path('/home/guan/code-server-me')

# auth.py: write browser login session for local extensions.
p = root / 'algo_service/routers/auth.py'
s = p.read_text(encoding='utf-8')
if 'import json' not in s.split('\n')[:10]:
    s = s.replace('from datetime import datetime, timezone\n', 'from datetime import datetime, timezone\nimport json\nfrom pathlib import Path\n')
if '_SESSION_PATH' not in s:
    s = s.replace('router = APIRouter(prefix="/api/v1/auth", tags=["auth"])\n', 'router = APIRouter(prefix="/api/v1/auth", tags=["auth"])\n\n_PROJECT_ROOT = Path(__file__).resolve().parents[2]\n_SESSION_PATH = _PROJECT_ROOT / ".run" / "algolib-current-session.json"\n')
if 'def _write_current_session' not in s:
    marker = 'def _public_user(user: dict) -> dict:\n    return {\n        "id": user["id"],\n        "username": user["username"],\n        "role": user.get("role", "user"),\n        "display_name": user.get("display_name", user["username"]),\n    }\n'
    helper = marker + '''\n\ndef _write_current_session(token: str, user: dict) -> None:\n    """Persist the latest login so the local code-server extension can reuse it."""\n\n    try:\n        _SESSION_PATH.parent.mkdir(parents=True, exist_ok=True)\n        _SESSION_PATH.write_text(\n            json.dumps(\n                {\n                    "token": token,\n                    "user": _public_user(user),\n                    "updated_at": datetime.now(timezone.utc).isoformat(),\n                },\n                ensure_ascii=False,\n                indent=2,\n            ),\n            encoding="utf-8",\n        )\n    except OSError:\n        return\n'''
    s = s.replace(marker, helper)
if '_write_current_session(token, user)' not in s:
    s = s.replace('    token = create_access_token(user)\n    return {"success": True, "token": token, "user": _public_user(user)}\n', '    token = create_access_token(user)\n    _write_current_session(token, user)\n    return {"success": True, "token": token, "user": _public_user(user)}\n')
p.write_text(s, encoding='utf-8')

# stubs.py: unauthenticated callers only see public/system algorithms.
p = root / 'algo_service/routers/stubs.py'
s = p.read_text(encoding='utf-8')
s = s.replace('    if not auth.startswith("Bearer "):\n        return entries\n', '    if not auth.startswith("Bearer "):\n        return [entry for entry in entries if entry.owner_id == "system"]\n')
p.write_text(s, encoding='utf-8')

# algorithms.py: list/search visibility filtering.
p = root / 'algo_service/routers/algorithms.py'
s = p.read_text(encoding='utf-8')
if 'def _visible_entries_for_request' not in s:
    marker = '_ALGORITHMS_ROOT = Path(__file__).resolve().parents[2] / "algorithms_root"\n'
    helper = marker + '''\n\ndef _visible_entries_for_request(entries: list[AlgorithmEntry], request: Request | None) -> list[AlgorithmEntry]:\n    """Filter algorithms to public entries plus the current user's private entries."""\n\n    auth = request.headers.get("Authorization", "") if request else ""\n    if not auth.startswith("Bearer "):\n        return [entry for entry in entries if getattr(entry, "owner_id", "system") == "system"]\n    try:\n        current_user = get_current_user(request)\n    except HTTPException:\n        return [entry for entry in entries if getattr(entry, "owner_id", "system") == "system"]\n    user_id = str(current_user.get("id", ""))\n    if current_user.get("role") == "admin":\n        return entries\n    return [\n        entry\n        for entry in entries\n        if getattr(entry, "owner_id", "system") == "system"\n        or getattr(entry, "owner_id", "system") == user_id\n    ]\n'''
    s = s.replace(marker, helper)
# Replace old list visibility block if present, otherwise ensure a filter before return.
start = s.find('@router.get("/algorithms")')
end = s.find('\n\nclass UserAlgorithmCreateRequest', start)
block = s[start:end]
if 'entries = _visible_entries_for_request(entries, request)' not in block:
    block = block.replace('    if module_kind:\n        entries = [entry for entry in entries if entry.type == module_kind]\n', '    if module_kind:\n        entries = [entry for entry in entries if entry.type == module_kind]\n    entries = _visible_entries_for_request(entries, request)\n')
    s = s[:start] + block + s[end:]
# Ensure search signature and filter.
start = s.find('@router.get("/algorithms/search")')
end = s.find('\n\n@router.post("/algorithms/{algorithm_id:path}/publish-as-component")', start)
block = s[start:end]
if 'request: Request = None' not in block:
    block = block.replace('    registry: AlgorithmRegistry = Depends(get_registry),\n', '    registry: AlgorithmRegistry = Depends(get_registry),\n    request: Request = None,\n')
if 'entries = _visible_entries_for_request(entries, request)' not in block:
    block = block.replace('    if module_kind:\n        entries = [entry for entry in entries if entry.type == module_kind]\n\n    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}', '    if module_kind:\n        entries = [entry for entry in entries if entry.type == module_kind]\n    entries = _visible_entries_for_request(entries, request)\n\n    return {"success": True, "count": len(entries), "algorithms": [_entry_dict(entry) for entry in entries]}')
s = s[:start] + block + s[end:]
p.write_text(s, encoding='utf-8')
