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
    zh_name="列表分块",
    zh_description="将列表按固定大小切分为若干子列表，适合批处理、分页和小批量推理场景",
    zh_tags=["单文件", "工具", "列表", "批处理"],
    version="1.1.0",
)
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


@algo_meta(
    zh_name="列表去重并保序",
    zh_description="去除列表中的重复元素，同时保持第一次出现的顺序，支持不可哈希对象",
    zh_tags=["单文件", "工具", "去重", "列表"],
    version="1.1.0",
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


@algo_meta(
    zh_name="滑动窗口均值",
    zh_description="计算数值序列的滑动窗口均值，支持 trailing、center、forward 三种窗口对齐方式",
    zh_tags=["单文件", "时序", "平滑", "均值"],
    version="1.1.0",
)
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


@algo_meta(
    zh_name="Min-Max 归一化",
    zh_description="将数值列表线性映射到指定区间，默认映射到 [0, 1]",
    zh_tags=["单文件", "归一化", "预处理"],
    version="1.1.0",
)
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


@algo_meta(
    zh_name="Z-Score 归一化",
    zh_description="将数值列表标准化为均值 0、标准差 1 的分布",
    zh_tags=["单文件", "Z-Score", "标准化", "统计"],
    version="1.1.0",
)
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


@algo_meta(
    zh_name="去除异常值",
    zh_description="使用 IQR 或 Z-Score 方法识别并过滤异常点，返回保留值和异常点详情",
    zh_tags=["单文件", "异常检测", "预处理"],
    version="1.1.0",
)
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


@algo_meta(
    zh_name="字典列表按字段排序",
    zh_description="对字典列表按字段排序，支持多字段、缺失值位置控制和升降序",
    zh_tags=["单文件", "工具", "排序", "字典"],
    version="1.1.0",
)
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
