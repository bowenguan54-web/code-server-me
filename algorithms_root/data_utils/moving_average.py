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


def moving_average(
    data: list[Number],
    window: int = 3,
    mode: str = "trailing",
    round_digits: int | None = 6,
) -> dict[str, Any]:
    """计算滑动窗口均值。

    Args:
        data: 数值序列。
        window: 窗口大小，必须大于 0。
        mode: trailing 使用当前位置及其之前窗口；center 使用居中窗口；forward 使用当前位置及其之后窗口。
        round_digits: 结果保留小数位，None 表示不四舍五入。
    """
    values = _as_float_list(data)
    if window <= 0:
        raise ValueError("window must be greater than 0")
    if mode not in {"trailing", "center", "forward"}:
        raise ValueError("mode must be one of: trailing, center, forward")

    smoothed: list[float] = []
    for index in range(len(values)):
        if mode == "trailing":
            start, end = max(0, index - window + 1), index + 1
        elif mode == "forward":
            start, end = index, min(len(values), index + window)
        else:
            left = window // 2
            right = window - left
            start, end = max(0, index - left), min(len(values), index + right)
        mean = sum(values[start:end]) / (end - start)
        smoothed.append(round(mean, round_digits) if round_digits is not None else mean)

    return {
        "values": smoothed,
        "window": window,
        "mode": mode,
        "input_length": len(values),
    }
