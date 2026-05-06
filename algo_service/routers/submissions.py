"""Submission review routes for algorithm publish workflow."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..sdk.auth_utils import get_current_user, require_admin
from ..sdk.sse_manager import sse_manager

router = APIRouter(prefix="/api/v1", tags=["submissions"])

_BASE_DIR = Path(__file__).resolve().parents[2]
_SUBMISSIONS_FILE = _BASE_DIR / "submissions_store.json"
_ALGORITHMS_ROOT = _BASE_DIR / "algorithms_root"
_LIBRARY_DIR = _ALGORITHMS_ROOT / "library"


def _load_submissions() -> list[dict[str, Any]]:
    if not _SUBMISSIONS_FILE.exists():
        return []
    with open(_SUBMISSIONS_FILE, "r", encoding="utf-8") as fh:
        data = json.load(fh)
    return data.get("submissions", [])


def _save_submissions(submissions: list[dict[str, Any]]) -> None:
    _SUBMISSIONS_FILE.write_text(
        json.dumps({"submissions": submissions}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _find_submission(submission_id: str) -> dict[str, Any] | None:
    for s in _load_submissions():
        if s.get("id") == submission_id:
            return s
    return None


def _update_submission(submission_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    submissions = _load_submissions()
    for i, s in enumerate(submissions):
        if s.get("id") == submission_id:
            submissions[i] = {**s, **updates}
            _save_submissions(submissions)
            return submissions[i]
    raise HTTPException(status_code=404, detail="提交记录不存在")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _find_entry_dir(algorithm_id: str) -> Path | None:
    """Locate the folder_config.json directory for a given algorithm id."""
    for root_path in _ALGORITHMS_ROOT.rglob("folder_config.json"):
        cfg_dir = root_path.parent
        try:
            cfg = json.loads(root_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        ns = cfg.get("namespace", "")
        for py_file in cfg_dir.glob("*.py"):
            entry_id = f"{ns}.{py_file.stem}"
            if entry_id == algorithm_id:
                return cfg_dir
    return None


# ── Models ─────────────────────────────────────────────────────────────────────


class SubmitParam(BaseModel):
    name: str
    type: str = "Any"
    required: bool = True
    default: str = ""
    desc: str = ""


class SubmitForReviewRequest(BaseModel):
    zh_name: str
    namespace: str
    algo_type: str = ""
    description: str = ""
    params: list[SubmitParam] = []
    returns: str = ""
    dependencies: list[str] = []
    version: str = "1.0.0"
    target_apps: list[str] = []


class ApproveRequest(BaseModel):
    comment: str = ""


class RejectRequest(BaseModel):
    comment: str = ""


# ── User submission endpoints ──────────────────────────────────────────────────


@router.post("/algorithms/{algorithm_id:path}/submit-for-review")
async def submit_for_review(
    algorithm_id: str,
    body: SubmitForReviewRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from .algorithms import get_registry

    registry = get_registry()
    entry = registry.get(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="算法不存在")

    # Owner check (admin can submit any)
    owner_id = getattr(entry, "owner_id", "system")
    if current_user.get("role") != "admin" and owner_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="无权提交此算法")

    # Check namespace uniqueness in library
    library_namespaces: set[str] = set()
    for lib_cfg in _LIBRARY_DIR.rglob("folder_config.json"):
        try:
            cfg = json.loads(lib_cfg.read_text(encoding="utf-8"))
            library_namespaces.add(cfg.get("namespace", ""))
        except Exception:
            pass
    target_ns = body.namespace.strip()
    if target_ns in library_namespaces:
        raise HTTPException(status_code=409, detail=f"命名空间 {target_ns} 在公共库中已存在")

    # Capture code snapshot
    folder_dir = Path(entry.folder_path) if Path(entry.folder_path).is_absolute() else (
        _BASE_DIR / entry.folder_path
    )
    code_snapshot: dict[str, str] = {}
    if folder_dir.exists():
        for py_file in folder_dir.glob("*.py"):
            code_snapshot[py_file.name] = py_file.read_text(encoding="utf-8")
        cfg_path = folder_dir / "folder_config.json"
        if cfg_path.exists():
            code_snapshot["folder_config.json"] = cfg_path.read_text(encoding="utf-8")

    submission_id = f"sub_{uuid4().hex[:12]}"
    submission: dict[str, Any] = {
        "id": submission_id,
        "algorithm_id": algorithm_id,
        "owner_id": current_user["id"],
        "owner_name": current_user.get("display_name", current_user["username"]),
        "zh_name": body.zh_name,
        "namespace": target_ns,
        "algo_type": body.algo_type,
        "description": body.description,
        "params": [p.model_dump() for p in body.params],
        "returns": body.returns,
        "dependencies": body.dependencies,
        "version": body.version,
        "target_apps": body.target_apps,
        "code_snapshot": code_snapshot,
        "status": "reviewing",
        "submitted_at": _now_iso(),
        "reviewer_id": None,
        "reviewed_at": None,
        "verdict": None,
        "comment": "",
    }
    submissions = _load_submissions()
    submissions.append(submission)
    _save_submissions(submissions)

    # Update folder_config publish_status
    cfg_file = folder_dir / "folder_config.json"
    if cfg_file.exists():
        try:
            cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
            cfg["publish_status"] = "reviewing"
            cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass

    registry.rescan_file(str(entry.source_file))

    sse_manager.broadcast({
        "event": "submission_created",
        "submission_id": submission_id,
        "algorithm_id": algorithm_id,
    })

    pub = {k: v for k, v in submission.items() if k != "code_snapshot"}
    return {"success": True, "submission": pub}


@router.get("/user/submissions")
async def my_submissions(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = current_user["id"]
    result = [
        {k: v for k, v in s.items() if k != "code_snapshot"}
        for s in _load_submissions()
        if s.get("owner_id") == user_id
    ]
    return {"success": True, "submissions": result}


@router.delete("/submissions/{submission_id}/withdraw")
async def withdraw_submission(
    submission_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    from .algorithms import get_registry

    sub = _find_submission(submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    if sub.get("owner_id") != current_user["id"] and current_user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="无权操作")
    if sub.get("status") != "reviewing":
        raise HTTPException(status_code=400, detail="只有审核中的提交可以撤回")

    _update_submission(submission_id, {"status": "withdrawn", "reviewed_at": _now_iso()})

    # Revert folder_config publish_status to draft
    registry = get_registry()
    entry = registry.get(sub["algorithm_id"])
    if entry:
        folder_dir = Path(entry.folder_path) if Path(entry.folder_path).is_absolute() else (
            _BASE_DIR / entry.folder_path
        )
        cfg_file = folder_dir / "folder_config.json"
        if cfg_file.exists():
            try:
                cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
                cfg["publish_status"] = "draft"
                cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
        registry.rescan_file(str(entry.source_file))

    return {"success": True}


# ── Admin review endpoints ─────────────────────────────────────────────────────


@router.get("/admin/submissions")
async def admin_list_submissions(
    status: str = "reviewing",
    admin: dict = Depends(require_admin),
) -> dict:
    all_subs = _load_submissions()
    filtered = [
        {k: v for k, v in s.items() if k != "code_snapshot"}
        for s in all_subs
        if not status or s.get("status") == status
    ]
    return {"success": True, "submissions": filtered, "count": len(filtered)}


@router.get("/admin/submissions/{submission_id}")
async def admin_get_submission(
    submission_id: str,
    admin: dict = Depends(require_admin),
) -> dict:
    sub = _find_submission(submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    return {"success": True, "submission": sub}


@router.post("/admin/submissions/{submission_id}/approve")
async def approve_submission(
    submission_id: str,
    body: ApproveRequest,
    admin: dict = Depends(require_admin),
) -> dict:
    from .algorithms import get_registry

    sub = _find_submission(submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    if sub.get("status") != "reviewing":
        raise HTTPException(status_code=400, detail="只有审核中的提交可以审批")

    # Create library entry from code_snapshot
    namespace_path = sub["namespace"].replace(".", "/")
    target_dir = _LIBRARY_DIR / namespace_path
    target_dir.mkdir(parents=True, exist_ok=True)

    snapshot = sub.get("code_snapshot", {})
    for filename, content in snapshot.items():
        (target_dir / filename).write_text(content, encoding="utf-8")

    # Write/overwrite folder_config.json with published metadata
    lib_config: dict[str, Any] = {
        "namespace": sub["namespace"],
        "owner_id": "system",
        "zh_name": sub["zh_name"],
        "module_kind": "component",
        "publish_status": "published",
        "published": True,
        "version": sub.get("version", "1.0.0"),
        "zh_description": sub.get("description", ""),
        "zh_tags": [],
    }
    (target_dir / "folder_config.json").write_text(
        json.dumps(lib_config, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    registry = get_registry()
    registry.scan_directory(str(_LIBRARY_DIR))

    # Update original algorithm publish_status
    entry = registry.get(sub["algorithm_id"])
    if entry:
        folder_dir = Path(entry.folder_path) if Path(entry.folder_path).is_absolute() else (
            _BASE_DIR / entry.folder_path
        )
        cfg_file = folder_dir / "folder_config.json"
        if cfg_file.exists():
            try:
                cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
                cfg["publish_status"] = "published"
                cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
        registry.rescan_file(str(entry.source_file))

    _update_submission(submission_id, {
        "status": "approved",
        "verdict": "approved",
        "comment": body.comment,
        "reviewer_id": admin["id"],
        "reviewed_at": _now_iso(),
    })

    sse_manager.broadcast({
        "event": "algorithm_published",
        "namespace": sub["namespace"],
        "submission_id": submission_id,
    })

    return {"success": True}


@router.post("/admin/submissions/{submission_id}/reject")
async def reject_submission(
    submission_id: str,
    body: RejectRequest,
    admin: dict = Depends(require_admin),
) -> dict:
    from .algorithms import get_registry

    sub = _find_submission(submission_id)
    if sub is None:
        raise HTTPException(status_code=404, detail="提交记录不存在")
    if sub.get("status") != "reviewing":
        raise HTTPException(status_code=400, detail="只有审核中的提交可以驳回")

    _update_submission(submission_id, {
        "status": "rejected",
        "verdict": "rejected",
        "comment": body.comment,
        "reviewer_id": admin["id"],
        "reviewed_at": _now_iso(),
    })

    # Revert to draft
    registry = get_registry()
    entry = registry.get(sub["algorithm_id"])
    if entry:
        folder_dir = Path(entry.folder_path) if Path(entry.folder_path).is_absolute() else (
            _BASE_DIR / entry.folder_path
        )
        cfg_file = folder_dir / "folder_config.json"
        if cfg_file.exists():
            try:
                cfg = json.loads(cfg_file.read_text(encoding="utf-8"))
                cfg["publish_status"] = "draft"
                cfg_file.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
            except Exception:
                pass
        registry.rescan_file(str(entry.source_file))

    sse_manager.broadcast({
        "event": "submission_rejected",
        "submission_id": submission_id,
        "algorithm_id": sub["algorithm_id"],
    })

    return {"success": True}
