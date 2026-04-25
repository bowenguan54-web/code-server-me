"""
algolib.statistics — 统计分析模块

提供: describe, dist, corr, pearson, cov, boxplot,
      percentile, outlier, anova, chisq, normtest, ahp, entropy, yoy
"""

import math
import time
from typing import Any, Optional

import numpy as np
from scipy import stats


def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def _to_list(x: Any) -> Any:
    """递归将 numpy 对象转换为 Python 原生类型"""
    if isinstance(x, np.ndarray):
        return x.tolist()
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating,)):
        return float(x)
    if isinstance(x, dict):
        return {k: _to_list(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_to_list(v) for v in x]
    return x


def describe(
    data: list,
) -> dict:
    """描述性统计

    Args:
        data: 数值列表

    Returns:
        {"result": {"count", "mean", "std", "min", "q1", "median", "q3", "max", "range"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    q1, median, q3 = float(np.percentile(arr, 25)), float(np.median(arr)), float(np.percentile(arr, 75))
    result = {
        "count": int(len(arr)),
        "mean": round(float(np.mean(arr)), 6),
        "std": round(float(np.std(arr, ddof=1)), 6),
        "min": round(float(np.min(arr)), 6),
        "q1": round(q1, 6),
        "median": round(median, 6),
        "q3": round(q3, 6),
        "max": round(float(np.max(arr)), 6),
        "range": round(float(np.max(arr) - np.min(arr)), 6),
        "skewness": round(float(stats.skew(arr)), 6),
        "kurtosis": round(float(stats.kurtosis(arr)), 6),
    }
    return _result(result, "describe", time.perf_counter() - t0)


def dist(
    data: list,
    distributions: Optional[list] = None,
) -> dict:
    """拟合概率分布

    Args:
        data: 数值列表
        distributions: 要尝试的分布名称列表，默认 ["norm", "expon", "gamma", "beta", "lognorm"]

    Returns:
        {"result": {"best_fit": str, "fits": [{"dist", "params", "sse"}, ...]}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    dist_names = distributions or ["norm", "expon", "gamma", "beta", "lognorm"]
    fits = []
    y, x = np.histogram(arr, bins=min(50, len(arr) // 5 or 10), density=True)
    x_mid = (x[:-1] + x[1:]) / 2
    for name in dist_names:
        try:
            d = getattr(stats, name)
            params = d.fit(arr)
            pdf = d.pdf(x_mid, *params)
            sse = float(np.sum((y - pdf) ** 2))
            fits.append({"dist": name, "params": [round(p, 6) for p in params], "sse": round(sse, 8)})
        except Exception:
            pass
    fits.sort(key=lambda f: f["sse"])
    result = {
        "best_fit": fits[0]["dist"] if fits else "unknown",
        "fits": fits,
    }
    return _result(result, "dist", time.perf_counter() - t0)


def corr(
    data: list,
    method: str = "pearson",
) -> dict:
    """相关系数矩阵

    Args:
        data: 二维数值列表（每列为一个变量，每行为一条样本）
        method: "pearson" / "spearman" / "kendall"

    Returns:
        {"result": 相关矩阵（二维列表）, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    if method == "spearman":
        mat, _ = stats.spearmanr(arr)
        if np.isscalar(mat):
            mat = np.array([[1.0, float(mat)], [float(mat), 1.0]])
        else:
            mat = np.array(mat)
    elif method == "kendall":
        n = arr.shape[1]
        mat = np.zeros((n, n))
        for i in range(n):
            for j in range(n):
                tau, _ = stats.kendalltau(arr[:, i], arr[:, j])
                mat[i, j] = tau
    else:
        mat = np.corrcoef(arr.T)
    result = [[round(float(v), 6) for v in row] for row in mat]
    return _result(result, "corr", time.perf_counter() - t0, method=method, shape=list(mat.shape))


def pearson(
    x: list,
    y: list,
) -> dict:
    """Pearson 相关系数（两组序列）

    Args:
        x: 第一组数值列表
        y: 第二组数值列表

    Returns:
        {"result": {"r": float, "p_value": float}, ...}
    """
    t0 = time.perf_counter()
    r, p = stats.pearsonr(x, y)
    result = {"r": round(float(r), 6), "p_value": round(float(p), 8)}
    return _result(result, "pearson", time.perf_counter() - t0)


def cov(
    data: list,
    ddof: int = 1,
) -> dict:
    """协方差矩阵

    Args:
        data: 二维数值列表（每列为一个变量）
        ddof: 自由度修正，默认 1（样本协方差）

    Returns:
        {"result": 协方差矩阵（二维列表）, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    if arr.ndim == 1:
        arr = arr.reshape(-1, 1)
    mat = np.cov(arr.T, ddof=ddof)
    if mat.ndim == 0:
        mat = np.array([[float(mat)]])
    result = [[round(float(v), 6) for v in row] for row in mat]
    return _result(result, "cov", time.perf_counter() - t0, ddof=ddof)


def boxplot(
    data: list,
    whis: float = 1.5,
) -> dict:
    """箱线图统计量

    Args:
        data: 数值列表
        whis: 须长系数（IQR 倍数），默认 1.5

    Returns:
        {"result": {"q1", "median", "q3", "iqr", "lower_fence", "upper_fence", "outliers"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    q1 = float(np.percentile(arr, 25))
    q3 = float(np.percentile(arr, 75))
    median = float(np.median(arr))
    iqr = q3 - q1
    lower = q1 - whis * iqr
    upper = q3 + whis * iqr
    outliers = [round(float(x), 6) for x in arr if x < lower or x > upper]
    result = {
        "q1": round(q1, 6),
        "median": round(median, 6),
        "q3": round(q3, 6),
        "iqr": round(iqr, 6),
        "lower_fence": round(lower, 6),
        "upper_fence": round(upper, 6),
        "outliers": outliers,
        "outlier_count": len(outliers),
    }
    return _result(result, "boxplot", time.perf_counter() - t0, whis=whis)


def percentile(
    data: list,
    q: Any = None,
) -> dict:
    """分位数计算

    Args:
        data: 数值列表
        q: 分位数或分位数列表，如 50 或 [25, 50, 75]，默认 [10,25,50,75,90]

    Returns:
        {"result": {分位数: 值, ...}, ...}
    """
    t0 = time.perf_counter()
    if q is None:
        q = [10, 25, 50, 75, 90]
    arr = np.array(data, dtype=float)
    qs = [q] if isinstance(q, (int, float)) else q
    values = np.percentile(arr, qs)
    result = {str(int(qi)): round(float(v), 6) for qi, v in zip(qs, values)}
    return _result(result, "percentile", time.perf_counter() - t0, quantiles=qs)


def outlier(
    data: list,
    method: str = "iqr",
    threshold: float = 1.5,
) -> dict:
    """异常值检测

    Args:
        data: 数值列表
        method: "iqr"（IQR 法）或 "zscore"（Z-Score 法）
        threshold: IQR 法的须长系数（默认 1.5）；Z-Score 法的阈值（默认使用 3.0）

    Returns:
        {"result": {"outliers": [(index, value), ...], "normal": [...]}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    if method == "iqr":
        q1 = float(np.percentile(arr, 25))
        q3 = float(np.percentile(arr, 75))
        iqr = q3 - q1
        lower = q1 - threshold * iqr
        upper = q3 + threshold * iqr
        mask = (arr < lower) | (arr > upper)
    else:
        z_threshold = threshold if threshold > 1 else 3.0
        z = np.abs(stats.zscore(arr))
        mask = z > z_threshold
    outliers_list = [(int(i), round(float(arr[i]), 6)) for i in np.where(mask)[0]]
    normal_list = [round(float(v), 6) for v in arr[~mask]]
    result = {
        "outliers": outliers_list,
        "outlier_count": len(outliers_list),
        "normal": normal_list,
        "outlier_ratio": round(len(outliers_list) / len(arr), 4),
    }
    return _result(result, "outlier", time.perf_counter() - t0, method=method, threshold=threshold)


def anova(
    *groups: list,
) -> dict:
    """单因素方差分析（One-Way ANOVA）

    Args:
        *groups: 各组数值列表，至少两组

    Returns:
        {"result": {"f_statistic", "p_value", "significant"}, ...}
    """
    t0 = time.perf_counter()
    f, p = stats.f_oneway(*[np.array(g, dtype=float) for g in groups])
    result = {
        "f_statistic": round(float(f), 6),
        "p_value": round(float(p), 8),
        "significant": bool(p < 0.05),
        "group_count": len(groups),
    }
    return _result(result, "anova", time.perf_counter() - t0)


def chisq(
    observed: list,
    expected: Optional[list] = None,
) -> dict:
    """卡方检验（拟合优度）

    Args:
        observed: 观测频数列表
        expected: 期望频数列表（默认均匀分布）

    Returns:
        {"result": {"chi2", "p_value", "dof", "significant"}, ...}
    """
    t0 = time.perf_counter()
    obs = np.array(observed, dtype=float)
    exp = np.array(expected, dtype=float) if expected is not None else None
    chi2, p = stats.chisquare(obs, f_exp=exp)
    dof = len(obs) - 1
    result = {
        "chi2": round(float(chi2), 6),
        "p_value": round(float(p), 8),
        "dof": dof,
        "significant": bool(p < 0.05),
    }
    return _result(result, "chisq", time.perf_counter() - t0)


def normtest(
    data: list,
) -> dict:
    """正态性检验（Shapiro-Wilk + D'Agostino-Pearson）

    Args:
        data: 数值列表（建议长度 3~5000）

    Returns:
        {"result": {"shapiro": {...}, "dagostino": {...}, "is_normal": bool}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    sw_stat, sw_p = stats.shapiro(arr[:5000])
    k2_stat, k2_p = stats.normaltest(arr)
    result = {
        "shapiro": {"statistic": round(float(sw_stat), 6), "p_value": round(float(sw_p), 8)},
        "dagostino": {"statistic": round(float(k2_stat), 6), "p_value": round(float(k2_p), 8)},
        "is_normal": bool(sw_p > 0.05 and k2_p > 0.05),
        "n": len(arr),
    }
    return _result(result, "normtest", time.perf_counter() - t0)


def ahp(
    matrix: list,
) -> dict:
    """层次分析法（AHP）—— 从成对比较矩阵计算权重向量

    Args:
        matrix: n×n 成对比较矩阵（二维列表），matrix[i][j] 表示 i 相对 j 的重要程度

    Returns:
        {"result": {"weights": [...], "lambda_max", "ci", "cr", "consistent"}, ...}
    """
    t0 = time.perf_counter()
    mat = np.array(matrix, dtype=float)
    n = mat.shape[0]
    # 列归一化后行平均得权重
    col_sum = mat.sum(axis=0)
    norm = mat / col_sum
    weights = norm.mean(axis=1)
    # 一致性比率
    lam_max = float(np.dot(mat, weights) / weights)
    ci = (lam_max - n) / (n - 1)
    ri_table = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.90, 5: 1.12,
                6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}
    ri = ri_table.get(n, 1.49)
    cr = ci / ri if ri > 0 else 0.0
    result = {
        "weights": [round(float(w), 6) for w in weights],
        "lambda_max": round(lam_max, 6),
        "ci": round(ci, 6),
        "cr": round(cr, 6),
        "consistent": bool(cr < 0.1),
    }
    return _result(result, "ahp", time.perf_counter() - t0, n=n)


def entropy(
    data: list,
    base: float = 2.0,
) -> dict:
    """Shannon 信息熵

    Args:
        data: 概率列表（非负，不要求归一化）或频数列表
        base: 对数底，默认 2（bit）；可用 math.e 得到 nat

    Returns:
        {"result": {"entropy": float, "max_entropy": float, "normalized_entropy": float}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    arr = arr[arr > 0]
    arr = arr / arr.sum()
    h = -float(np.sum(arr * np.log(arr) / math.log(base)))
    n = len(arr)
    max_h = math.log(n, base) if n > 1 else 1.0
    result = {
        "entropy": round(h, 6),
        "max_entropy": round(max_h, 6),
        "normalized_entropy": round(h / max_h if max_h > 0 else 0.0, 6),
        "base": base,
    }
    return _result(result, "entropy", time.perf_counter() - t0)


def yoy(
    current: list,
    previous: list,
    labels: Optional[list] = None,
) -> dict:
    """同比增长率（Year-Over-Year）

    Args:
        current: 当期值列表
        previous: 同期基准值列表
        labels: 每个时间点的标签（可选）

    Returns:
        {"result": [{"label", "current", "previous", "yoy_rate"}, ...], ...}
    """
    t0 = time.perf_counter()
    records = []
    for i, (c, p) in enumerate(zip(current, previous)):
        if p != 0:
            rate = round((c - p) / abs(p) * 100, 4)
        else:
            rate = None
        records.append({
            "label": labels[i] if labels else i,
            "current": c,
            "previous": p,
            "yoy_rate": rate,
        })
    avg_rate = sum(r["yoy_rate"] for r in records if r["yoy_rate"] is not None)
    count = sum(1 for r in records if r["yoy_rate"] is not None)
    result = {
        "records": records,
        "avg_yoy_rate": round(avg_rate / count, 4) if count else None,
    }
    return _result(result, "yoy", time.perf_counter() - t0, count=len(records))
