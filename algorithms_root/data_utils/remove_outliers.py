"""
data_utils.transforms - 通用数据处理算法组件

这些函数是算法模板库中“数据工具”分类的真实实现，全部可独立运行，
也可通过编辑器补全以 alg.data_utils.xxx(...) 的方式调用。
"""
from __future__ import annotations
import math
from collections.abc import Iterable
from typing import Any
from algo_service.sdk.decorators import algo_meta
Number = int | float
def _as_float_list(data: Iterable[Number], *, allow_empty: bool = True) -> list[float]:
    """将输入序列转换为 float 列表，并对 None/NaN 做明确校验。"""
    values: list[float] = []
    for index, item in enumerate(data):
        if item is None:
            raise ValueError(f"data[{index}] is None; numeric value expected")
        value = float(item)
        if math.isnan(value):
            raise ValueError(f"data[{index}] is NaN; numeric value expected")
        values.append(value)
    if not values and not allow_empty:
        raise ValueError("data must not be empty")
    return values


def remove_outliers(
    data: list[Number],
    method: str = "iqr",
    threshold: float = 1.5,
) -> dict[str, Any]:
    """过滤异常值。

    Args:
        data: 数值序列。
        method: iqr 或 zscore。
        threshold: IQR 倍数或 Z-Score 阈值。
    """
    values = _as_float_list(data)
    if method not in {"iqr", "zscore"}:
        raise ValueError("method must be 'iqr' or 'zscore'")
    if threshold <= 0:
        raise ValueError("threshold must be greater than 0")

    outliers: list[dict[str, float | int]] = []
    if method == "zscore":
        stats = normalize_zscore(values, ddof=0, round_digits=None)
        scores = stats["values"]
        for index, (value, score) in enumerate(zip(values, scores)):
            if abs(score) > threshold:
                outliers.append({"index": index, "value": value, "score": score})
    else:
        ordered = sorted(values)

        def percentile(q: float) -> float:
            if not ordered:
                return 0.0
            pos = (len(ordered) - 1) * q
            lower = math.floor(pos)
            upper = math.ceil(pos)
            if lower == upper:
                return ordered[int(pos)]
            weight = pos - lower
            return ordered[lower] * (1 - weight) + ordered[upper] * weight

        q1, q3 = percentile(0.25), percentile(0.75)
        iqr = q3 - q1
        low, high = q1 - threshold * iqr, q3 + threshold * iqr
        for index, value in enumerate(values):
            if value < low or value > high:
                outliers.append({"index": index, "value": value, "lower_bound": low, "upper_bound": high})

    outlier_indices = {int(item["index"]) for item in outliers}
    filtered = [value for index, value in enumerate(values) if index not in outlier_indices]
    return {
        "filtered": filtered,
        "outliers": outliers,
        "outlier_count": len(outliers),
        "method": method,
        "threshold": threshold,
    }
