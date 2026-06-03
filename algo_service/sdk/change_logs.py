"""Lightweight algorithm create/edit change logs.

These logs are intentionally separate from publish_history.json. The publish
history remains the audit trail for review/publish lifecycle events, while the
logs here are only for the Basic Info dialog's "修改记录" table.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PRIVATE_LOGS = "privateChangeLogs"
PUBLIC_LOGS = "publicChangeLogs"
PENDING_PUBLIC_LOGS = "pendingPublicChangeLogs"
LOG_FIELDS = (PRIVATE_LOGS, PUBLIC_LOGS, PENDING_PUBLIC_LOGS)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_change_log(
    action: str,
    current_user: dict[str, Any] | None,
    version_before: str = "",
    version_after: str = "",
    remark: str = "",
) -> dict[str, Any]:
    """Create a normalized create/edit log item from the authenticated user."""

    action = "create_algorithm" if action == "create_algorithm" else "edit_algorithm"
    user = current_user or {}
    operator_id = str(user.get("id") or user.get("username") or "system")
    operator_name = str(
        user.get("display_name")
        or user.get("displayName")
        or user.get("username")
        or operator_id
    )
    return {
        "id": f"log_{uuid.uuid4().hex[:12]}",
        "operatorId": operator_id,
        "operatorName": operator_name,
        "operatorRole": str(user.get("role") or ""),
        "action": action,
        "actionText": "新建算法" if action == "create_algorithm" else "编辑算法",
        "time": _now_iso(),
        "versionBefore": str(version_before or ""),
        "versionAfter": str(version_after or ""),
        "remark": str(remark or ""),
    }


def load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def save_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def ensure_change_log_fields(manifest: dict[str, Any]) -> dict[str, Any]:
    """Ensure all three change-log fields exist and are lists."""

    for field in LOG_FIELDS:
        if not isinstance(manifest.get(field), list):
            manifest[field] = []
    return manifest


def manifest_change_logs(manifest: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    manifest = ensure_change_log_fields(manifest)
    return {
        PRIVATE_LOGS: [item for item in manifest.get(PRIVATE_LOGS, []) if isinstance(item, dict)],
        PUBLIC_LOGS: [item for item in manifest.get(PUBLIC_LOGS, []) if isinstance(item, dict)],
        PENDING_PUBLIC_LOGS: [item for item in manifest.get(PENDING_PUBLIC_LOGS, []) if isinstance(item, dict)],
    }


def _append_log(path: Path, field: str, log: dict[str, Any]) -> None:
    manifest = ensure_change_log_fields(load_manifest(path))
    manifest[field].append(log)
    save_manifest(path, manifest)


def append_private_change_log(path: Path, log: dict[str, Any]) -> None:
    _append_log(path, PRIVATE_LOGS, log)


def append_pending_public_change_log(path: Path, log: dict[str, Any]) -> None:
    _append_log(path, PENDING_PUBLIC_LOGS, log)


def append_public_change_log(path: Path, log: dict[str, Any]) -> None:
    _append_log(path, PUBLIC_LOGS, log)


def merge_pending_public_change_logs_to_public(
    path: Path,
    fallback_log: dict[str, Any] | None = None,
    pending_logs: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Move pending public logs into public logs and clear pending logs."""

    manifest = ensure_change_log_fields(load_manifest(path))
    pending = [item for item in (pending_logs if pending_logs is not None else manifest.get(PENDING_PUBLIC_LOGS, [])) if isinstance(item, dict)]
    if not pending and fallback_log:
        pending = [fallback_log]
    manifest[PUBLIC_LOGS].extend(pending)
    manifest[PENDING_PUBLIC_LOGS] = []
    save_manifest(path, manifest)
    return pending


def clear_pending_public_change_logs(path: Path) -> None:
    manifest = ensure_change_log_fields(load_manifest(path))
    manifest[PENDING_PUBLIC_LOGS] = []
    save_manifest(path, manifest)
