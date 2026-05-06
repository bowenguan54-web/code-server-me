"""Core scoring model for adaptive anomaly detection."""

from __future__ import annotations

from math import sqrt

from .config import DetectionConfig


def mean(values: list[float]) -> float:
    """Return the arithmetic mean for a non-empty list."""

    if not values:
        raise ValueError("values must not be empty")
    return sum(values) / len(values)


def population_std(values: list[float]) -> float:
    """Return population standard deviation for a non-empty list."""

    if not values:
        raise ValueError("values must not be empty")
    avg = mean(values)
    variance = sum((item - avg) ** 2 for item in values) / len(values)
    return sqrt(variance)


def score_point(value: float, history: list[float], config: DetectionConfig) -> dict[str, float | bool]:
    """Score one point against its historical baseline."""

    if not history:
        return {
            "baseline": value,
            "std": config.min_std,
            "score": 0.0,
            "threshold": config.sigma,
            "is_anomaly": False,
        }

    baseline = mean(history)
    std = max(population_std(history), config.min_std)
    score = abs(value - baseline) / std
    return {
        "baseline": baseline,
        "std": std,
        "score": score,
        "threshold": config.sigma,
        "is_anomaly": score > config.sigma,
    }
