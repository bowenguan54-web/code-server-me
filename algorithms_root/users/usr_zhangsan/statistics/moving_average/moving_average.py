"""
zh_name: 移动平均
zh_description: 计算时间序列的简单移动平均（SMA），可用于平滑噪声数据。
zh_tags: [统计, 时序, 平滑]
version: 1.0.0
input_example: {"data": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "window": 3}
"""

from typing import List


def moving_average(data: List[float], window: int = 3) -> List[float]:
    """计算简单移动平均。

    Args:
        data: 输入时间序列数据。
        window: 滑动窗口大小，默认为 3。

    Returns:
        与输入等长的移动平均序列，前 window-1 个值用 NaN 填充。
    """
    if window < 1:
        raise ValueError("window must be >= 1")
    result: List[float] = []
    for i in range(len(data)):
        if i < window - 1:
            result.append(float("nan"))
        else:
            window_data = data[i - window + 1 : i + 1]
            result.append(sum(window_data) / window)
    return result
