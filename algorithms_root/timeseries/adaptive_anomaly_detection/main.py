"""Entry points exported by the adaptive anomaly detection package."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from .config import DetectionConfig
from .model import score_point
from .preprocess import rolling_windows, to_float_series
from .utils import build_result, summarize


def detect_adaptive_anomalies(
    values: Iterable[float | int | str],
    window_size: int = 12,
    sigma: float = 3.0,
) -> dict[str, Any]:
    """Detect anomaly points in a time series using an adaptive rolling baseline.

    zh_name: 自适应异常检测
    zh_desc: 基于滚动窗口均值和标准差，为每个时序点生成异常评分与异常标记。
    tags: 时序分析, 异常检测, 监控
    version: 1.0.0

    Args:
        values: Numeric time-series values.
        window_size: Historical window size for baseline estimation.
        sigma: Standard deviation multiplier used as anomaly threshold.
    """

    series = to_float_series(values)
    config = DetectionConfig(window_size=window_size, sigma=sigma)
    windows = rolling_windows(series, config.window_size)
    results = [
        build_result(index, value, score_point(value, windows[index], config))
        for index, value in enumerate(series)
    ]
    return {
        "summary": summarize(results),
        "points": results,
    }


def score_latest_point(
    history: Iterable[float | int | str],
    current_value: float,
    sigma: float = 3.0,
) -> dict[str, Any]:
    """Score a new point against historical observations.

    zh_name: 最新点异常评分
    zh_desc: 使用历史序列作为基线，为最新观测值计算异常分数。
    tags: 时序分析, 在线检测, 异常评分
    version: 1.0.0

    Args:
        history: Historical numeric values.
        current_value: Latest observed value to score.
        sigma: Standard deviation multiplier used as anomaly threshold.
    """

    historical = to_float_series(history)
    config = DetectionConfig(window_size=max(len(historical), 2), sigma=sigma)
    score_info = score_point(float(current_value), historical, config)
    return build_result(len(historical), float(current_value), score_info)
