"""
算法模板 - Z-Score 异常检测
即插即用：直接将此文件复制到项目中，然后 from algo_template import detect_anomalies
仅依赖 Python 标准库 statistics，无需安装任何第三方包
"""
import statistics


def detect_anomalies(data: list, threshold: float = 2.5) -> dict:
    """
    Z-Score 异常检测模板

    参数:
        data      : 数值列表，例如传感器读数 / 指标时序
        threshold : Z-Score 阈值，超出则视为异常（默认 2.5）

    返回:
        {
          "mean"     : 均值,
          "stdev"    : 标准差,
          "z_scores" : 每个数据点的 Z-Score 列表,
          "anomalies": [(index, value, z_score), ...] 异常点列表
        }
    """
    if len(data) < 2:
        raise ValueError("数据点至少需要 2 个")

    mean = statistics.mean(data)
    stdev = statistics.stdev(data)

    if stdev == 0:
        return {
            "mean": mean,
            "stdev": 0.0,
            "z_scores": [0.0] * len(data),
            "anomalies": [],
        }

    z_scores = [(x - mean) / stdev for x in data]
    anomalies = [
        (i, data[i], round(z, 4))
        for i, z in enumerate(z_scores)
        if abs(z) > threshold
    ]

    return {
        "mean": round(mean, 4),
        "stdev": round(stdev, 4),
        "z_scores": [round(z, 4) for z in z_scores],
        "anomalies": anomalies,
    }
