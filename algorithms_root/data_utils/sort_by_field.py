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


def sort_by_field(
    records: list[dict[str, Any]],
    field: str | list[str],
    reverse: bool = False,
    missing_last: bool = True,
) -> dict[str, Any]:
    """按字段排序字典列表。

    Args:
        records: 字典列表。
        field: 单个字段名或字段名列表。
        reverse: 是否降序。
        missing_last: 缺失字段是否排在最后。
    """
    fields = [field] if isinstance(field, str) else list(field)
    if not fields:
        raise ValueError("field must not be empty")

    def sort_key(record: dict[str, Any]) -> tuple[Any, ...]:
        values: list[Any] = []
        for name in fields:
            missing = name not in record or record.get(name) is None
            marker = 1 if missing and missing_last else 0
            values.append((marker, record.get(name)))
        return tuple(values)

    sorted_records = sorted(records, key=sort_key, reverse=reverse)
    return {
        "records": sorted_records,
        "fields": fields,
        "reverse": reverse,
        "input_length": len(records),
    }
