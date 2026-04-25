"""Preprocessing helpers for adaptive anomaly detection."""

from __future__ import annotations

from collections.abc import Iterable


def to_float_series(values: Iterable[float | int | str]) -> list[float]:
    """Convert an iterable of numeric-like values into a clean float list.

    Empty strings and ``None`` values are skipped so callers can pass lightly
    cleaned CSV columns without preparing a separate filter step.
    """

    series: list[float] = []
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        series.append(float(value))
    return series


def rolling_windows(values: list[float], window_size: int) -> list[list[float]]:
    """Return historical windows aligned with every point in ``values``."""

    if window_size < 2:
        raise ValueError("window_size must be at least 2")
    windows: list[list[float]] = []
    for index in range(len(values)):
        start = max(0, index - window_size)
        windows.append(values[start:index])
    return windows
