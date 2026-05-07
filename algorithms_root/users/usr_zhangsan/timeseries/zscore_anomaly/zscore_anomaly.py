"""
zh_name: Z-Score 异常检测
zh_description: 基于 Z-Score 标准差方法检测时间序列中的异常点，返回每个点的异常标志和 Z-Score 值。
zh_tags: [时序, 异常检测, 统计]
version: 1.0.0
input_example: {"data": [1, 2, 2, 3, 100, 2, 1, 2, 3, 2], "threshold": 2.5}
"""

import math
from typing import List, Dict, Any


def zscore_anomaly(data: List[float], threshold: float = 3.0) -> Dict[str, Any]:
    """基于 Z-Score 的时间序列异常检测。

    Args:
        data: 输入时间序列数据。
        threshold: 判定为异常的 Z-Score 阈值，默认 3.0（即 3 倍标准差）。

    Returns:
        包含以下字段的字典：
            - z_scores: 每个点的 Z-Score 列表
            - anomaly_flags: 每个点是否为异常的布尔列表
            - anomaly_indices: 异常点的索引列表
    """
    if not data:
        return {"z_scores": [], "anomaly_flags": [], "anomaly_indices": []}

    n = len(data)
    mean = sum(data) / n
    variance = sum((x - mean) ** 2 for x in data) / n
    std = math.sqrt(variance) if variance > 0 else 1e-10

    z_scores = [(x - mean) / std for x in data]
    anomaly_flags = [abs(z) > threshold for z in z_scores]
    anomaly_indices = [i for i, flag in enumerate(anomaly_flags) if flag]

    return {
        "z_scores": [round(z, 4) for z in z_scores],
        "anomaly_flags": anomaly_flags,
        "anomaly_indices": anomaly_indices,
    }
