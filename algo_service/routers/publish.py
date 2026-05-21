"""Publishing lifecycle routes for algorithm components."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException, Request
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
from ..sdk.auth_utils import get_current_user
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
    note: str = ""
    version_change: str = ""
    target_version: str = ""
    version_bump: str = ""
    version_bump_type: str = ""
    metadata: dict[str, Any] | None = None


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


def _append_history(
    entry: AlgorithmEntry,
    status: str,
    operator: str,
    reason: str,
    *,
    operator_name: str = "",
    from_version: str = "",
    to_version: str = "",
    action_type: str = "",
) -> None:
    """Append a publish status change record."""

    history = _load_history(entry)
    history.append(
        {
            "status": status,
            "operator": operator,
            "operator_name": operator_name or operator,
            "timestamp": _now_iso(),
            "reason": reason,
            "from_version": from_version,
            "to_version": to_version or from_version,
            "action_type": action_type or ("iteration" if from_version and to_version and from_version != to_version else status),
        }
    )
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


def _find_history_entry(registry: AlgorithmRegistry, algorithm_id: str) -> AlgorithmEntry:
    """Find an algorithm entry for read-only history lookup."""

    normalized = algorithm_id[4:] if algorithm_id.startswith("alg.") else algorithm_id
    entry = registry.get_by_id(normalized) or registry.get_by_id(algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    return entry


def _operator_from_request(request: Request, fallback: str) -> tuple[str, str]:
    """Return operator id and display name from auth, falling back to X-Operator."""

    try:
        user = get_current_user(request)
    except HTTPException:
        return fallback, fallback
    operator = str(user.get("id") or user.get("username") or fallback)
    operator_name = str(user.get("display_name") or user.get("displayName") or user.get("username") or operator)
    return operator, operator_name


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
    metadata: dict[str, Any] | None = None,
    force: bool = False,
) -> dict[str, Any]:
    """Persist a publish status transition and rescan the owning directory."""

    initial_config_path = _entry_config_path(entry)
    initial_config = _load_json(initial_config_path)
    current = _current_status(initial_config)
    from_version = str(initial_config.get("version") or entry.version or "1.0.0")
    if not force and next_status not in ALLOWED_TRANSITIONS.get(current, set()) and current != next_status:
        raise HTTPException(status_code=400, detail=f"Invalid transition: {current} -> {next_status}")

    if next_status == "approved":
        entry = _apply_review_draft(entry, registry)
    config_path = _entry_config_path(entry)
    config = _load_json(config_path)
    config["publish_status"] = next_status
    if target_version:
        config["version"] = target_version
        config["pending_version"] = target_version if next_status == "reviewing" else ""
        config["version_change"] = version_change
    if metadata:
        for key in ("zh_name", "zh_description", "zh_tags", "input_example", "widget_overrides"):
            if key in metadata:
                config[key] = metadata[key]
    if next_status == "published":
        config["published"] = True
        config["external_api_path"] = f"/api/external/v1/{entry.namespace}/{entry.func_name}"
    elif next_status in {"draft", "reviewing", "rejected", "approved", "deprecated"}:
        config["published"] = False
    _save_json(config_path, config)
    history_reason = reason
    if target_version:
        history_reason = f"{reason} version_change={version_change} target_version={target_version}".strip()
    operator_name = operator
    if metadata:
        operator_name = str(
            metadata.get("operator_name")
            or metadata.get("operatorName")
            or metadata.get("operator_display_name")
            or operator
        )
    to_version = str(config.get("version") or target_version or from_version)
    action_type_map = {
        "reviewing": "submit",
        "approved": "approve",
        "rejected": "reject",
        "published": "publish",
        "draft": "withdraw",
        "deprecated": "deprecate",
    }
    action_type = action_type_map.get(next_status, next_status)
    if next_status == "approved":
        for record in reversed(_load_history(entry)):
            if record.get("action_type") in {"submit", "reviewing"}:
                from_version = str(record.get("from_version") or from_version)
                to_version = str(record.get("to_version") or to_version)
                break
    if next_status == "rejected":
        draft = _load_review_draft(entry)
        if draft:
            draft["status"] = "rejected"
            draft["rejected_at"] = _now_iso()
            draft["reject_reason"] = reason
            _save_review_draft(entry, draft)
    if next_status == "published":
        _delete_review_draft(entry)
    _append_history(
        entry,
        next_status,
        operator,
        history_reason,
        operator_name=operator_name,
        from_version=from_version,
        to_version=to_version,
        action_type=action_type,
    )
    registry.scan_directory(str(config_path.parent.parent))
    refreshed = registry.get_by_id(entry.id) or entry
    return _entry_dict(refreshed)


@router.post("/algorithms/{algorithm_id:path}/submit")
async def submit_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Submit a draft component for review."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "system")
    algorithm = _set_status(
        entry,
        "reviewing",
        operator,
        body.reason if body else "",
        registry,
        target_version=body.target_version if body else "",
        version_change=body.version_change if body else "",
        metadata={"operator_name": operator_name},
    )
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/withdraw")
async def withdraw_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Withdraw a reviewing component back to draft."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "system")
    algorithm = _set_status(entry, "draft", operator, body.reason if body else "", registry, metadata={"operator_name": operator_name})
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/approve")
async def approve_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Approve a component review."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "admin")
    algorithm = _set_status(entry, "approved", operator, body.reason if body else "", registry, metadata={"operator_name": operator_name})
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/reject")
async def reject_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Reject a component review."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "admin")
    algorithm = _set_status(entry, "rejected", operator, body.reason, registry, metadata={"operator_name": operator_name})
    return {"success": True, "algorithm": algorithm}


@router.post("/algorithms/{algorithm_id:path}/publish")
async def publish_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Publish an approved component to the external API surface."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "system")
    reason = ""
    target_version = ""
    version_change = ""
    metadata: dict[str, Any] | None = None
    if body:
        reason = body.reason or body.note
        target_version = body.target_version or body.version_bump
        version_change = body.version_change or body.version_bump_type
        metadata = body.metadata
    metadata = dict(metadata or {})
    metadata.setdefault("operator_name", operator_name)
    algorithm = _set_status(
        entry,
        "published",
        operator,
        reason,
        registry,
        target_version=target_version,
        version_change=version_change,
        metadata=metadata,
        force=True,
    )
    return {"success": True, "algorithm": algorithm, "external_api_path": algorithm["externalApiPath"]}


@router.post("/algorithms/{algorithm_id:path}/deprecate")
async def deprecate_algorithm(
    algorithm_id: str,
    request: Request,
    body: ReasonBody | None = None,
    x_operator: str | None = Header(None, alias="X-Operator"),
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Deprecate a published component."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "system")
    algorithm = _set_status(entry, "deprecated", operator, body.reason if body else "", registry, metadata={"operator_name": operator_name})
    return {"success": True, "algorithm": algorithm}


@router.get("/algorithms/{algorithm_id:path}/publish-history")
async def publish_history(
    algorithm_id: str,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return publish status history for a component."""

    entry = _find_history_entry(registry, algorithm_id)
    history = _load_history(entry)
    return {"success": True, "history": history}
