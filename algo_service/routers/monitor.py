"""External API call logging and monitoring routes."""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/v1", tags=["monitor"])

LOG_PATH = Path(__file__).resolve().parents[2] / "call_logs.json"
PERIODS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def _now() -> datetime:
    """Return the current UTC datetime."""

    return datetime.now(timezone.utc)


def _parse_time(value: str | None) -> datetime | None:
    """Parse an ISO timestamp into a timezone-aware datetime."""

    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid timestamp: {value}") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _load_logs() -> list[dict[str, Any]]:
    """Load all call logs from JSON storage."""

    if not LOG_PATH.exists():
        return []
    try:
        data = json.loads(LOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=500, detail=f"Cannot read call logs: {exc}") from exc
    if not isinstance(data, list):
        raise HTTPException(status_code=500, detail="call_logs.json must contain a list")
    return [item for item in data if isinstance(item, dict)]


def _save_logs(items: list[dict[str, Any]]) -> None:
    """Persist call logs to JSON storage."""

    try:
        LOG_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write call logs: {exc}") from exc


def record_call_log(entry: dict[str, Any]) -> None:
    """Append one external API call log entry."""

    logs = _load_logs()
    logs.append(entry)
    _save_logs(logs[-5000:])


def _logs_in_period(logs: list[dict[str, Any]], period: str) -> list[dict[str, Any]]:
    """Filter logs to a named relative period."""

    delta = PERIODS.get(period)
    if delta is None:
        raise HTTPException(status_code=400, detail="period must be one of 24h, 7d, 30d")
    threshold = _now() - delta
    return [item for item in logs if (_parse_time(str(item.get("request_time") or "")) or threshold) >= threshold]


@router.get("/monitor/overview")
async def monitor_overview(period: str = Query("24h")) -> dict[str, Any]:
    """Return aggregate call metrics for a period."""

    logs = _logs_in_period(_load_logs(), period)
    total = len(logs)
    successes = len([item for item in logs if item.get("success") is True])
    avg_elapsed = round(sum(float(item.get("elapsed_ms") or 0) for item in logs) / total, 3) if total else 0
    active_keys = len({item.get("api_key_id") for item in logs if item.get("api_key_id")})
    return {
        "success": True,
        "period": period,
        "overview": {
            "total_calls": total,
            "success_rate": round(successes / total, 4) if total else 0,
            "avg_elapsed_ms": avg_elapsed,
            "active_key_count": active_keys,
        },
    }


@router.get("/monitor/logs")
async def monitor_logs(
    namespace: str | None = Query(None),
    api_key_id: str | None = Query(None),
    success: bool | None = Query(None),
    start_time: str | None = Query(None),
    end_time: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
) -> dict[str, Any]:
    """Return paginated call logs with optional filters."""

    logs = _load_logs()
    start = _parse_time(start_time)
    end = _parse_time(end_time)
    if namespace:
        logs = [item for item in logs if item.get("namespace") == namespace]
    if api_key_id:
        logs = [item for item in logs if item.get("api_key_id") == api_key_id]
    if success is not None:
        logs = [item for item in logs if item.get("success") is success]
    if start is not None:
        logs = [item for item in logs if (_parse_time(str(item.get("request_time") or "")) or start) >= start]
    if end is not None:
        logs = [item for item in logs if (_parse_time(str(item.get("request_time") or "")) or end) <= end]
    logs.sort(key=lambda item: str(item.get("request_time") or ""), reverse=True)
    total = len(logs)
    offset = (page - 1) * page_size
    return {
        "success": True,
        "page": page,
        "page_size": page_size,
        "total": total,
        "logs": logs[offset : offset + page_size],
    }


@router.get("/monitor/ranking")
async def monitor_ranking() -> dict[str, Any]:
    """Return the top namespaces by call volume."""

    counts = Counter(str(item.get("namespace") or "") for item in _load_logs())
    ranking = [
        {"namespace": namespace, "calls": count}
        for namespace, count in counts.most_common(10)
        if namespace
    ]
    return {"success": True, "ranking": ranking}
