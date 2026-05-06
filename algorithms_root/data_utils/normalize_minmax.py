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


def normalize_minmax(
    data: list[Number],
    feature_range: tuple[float, float] = (0.0, 1.0),
    round_digits: int | None = 6,
) -> dict[str, Any]:
    """Min-Max 归一化。

    Args:
        data: 数值序列。
        feature_range: 输出区间，例如 (0, 1) 或 (-1, 1)。
        round_digits: 结果保留小数位，None 表示不四舍五入。
    """
    values = _as_float_list(data)
    if len(feature_range) != 2:
        raise ValueError("feature_range must contain two numbers")
    target_min, target_max = map(float, feature_range)
    if target_min >= target_max:
        raise ValueError("feature_range min must be smaller than max")
    if not values:
        return {"values": [], "min": None, "max": None, "feature_range": [target_min, target_max]}

    source_min, source_max = min(values), max(values)
    if source_min == source_max:
        normalized = [target_min for _ in values]
    else:
        scale = (target_max - target_min) / (source_max - source_min)
        normalized = [target_min + (value - source_min) * scale for value in values]
    if round_digits is not None:
        normalized = [round(value, round_digits) for value in normalized]
    return {
        "values": normalized,
        "min": source_min,
        "max": source_max,
        "feature_range": [target_min, target_max],
    }
