"""
algolib.preprocess — 数据预处理模块

提供: sample_random, sample_weighted, sample_stratified,
      split, join, normalize, standardize, impute, cast
"""

import math
import random
import time
from collections import defaultdict
from typing import Any, Optional


def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def sample_random(
    data: list,
    n: int,
    replace: bool = False,
    seed: Optional[int] = None,
) -> dict:
    """随机抽样

    Args:
        data: 原始数据列表
        n: 抽取数量
        replace: 是否有放回抽样，默认 False
        seed: 随机种子，保证可复现

    Returns:
        {"result": 样本列表, "meta": {"algorithm", "n", "replace"}, "elapsed_ms": float}
    """
    t0 = time.perf_counter()
    rng = random.Random(seed)
    if replace:
        result = [rng.choice(data) for _ in range(n)]
    else:
        n = min(n, len(data))
        result = rng.sample(data, n)
    return _result(result, "sample_random", time.perf_counter() - t0, n=n, replace=replace)


def sample_weighted(
    data: list,
    weights: list,
    n: int,
    replace: bool = True,
    seed: Optional[int] = None,
) -> dict:
    """带权重抽样

    Args:
        data: 原始数据列表
        weights: 每个元素的抽取权重（非负数）
        n: 抽取数量
        replace: 是否有放回，默认有放回
        seed: 随机种子

    Returns:
        {"result": 样本列表, ...}
    """
    t0 = time.perf_counter()
    rng = random.Random(seed)
    total_w = sum(weights)
    probs = [w / total_w for w in weights]
    if replace:
        cumulative = []
        s = 0.0
        for p in probs:
            s += p
            cumulative.append(s)

        def _pick():
            r = rng.random()
            for i, c in enumerate(cumulative):
                if r <= c:
                    return data[i]
            return data[-1]

        result = [_pick() for _ in range(n)]
    else:
        indices = list(range(len(data)))
        remaining = list(probs)
        chosen = []
        for _ in range(min(n, len(data))):
            tw = sum(remaining)
            r = rng.random() * tw
            s = 0.0
            ci = 0
            for i, w in enumerate(remaining):
                s += w
                if r <= s:
                    ci = i
                    break
            chosen.append(data[indices[ci]])
            indices.pop(ci)
            remaining.pop(ci)
        result = chosen
    return _result(result, "sample_weighted", time.perf_counter() - t0, n=len(result))


def sample_stratified(
    data: list,
    labels: list,
    n: int,
    seed: Optional[int] = None,
) -> dict:
    """分层抽样，按类别比例抽取

    Args:
        data: 原始数据列表
        labels: 每个元素对应的类别标签
        n: 总抽取数量（按比例分配到各层）
        seed: 随机种子

    Returns:
        {"result": {"samples": [...], "label_counts": {...}}, ...}
    """
    t0 = time.perf_counter()
    rng = random.Random(seed)
    groups: dict = defaultdict(list)
    for item, label in zip(data, labels):
        groups[label].append(item)
    total = len(data)
    samples = []
    counts: dict = {}
    for label, group in groups.items():
        k = max(1, round(n * len(group) / total))
        k = min(k, len(group))
        samples.extend(rng.sample(group, k))
        counts[str(label)] = k
    return _result(
        {"samples": samples, "label_counts": counts},
        "sample_stratified",
        time.perf_counter() - t0,
        total_n=len(samples),
    )


def split(
    data: list,
    test_size: float = 0.2,
    shuffle: bool = True,
    seed: Optional[int] = None,
) -> dict:
    """将数据集切分为训练集和测试集

    Args:
        data: 数据列表（每个元素为一条样本）
        test_size: 测试集比例，0 < test_size < 1
        shuffle: 是否先随机打乱
        seed: 随机种子

    Returns:
        {"result": {"train": [...], "test": [...]}, ...}
    """
    t0 = time.perf_counter()
    rng = random.Random(seed)
    items = list(data)
    if shuffle:
        rng.shuffle(items)
    cut = max(1, int(len(items) * (1 - test_size)))
    train, test = items[:cut], items[cut:]
    return _result(
        {"train": train, "test": test},
        "split",
        time.perf_counter() - t0,
        train_size=len(train),
        test_size=len(test),
    )


def join(
    left: list,
    right: list,
    left_key: str,
    right_key: str,
    how: str = "inner",
) -> dict:
    """按键连接两个 dict 列表（类似 SQL JOIN）

    Args:
        left: 左侧数据，每个元素为 dict
        right: 右侧数据，每个元素为 dict
        left_key: 左侧连接键字段名
        right_key: 右侧连接键字段名
        how: 连接方式 "inner" / "left" / "right" / "outer"

    Returns:
        {"result": [...合并后的记录...], ...}
    """
    t0 = time.perf_counter()
    right_map: dict = defaultdict(list)
    for r in right:
        right_map[r.get(right_key)].append(r)
    result = []
    left_keys_seen: set = set()
    for lrow in left:
        lk = lrow.get(left_key)
        left_keys_seen.add(lk)
        matches = right_map.get(lk, [])
        if matches:
            for rrow in matches:
                result.append({**lrow, **rrow})
        elif how in ("left", "outer"):
            result.append(dict(lrow))
    if how in ("right", "outer"):
        for rrow in right:
            if rrow.get(right_key) not in left_keys_seen:
                result.append(dict(rrow))
    return _result(result, "join", time.perf_counter() - t0, how=how, count=len(result))


def normalize(
    data: list,
    feature_range: tuple = (0.0, 1.0),
) -> dict:
    """Min-Max 归一化

    Args:
        data: 数值列表（一维）或二维列表（按列归一化）
        feature_range: 输出值范围，默认 (0, 1)

    Returns:
        {"result": 归一化后的数据, "meta": {"min", "max"}, ...}
    """
    t0 = time.perf_counter()
    a, b = feature_range
    flat = not data or isinstance(data[0], (int, float))
    if flat:
        mn, mx = min(data), max(data)
        span = (mx - mn) or 1.0
        result = [round(a + (x - mn) / span * (b - a), 6) for x in data]
        extra = {"min": mn, "max": mx}
    else:
        cols = len(data[0])
        col_min = [min(row[j] for row in data) for j in range(cols)]
        col_max = [max(row[j] for row in data) for j in range(cols)]
        result = []
        for row in data:
            new_row = []
            for j, x in enumerate(row):
                span = (col_max[j] - col_min[j]) or 1.0
                new_row.append(round(a + (x - col_min[j]) / span * (b - a), 6))
            result.append(new_row)
        extra = {"col_min": col_min, "col_max": col_max}
    return _result(result, "normalize", time.perf_counter() - t0, **extra)


def standardize(
    data: list,
) -> dict:
    """Z-Score 标准化（均值 0，标准差 1）

    Args:
        data: 数值列表或二维列表

    Returns:
        {"result": 标准化后数据, "meta": {"mean", "std"}, ...}
    """
    t0 = time.perf_counter()
    flat = not data or isinstance(data[0], (int, float))
    if flat:
        n = len(data)
        mean = sum(data) / n
        std = math.sqrt(sum((x - mean) ** 2 for x in data) / n) or 1.0
        result = [round((x - mean) / std, 6) for x in data]
        extra = {"mean": round(mean, 6), "std": round(std, 6)}
    else:
        cols = len(data[0])
        col_mean = [sum(row[j] for row in data) / len(data) for j in range(cols)]
        col_std = []
        for j in range(cols):
            var = sum((row[j] - col_mean[j]) ** 2 for row in data) / len(data)
            col_std.append(math.sqrt(var) or 1.0)
        result = [
            [round((row[j] - col_mean[j]) / col_std[j], 6) for j in range(cols)]
            for row in data
        ]
        extra = {
            "mean": [round(m, 6) for m in col_mean],
            "std": [round(s, 6) for s in col_std],
        }
    return _result(result, "standardize", time.perf_counter() - t0, **extra)


def impute(
    data: list,
    strategy: str = "mean",
    fill_value: Optional[float] = None,
) -> dict:
    """填充缺失值（None 或 NaN）

    Args:
        data: 数值列表（可含 None 或 float('nan')）
        strategy: 填充策略 "mean" / "median" / "mode" / "constant"
        fill_value: strategy="constant" 时的填充值

    Returns:
        {"result": 填充后的列表, "meta": {"strategy", "filled_count", "fill_value"}, ...}
    """
    t0 = time.perf_counter()
    valid = [x for x in data if x is not None and not (isinstance(x, float) and math.isnan(x))]
    if strategy == "mean":
        fv = sum(valid) / len(valid) if valid else 0.0
    elif strategy == "median":
        s = sorted(valid)
        n = len(s)
        fv = ((s[n // 2 - 1] + s[n // 2]) / 2) if n % 2 == 0 else s[n // 2]
    elif strategy == "mode":
        freq: dict = defaultdict(int)
        for v in valid:
            freq[v] += 1
        fv = max(freq, key=lambda k: freq[k]) if freq else 0.0
    elif strategy == "constant":
        fv = fill_value if fill_value is not None else 0.0
    else:
        raise ValueError(f"未知策略: {strategy}，可选 mean/median/mode/constant")
    filled_count = 0
    result = []
    for x in data:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            result.append(fv)
            filled_count += 1
        else:
            result.append(x)
    return _result(
        result, "impute", time.perf_counter() - t0,
        strategy=strategy, filled_count=filled_count, fill_value=fv,
    )


def cast(
    data: list,
    dtype: str,
) -> dict:
    """批量类型转换

    Args:
        data: 数据列表
        dtype: 目标类型 "int" / "float" / "str" / "bool"

    Returns:
        {"result": 转换后的列表, ...}
    """
    t0 = time.perf_counter()
    type_map = {"int": int, "float": float, "str": str, "bool": bool}
    if dtype not in type_map:
        raise ValueError(f"不支持的类型: {dtype}，可选 int/float/str/bool")
    fn = type_map[dtype]
    result = [fn(x) for x in data]
    return _result(result, "cast", time.perf_counter() - t0, dtype=dtype, count=len(result))
