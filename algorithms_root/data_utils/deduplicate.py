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


@algo_meta(
    zh_name="deduplicate",
    zh_description="列表去重并保持顺序。",
    zh_tags=["排序，基础算法"],
    version="1.0.0",
)
def deduplicate(data: list[Any], key: str | None = None) -> dict[str, Any]:
    """列表去重并保持顺序。

    Args:
        data: 输入列表。
        key: 当元素是 dict 时，可指定字段名作为去重键。

    Returns:
        deduplicated: 去重后的列表。
        removed_count: 被移除的重复元素数量。
        duplicate_keys: 出现过重复的键。
    """
    seen: set[Any] = set()
    duplicate_keys: list[Any] = []
    result: list[Any] = []
    for item in data:
        if key and isinstance(item, dict):
            marker = item.get(key)
        else:
            try:
                marker = item
                hash(marker)
            except TypeError:
                marker = repr(item)
        if marker in seen:
            duplicate_keys.append(marker)
            continue
        seen.add(marker)
        result.append(item)
    return {
        "deduplicated": result,
        "input_length": len(data),
        "output_length": len(result),
        "removed_count": len(data) - len(result),
        "duplicate_keys": duplicate_keys,
    }
