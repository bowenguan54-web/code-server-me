"""
用户自定义算法示例文件
将本文件放在 user_algorithms/ 目录下，或复制后修改。
文件保存后会被自动检测、加载，并通过 SSE 推送到编辑器。
"""

from algo_service.sdk.decorators import algo_export


@algo_export(
    category="custom",
    description="带截断的自定义归一化（Min-Max + Clip）",
    version="1.0.0",
    inputs={"data": "list[float]", "lo": "float = 0.0", "hi": "float = 1.0"},
    outputs={"normalized": "list[float]", "clipped_count": "int"},
)
def clip_normalize(data: list, lo: float = 0.0, hi: float = 1.0) -> dict:
    """先归一化到 [0,1]，然后裁剪到 [lo, hi]"""
    import time
    t0 = time.perf_counter()
    arr = list(data)
    vmin = min(arr)
    vmax = max(arr)
    span = vmax - vmin or 1.0
    normalized = [(x - vmin) / span for x in arr]
    clipped = [max(lo, min(hi, v)) for v in normalized]
    clipped_count = sum(1 for a, b in zip(normalized, clipped) if a != b)
    return {
        "result": {"normalized": [round(v, 6) for v in clipped], "clipped_count": clipped_count},
        "meta": {"algorithm": "clip_normalize", "vmin": vmin, "vmax": vmax},
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
    }


@algo_export(
    category="custom",
    description="IQR 方法异常检测",
    version="1.0.0",
    inputs={"data": "list[float]", "multiplier": "float = 1.5"},
    outputs={"outlier_indices": "list[int]", "bounds": "dict"},
)
def iqr_anomaly(data: list, multiplier: float = 1.5) -> dict:
    """使用四分位距（IQR）方法识别异常值"""
    import time
    t0 = time.perf_counter()
    arr = sorted(data)
    n = len(arr)
    q1 = arr[n // 4]
    q3 = arr[3 * n // 4]
    iqr = q3 - q1
    lower = q1 - multiplier * iqr
    upper = q3 + multiplier * iqr
    outlier_indices = [i for i, v in enumerate(data) if v < lower or v > upper]
    return {
        "result": {
            "outlier_indices": outlier_indices,
            "outlier_values": [data[i] for i in outlier_indices],
            "bounds": {"lower": round(lower, 6), "upper": round(upper, 6)},
            "outlier_count": len(outlier_indices),
        },
        "meta": {"algorithm": "iqr_anomaly", "q1": q1, "q3": q3, "iqr": iqr},
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
    }


@algo_export(
    category="custom",
    description="时间序列统计特征提取",
    version="1.0.0",
    inputs={"series": "list[float]"},
    outputs={"mean": "float", "variance": "float", "slope": "float", "autocorr_1": "float"},
)
def ts_features(series: list) -> dict:
    """提取时间序列的基础统计特征：均值、方差、线性趋势斜率、一阶自相关"""
    import time
    t0 = time.perf_counter()
    n = len(series)
    mean = sum(series) / n
    variance = sum((x - mean) ** 2 for x in series) / n
    # 线性趋势斜率（最小二乘）
    x_bar = (n - 1) / 2.0
    slope = sum((i - x_bar) * (v - mean) for i, v in enumerate(series))
    denom = sum((i - x_bar) ** 2 for i in range(n))
    slope = slope / denom if denom > 0 else 0.0
    # 一阶自相关
    if n > 1:
        autocorr_1 = sum((series[i] - mean) * (series[i - 1] - mean) for i in range(1, n))
        autocorr_1 = autocorr_1 / (variance * (n - 1)) if variance > 0 else 0.0
    else:
        autocorr_1 = 0.0
    return {
        "result": {
            "mean": round(mean, 6),
            "variance": round(variance, 6),
            "std": round(variance ** 0.5, 6),
            "slope": round(slope, 6),
            "autocorr_1": round(autocorr_1, 6),
        },
        "meta": {"algorithm": "ts_features", "n": n},
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
    }
