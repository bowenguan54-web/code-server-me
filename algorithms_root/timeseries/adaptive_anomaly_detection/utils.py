"""Utility helpers for adaptive anomaly detection results."""

from __future__ import annotations

from typing import Any


def build_result(index: int, value: float, score_info: dict[str, Any]) -> dict[str, Any]:
    """Create a stable JSON-serialisable anomaly result object."""

    return {
        "index": index,
        "value": value,
        "baseline": round(float(score_info["baseline"]), 6),
        "std": round(float(score_info["std"]), 6),
        "score": round(float(score_info["score"]), 6),
        "threshold": float(score_info["threshold"]),
        "is_anomaly": bool(score_info["is_anomaly"]),
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Summarise a list of point-level anomaly results."""

    anomalies = [item for item in results if item["is_anomaly"]]
    return {
        "total": len(results),
        "anomaly_count": len(anomalies),
        "anomaly_indices": [item["index"] for item in anomalies],
        "max_score": max((float(item["score"]) for item in results), default=0.0),
    }
