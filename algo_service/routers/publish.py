"""Publishing lifecycle routes for algorithm components."""

from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel

from .algorithms import (
    _ALGORITHMS_ROOT,
    _apply_review_files_to_entry,
    _apply_review_draft,
    _bump_semver,
    _delete_review_draft,
    _entry_by_owner,
    _entry_config_path,
    _entry_dict,
    _entry_from_client_id,
    _entry_target_public,
    _folder_files_for_entry,
    _load_review_draft,
    _public_conflict_for_entry,
    _read_entry_publish_status,
    _rescan_all,
    _save_review_draft,
    _version_bump_options,
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
    is_version_iteration: bool = False
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
    entry = (
        _entry_from_client_id(registry, algorithm_id)
        or _entry_from_client_id(registry, normalized)
        or registry.get_by_id(normalized)
        or registry.get_by_id(algorithm_id)
    )
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    if entry.type != "component":
        raise HTTPException(status_code=400, detail="Only component entries support publish lifecycle")
    return entry


def _find_history_entry(registry: AlgorithmRegistry, algorithm_id: str) -> AlgorithmEntry:
    """Find an algorithm entry for read-only history lookup."""

    normalized = algorithm_id[4:] if algorithm_id.startswith("alg.") else algorithm_id
    entry = (
        _entry_from_client_id(registry, algorithm_id)
        or _entry_from_client_id(registry, normalized)
        or registry.get_by_id(normalized)
        or registry.get_by_id(algorithm_id)
    )
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


def _public_entry_for_target(
    registry: AlgorithmRegistry,
    entry: AlgorithmEntry,
    target_public_id: str,
    wants_iteration: bool,
) -> AlgorithmEntry | None:
    """Resolve the public algorithm that a private review draft intends to update."""

    if target_public_id:
        target_entry = _entry_from_client_id(registry, target_public_id) or registry.get_by_id(target_public_id)
        if target_entry is None:
            raise HTTPException(status_code=404, detail="没有找到关联的公有算法，请重新另存草稿后提交")
        if str(getattr(target_entry, "owner_id", "system") or "system") != "system":
            raise HTTPException(status_code=400, detail="关联目标不是公有算法，无法作为版本迭代目标")
        return target_entry
    if not wants_iteration:
        return None
    same_id_public = registry.get_by_id(entry.id)
    if same_id_public is not None and str(getattr(same_id_public, "owner_id", "system") or "system") == "system":
        return same_id_public
    return None


def _review_metadata(entry: AlgorithmEntry, body: ReasonBody | None, target_version: str, operator_name: str) -> dict[str, Any]:
    """Build metadata saved with a submit-time code snapshot."""

    metadata = dict(body.metadata or {}) if body and isinstance(body.metadata, dict) else {}
    metadata.setdefault("zh_name", entry.zh_name)
    metadata.setdefault("zh_description", entry.zh_description)
    metadata.setdefault("zh_tags", entry.zh_tags)
    metadata.setdefault("version", target_version or entry.version)
    metadata.setdefault("input_example", entry.input_example)
    metadata.setdefault("widget_overrides", getattr(entry, "widget_overrides", {}) or {})
    metadata.setdefault("operator_name", operator_name)
    return metadata


def _save_submit_review_draft(
    entry: AlgorithmEntry,
    registry: AlgorithmRegistry,
    operator: str,
    operator_name: str,
    body: ReasonBody | None,
) -> tuple[str, str, str]:
    """Snapshot current source files and metadata before switching to reviewing."""

    body = body or ReasonBody()
    target_public = _entry_target_public(entry)
    explicit_target_id = str(target_public.get("target_public_id") or "")
    explicit_target_call_prefix = str(target_public.get("target_public_call_prefix") or "")
    wants_iteration = bool(body.is_version_iteration or explicit_target_id)
    public_entry = _public_entry_for_target(registry, entry, explicit_target_id, wants_iteration)
    review_kind = "version_iteration" if public_entry is not None and wants_iteration else "new_publish"
    target_version = body.target_version or body.version_bump or entry.version
    version_change = body.version_change or body.version_bump_type
    if review_kind == "version_iteration" and public_entry is not None:
        target_version = target_version or public_entry.version
    snapshot_files = [
        {
            "filename": str(item.get("filename") or item.get("relative_path") or ""),
            "relative_path": str(item.get("relative_path") or item.get("filename") or ""),
            "content": str(item.get("content") or ""),
        }
        for item in _folder_files_for_entry(entry)
        if isinstance(item, dict)
    ]
    metadata = _review_metadata(entry, body, target_version, operator_name)
    draft = {
        "status": "reviewing",
        "algorithm_id": entry.id,
        "call_prefix": entry.call_prefix,
        "base_status": _read_entry_publish_status(entry),
        "submitted_at": _now_iso(),
        "updated_at": _now_iso(),
        "operator": operator,
        "operator_name": operator_name,
        "review_kind": review_kind,
        "target_public_id": public_entry.id if public_entry is not None else explicit_target_id,
        "target_public_call_prefix": public_entry.call_prefix if public_entry is not None else explicit_target_call_prefix,
        "base_public_version": public_entry.version if public_entry is not None else "",
        "version_bump_type": body.version_bump_type,
        "version_bump": target_version,
        "files": snapshot_files,
        "metadata": metadata,
    }
    _save_review_draft(entry, draft)
    return target_version, version_change, review_kind


def _submit_check_payload(registry: AlgorithmRegistry, entry: AlgorithmEntry) -> dict[str, Any]:
    """Build submit-review conflict and version iteration hints for the frontend."""

    target_public = _entry_target_public(entry)
    explicit_target_id = str(target_public.get("target_public_id") or "")
    public_entry: AlgorithmEntry | None = None
    is_version_iteration = False

    if explicit_target_id:
        public_entry = _entry_by_owner(registry, explicit_target_id, "system") or _entry_from_client_id(registry, explicit_target_id)
        if public_entry is not None and str(getattr(public_entry, "owner_id", "system") or "system") == "system":
            is_version_iteration = True
        else:
            public_entry = None

    if public_entry is None:
        public_entry = _public_conflict_for_entry(registry, entry)

    if public_entry is None:
        base_version = str(entry.version or "1.0.0")
        return {
            "success": True,
            "hasConflict": False,
            "isVersionIteration": False,
            "publicAlgorithm": None,
            "baseVersion": base_version,
            "versionOptions": _version_bump_options(base_version),
        }

    base_version = str(public_entry.version or "1.0.0")
    return {
        "success": True,
        "hasConflict": True,
        "isVersionIteration": is_version_iteration,
        "publicAlgorithm": _entry_dict(public_entry),
        "baseVersion": base_version,
        "versionOptions": _version_bump_options(base_version),
    }


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


def _published_metadata(entry: AlgorithmEntry, draft: dict[str, Any], version: str) -> dict[str, Any]:
    """Build metadata used when a review is approved and published."""

    metadata = dict(draft.get("metadata") or {}) if isinstance(draft.get("metadata"), dict) else {}
    metadata.setdefault("zh_name", entry.zh_name)
    metadata.setdefault("zh_description", entry.zh_description)
    metadata.setdefault("zh_tags", entry.zh_tags)
    metadata.setdefault("input_example", entry.input_example)
    metadata["version"] = version or str(metadata.get("version") or entry.version or "1.0.0")
    return metadata


def _write_published_manifest(entry: AlgorithmEntry, metadata: dict[str, Any], version: str) -> Path:
    """Mark an entry manifest as published and update public metadata."""

    config_path = _entry_config_path(entry)
    config = _load_json(config_path) if config_path.exists() else {}
    config["namespace"] = entry.namespace
    config["type"] = str(config.get("type") or config.get("module_kind") or entry.type)
    config["module_kind"] = str(config.get("module_kind") or entry.type)
    config["publish_status"] = "published"
    config["published"] = True
    config["version"] = version or str(metadata.get("version") or entry.version or "1.0.0")
    config["pending_version"] = ""
    config["version_change"] = ""
    config["external_api_path"] = f"/api/external/v1/{entry.namespace}/{entry.func_name}"
    for key in ("zh_name", "zh_description", "zh_tags", "input_example", "widget_overrides"):
        if key in metadata:
            config[key] = metadata[key]
    config.pop("owner_id", None)
    config.pop("target_public_id", None)
    config.pop("target_public_call_prefix", None)
    config_path.parent.mkdir(parents=True, exist_ok=True)
    _save_json(config_path, config)
    return config_path


def _delete_private_entry_folder(entry: AlgorithmEntry, registry: AlgorithmRegistry) -> None:
    """Remove a merged private draft directory when it lives under algorithms_root/users."""

    owner_id = str(getattr(entry, "owner_id", "system") or "system")
    if owner_id == "system":
        return
    folder = Path(entry.package_root) if getattr(entry, "package_root", None) else Path(entry.source_file).parent
    folder = folder.resolve()
    users_root = (_ALGORITHMS_ROOT / "users").resolve()
    try:
        is_private_folder = folder.is_relative_to(users_root)
    except AttributeError:
        is_private_folder = str(folder).startswith(str(users_root))
    if not is_private_folder or not folder.exists():
        return
    for old_file in folder.glob("*.py"):
        registry.unregister_by_file(str(old_file))
    shutil.rmtree(folder, ignore_errors=True)


def _approve_version_iteration(
    entry: AlgorithmEntry,
    draft: dict[str, Any],
    body: ReasonBody | None,
    operator: str,
    operator_name: str,
    registry: AlgorithmRegistry,
) -> dict[str, Any]:
    """Apply a private review draft to its target public algorithm."""

    target_public_id = str(draft.get("target_public_id") or entry.id)
    target_entry = _entry_by_owner(registry, target_public_id, "system") or registry.get_by_id(target_public_id)
    if target_entry is None or str(getattr(target_entry, "owner_id", "system") or "system") != "system":
        raise HTTPException(status_code=404, detail="目标公有算法不存在")

    from_version = str(target_entry.version or draft.get("base_public_version") or "1.0.0")
    bump_type = str((body.version_bump_type if body else "") or draft.get("version_bump_type") or "patch")
    new_version = str((body.version_bump if body else "") or draft.get("version_bump") or _bump_semver(from_version, bump_type))
    metadata = _published_metadata(target_entry, draft, new_version)

    target_entry = _apply_review_files_to_entry(target_entry, draft.get("files", []), metadata, registry)
    config_path = _write_published_manifest(target_entry, metadata, new_version)
    _append_history(
        target_entry,
        "published",
        operator,
        (body.reason if body else "") or "审核通过并发布版本迭代",
        operator_name=operator_name,
        from_version=from_version,
        to_version=new_version,
        action_type="iteration",
    )
    _delete_review_draft(entry)
    _delete_private_entry_folder(entry, registry)
    _rescan_all(registry)
    refreshed = _entry_by_owner(registry, target_entry.id, "system") or registry.get_by_id(target_entry.id) or target_entry
    # Ensure any stale manifest location is not lost if the rescan raced a write.
    if not _entry_config_path(refreshed).exists() and config_path.exists():
        registry.scan_directory(str(config_path.parent.parent))
        refreshed = _entry_by_owner(registry, target_entry.id, "system") or registry.get_by_id(target_entry.id) or refreshed
    return _entry_dict(refreshed)


def _approve_new_publish(
    entry: AlgorithmEntry,
    draft: dict[str, Any],
    body: ReasonBody | None,
    operator: str,
    operator_name: str,
    registry: AlgorithmRegistry,
) -> dict[str, Any]:
    """Publish a private draft as a new public algorithm."""

    bump_type = str((body.version_bump_type if body else "") or draft.get("version_bump_type") or "patch")
    version = str((body.version_bump if body else "") or draft.get("version_bump") or entry.version or "1.0.0")
    if not version:
        version = _bump_semver(entry.version or "1.0.0", bump_type)
    metadata = _published_metadata(entry, draft, version)
    if draft.get("files"):
        entry = _apply_review_files_to_entry(entry, draft.get("files", []), metadata, registry)

    owner_id = str(getattr(entry, "owner_id", "system") or "system")
    config_path = _entry_config_path(entry)
    current_folder = config_path.parent
    if owner_id != "system":
        conflict = _entry_by_owner(registry, entry.id, "system") or registry.get_by_id(entry.id)
        if (
            conflict is not None
            and str(getattr(conflict, "owner_id", "system") or "system") == "system"
            and _read_entry_publish_status(conflict) == "published"
        ):
            raise HTTPException(status_code=409, detail=f"已存在同名公有算法 {conflict.call_prefix}，请修改命名空间后重新提交")
        public_folder = _ALGORITHMS_ROOT.joinpath(*entry.namespace.split("."), entry.func_name)
        if public_folder.exists() and public_folder.resolve() != current_folder.resolve():
            raise HTTPException(status_code=409, detail=f"已存在同名公有算法 alg.{entry.namespace}.{entry.func_name}，请修改命名空间后重新提交")
        if public_folder.resolve() != current_folder.resolve():
            public_folder.parent.mkdir(parents=True, exist_ok=True)
            for old_file in current_folder.glob("*.py"):
                registry.unregister_by_file(str(old_file))
            shutil.move(str(current_folder), str(public_folder))
            config_path = public_folder / config_path.name
            if not config_path.exists():
                config_path = public_folder / ("algopack.json" if entry.package_root else "folder_config.json")
            entry_root = public_folder
        else:
            entry_root = current_folder
    else:
        entry_root = current_folder

    # Review draft files are no longer needed after the source folder becomes public.
    for draft_file in entry_root.glob(".review_draft_*.json"):
        draft_file.unlink(missing_ok=True)
    config = _load_json(config_path) if config_path.exists() else {}
    config["namespace"] = entry.namespace
    config["type"] = str(config.get("type") or config.get("module_kind") or entry.type)
    config["module_kind"] = str(config.get("module_kind") or entry.type)
    config["publish_status"] = "published"
    config["published"] = True
    config["version"] = version
    config["external_api_path"] = f"/api/external/v1/{entry.namespace}/{entry.func_name}"
    config.pop("owner_id", None)
    config.pop("target_public_id", None)
    config.pop("target_public_call_prefix", None)
    for key in ("zh_name", "zh_description", "zh_tags", "input_example", "widget_overrides"):
        if key in metadata:
            config[key] = metadata[key]
    _save_json(config_path, config)
    _rescan_all(registry)
    refreshed = _entry_by_owner(registry, entry.id, "system") or registry.get_by_id(entry.id) or entry
    _append_history(
        refreshed,
        "published",
        operator,
        (body.reason if body else "") or "审核通过并正式发布",
        operator_name=operator_name,
        from_version=str(entry.version or ""),
        to_version=version,
        action_type="new_publish",
    )
    return _entry_dict(refreshed)


@router.get("/algorithms/{algorithm_id:path}/submit-check")
async def check_algorithm_submit(
    algorithm_id: str,
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict[str, Any]:
    """Return review submission hints before opening the submit modal."""

    entry = _entry_from_client_id(registry, algorithm_id)
    if entry is None:
        raise HTTPException(status_code=404, detail=f"Algorithm not found: {algorithm_id}")
    try:
        user = get_current_user(request)
    except HTTPException:
        user = {"role": "", "id": ""}
    owner_id = str(getattr(entry, "owner_id", "system") or "system")
    if user.get("role") != "admin" and owner_id != str(user.get("id") or ""):
        raise HTTPException(status_code=403, detail="无权提交他人的算法审核")
    return _submit_check_payload(registry, entry)


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
    target_version, version_change, _review_kind = _save_submit_review_draft(entry, registry, operator, operator_name, body)
    algorithm = _set_status(
        entry,
        "reviewing",
        operator,
        body.reason if body else "",
        registry,
        target_version=target_version,
        version_change=version_change,
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
    """Approve a component review and publish the reviewed code immediately."""

    entry = _get_entry(registry, algorithm_id)
    operator, operator_name = _operator_from_request(request, x_operator or "admin")
    try:
        user = get_current_user(request)
    except HTTPException:
        user = {"role": "admin"}
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可审批算法")

    draft = _load_review_draft(entry)
    if not draft:
        algorithm = _set_status(
            entry,
            "approved",
            operator,
            body.reason if body else "",
            registry,
            metadata={"operator_name": operator_name},
        )
        return {"success": True, "algorithm": algorithm}

    if draft.get("review_kind") == "version_iteration" and str(draft.get("target_public_id") or ""):
        algorithm = _approve_version_iteration(entry, draft, body, operator, operator_name, registry)
    else:
        algorithm = _approve_new_publish(entry, draft, body, operator, operator_name, registry)
    return {"success": True, "algorithm": algorithm, "autoPublished": True}


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
