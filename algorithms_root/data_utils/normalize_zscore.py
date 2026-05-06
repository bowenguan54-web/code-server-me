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


def normalize_zscore(
    data: list[Number],
    ddof: int = 0,
    round_digits: int | None = 6,
) -> dict[str, Any]:
    """Z-Score 标准化。

    Args:
        data: 数值序列。
        ddof: 标准差自由度修正，0 表示总体标准差，1 表示样本标准差。
        round_digits: 结果保留小数位，None 表示不四舍五入。
    """
    values = _as_float_list(data)
    if not values:
        return {"values": [], "mean": None, "std": None}
    if ddof < 0 or ddof >= len(values):
        raise ValueError("ddof must be >= 0 and smaller than data length")

    mean = sum(values) / len(values)
    variance = sum((value - mean) ** 2 for value in values) / (len(values) - ddof)
    std = math.sqrt(variance)
    if std == 0:
        scores = [0.0 for _ in values]
    else:
        scores = [(value - mean) / std for value in values]
    if round_digits is not None:
        scores = [round(value, round_digits) for value in scores]
    return {
        "values": scores,
        "mean": round(mean, round_digits) if round_digits is not None else mean,
        "std": round(std, round_digits) if round_digits is not None else std,
        "ddof": ddof,
    }
