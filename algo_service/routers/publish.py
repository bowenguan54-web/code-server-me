"""Publishing lifecycle routes for algorithm components."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from .algorithms import (
    _apply_review_draft,
    _delete_review_draft,
    _entry_config_path,
    _entry_dict,
    _load_review_draft,
    _save_review_draft,
    get_registry,
)
from ..sdk.registry import AlgorithmEntry, AlgorithmRegistry

router = APIRouter(prefix="/api/v1", tags=["publish"])

ALLOWED_TRANSITIONS = {
    "draft": {"reviewing"},
    "reviewing": {"approved", "rejected", "draft"},
    "rejected": {"draft", "reviewing"},
    "approved": {"published", "reviewing"},
    "published": {"deprecated", "reviewing"},
    "deprecated": set(),
}


class ReasonBody(BaseModel):
    """Optional reason body for publish lifecycle operations."""

    reason: str = ""
    version_change: str = ""
    target_version: str = ""


def _now_iso() -> str:
    """Return the current UTC timestamp."""

    return datetime.now(timezone.utc).isoformat()


def _load_config() -> dict[str, Any]:
    """Load service configuration from config.yaml."""

    config_path = Path(__file__).resolve().parents[2] / "config.yaml"
    if not config_path.exists():
        return {}
    try:
        loaded = yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read config.yaml: {exc}") from exc
    if not isinstance(loaded, dict):
        return {}
    return loaded


def _require_admin_token(x_admin_token: str | None) -> None:
    """Validate an admin token against config.yaml."""

    expected = str(_load_config().get("admin_token", "") or "")
    if not expected or x_admin_token != expected:
        raise HTTPException(status_code=403, detail="Invalid admin token")


def _load_json(path: Path) -> dict[str, Any]:
    """Load a JSON object from disk."""

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Config file not found: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read config file: {exc}") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=500, detail=f"Config file must contain an object: {path}")
    return data


def _save_json(path: Path, payload: dict[str, Any]) -> None:
    """Write a JSON object to disk."""

    try:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write config file: {exc}") from exc


def _history_path(entry: AlgorithmEntry) -> Path:
    """Return the publish history path for an entry."""

    return _entry_config_path(entry).parent / "publish_history.json"


def _load_history(entry: AlgorithmEntry) -> list[dict[str, Any]]:
    """Load publish history for an entry."""

    path = _history_path(entry)
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read publish history: {exc}") from exc
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _append_history(entry: AlgorithmEntry, status: str, operator: str, reason: str) -> None:
    """Append a publish status change record."""

    history = _load_history(entry)
    history.append({"status": status, "operator": operator, "timestamp": _now_iso(), "reason": reason})
    try:
        _history_path(entry).write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write publish history: {exc}") from exc


def _get_entry(registry: AlgorithmRegistry, algorithm_id: str) -> AlgorithmEntry:
    """Find an algorithm entry or raise 404."""

    normalized = algorithm_id[4:] if algorithm_id.startswith("alg.") else algorithm_id
    entry = registry.get_by_id(normalized) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if entry.type != "component":
        raise HTTPException(status_code=400, detail="Only component entries support publish lifecycle")
    return entry


def _current_status(config: dict[str, Any]) -> str:
    """Return the current publish status from a manifest."""

    return str(config.get("publish_status") or ("published" if config.get("published", True) else "draft"))


def _set_status(
    entry: AlgorithmEntry,
    next_status: str,
    operator: str,
    reason: str,
    registry: AlgorithmRegistry,
    target_version: str = "",
    version_change: str = "",
) -> dict[str, Any]:
    """Persist a publish status transition and rescan the owning directory."""

    if next_status == "approved":
        entry = _apply_review_draft(entry, registry)
    config_path = _entry_config_path(entry)
    config = _load_json(config_path)
    current = _current_status(config)
    if next_status not in ALLOWED_TRANSITIONS.get(current, set()) and current != next_status:
        raise HTTPException(status_code=400, detail=f"Invalid transition: {current} -> {next_status}")
    config["publish_status"] = next_status
    if target_version:
        config["version"] = target_version
        config["pending_version"] = target_version if next_status == "reviewing" else ""
        config["version_change"] = version_change
    if next_status == "published":
        config["published"] = True
        config["external_api_path"] = f"/api/external/v1/{entry.namespace}/{entry.func_name}"
    elif next_status in {"draft", "reviewing", "rejected", "approved", "deprecated"}:
        config["published"] = False
    _save_json(config_path, config)
    history_reason = reason
    if target_version:
        history_reason = f"{reason} version_change={version_change} target_version={target_version}".strip()
    if next_status == "rejected":
        draft = _load_review_draft(entry)
        if draft:
            draft["status"] = "rejected"
            draft["rejected_at"] = _now_iso()
            draft["reject_reason"] = reason
            _save_review_draft(entry, draft)
    if next_status == "published":
        _delete_review_draft(entry)
    _append_history(entry, next_status, operator, history_reason)
    registry.scan_directory(str(config_path.parent.parent))
    refreshed = registry.get_by_id(entry.id) or entry
    return _entry_dict(refreshed)


@router.post("/algorithms/{algorithm_id:path}/submit")
async def submit_algorithm(
    algorithm_id: str,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Submit a draft component for review."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(
        entry,
        "reviewing",
        x_operator or "system",
        body.reason if body else "",
        registry,
        target_version=body.target_version if body else "",
        version_change=body.version_change if body else "",
    )
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/withdraw")
async def withdraw_algorithm(
    algorithm_id: str,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Withdraw a reviewing component back to draft."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(entry, "draft", x_operator or "system", body.reason if body else "", registry)
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/approve")
async def approve_algorithm(
    algorithm_id: str,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Approve a component review."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(entry, "approved", x_operator or "admin", body.reason if body else "", registry)
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/reject")
async def reject_algorithm(
    algorithm_id: str,
    body: ReasonBody,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Reject a component review."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(entry, "rejected", x_operator or "admin", body.reason, registry)
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/publish")
async def publish_algorithm(
    algorithm_id: str,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Publish an approved component to the external API surface."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(entry, "published", x_operator or "system", body.reason if body else "", registry)
    return {"success": True, "algorithm": algorithm, "external_api_path": algorithm["externalApiPath"]}


@router.post("/algorithms/{algorithm_id:path}/deprecate")
async def deprecate_algorithm(
    algorithm_id: str,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Deprecate a published component."""

    entry = _get_entry(registry, algorithm_id)
    algorithm = _set_status(entry, "deprecated", x_operator or "system", body.reason if body else "", registry)
    return {"success": True, "algorithm": algorithm}


@router.get("/algorithms/{algorithm_id:path}/publish-history")
async def publish_history(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return publish status history for a component."""

    entry = _get_entry(registry, algorithm_id)
    history = _load_history(entry)
    return {"success": True, "history": history}
