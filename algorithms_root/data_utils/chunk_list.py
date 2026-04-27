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


def chunk_list(data: list[Any], size: int, drop_last: bool = False) -> dict[str, Any]:
    """把列表切分为固定大小的连续块。

    Args:
        data: 待切分的列表。
        size: 每个分块的最大长度，必须大于 0。
        drop_last: 是否丢弃最后一个不足 size 的分块。

    Returns:
        包含分块结果、分块数量、原始长度等信息的字典。

    Example:
        >>> chunk_list([1, 2, 3, 4, 5], size=2)
        {'chunks': [[1, 2], [3, 4], [5]], 'chunk_count': 3, ...}
    """
    if size <= 0:
        raise ValueError("size must be greater than 0")
    chunks = [data[i : i + size] for i in range(0, len(data), size)]
    if drop_last and chunks and len(chunks[-1]) < size:
        chunks = chunks[:-1]
    return {
        "chunks": chunks,
        "chunk_count": len(chunks),
        "input_length": len(data),
        "chunk_size": size,
        "drop_last": drop_last,
    }
