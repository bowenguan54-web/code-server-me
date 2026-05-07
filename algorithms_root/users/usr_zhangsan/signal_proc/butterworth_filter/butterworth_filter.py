"""
zh_name: 巴特沃斯低通滤波器
zh_description: 使用巴特沃斯低通滤波器对信号进行平滑，去除高频噪声。
zh_tags: [信号处理, 滤波, 频域]
version: 1.0.0
input_example: {"signal": [0.1, 0.5, 0.3, 0.9, 0.2, 0.8, 0.4], "cutoff_hz": 5.0, "sample_hz": 50.0, "order": 3}
"""

from typing import List


def butterworth_filter(signal: List[float], cutoff_hz: float = 5.0, sample_hz: float = 50.0, order: int = 3) -> List[float]:
    """巴特沃斯低通滤波器。

    Args:
        signal: 输入信号序列。
        cutoff_hz: 截止频率（Hz），默认 5 Hz。
        sample_hz: 采样频率（Hz），默认 50 Hz。
        order: 滤波器阶数，默认 3。

    Returns:
        滤波后的信号序列。
    """
    try:
        from scipy import signal as sp_signal
        import numpy as np
        nyq = 0.5 * sample_hz
        normal_cutoff = cutoff_hz / nyq
        normal_cutoff = min(normal_cutoff, 0.99)
        b, a = sp_signal.butter(order, normal_cutoff, btype="low", analog=False)
        filtered = sp_signal.filtfilt(b, a, signal)
        return [float(x) for x in filtered]
    except ImportError:
        # Fallback: simple moving average approximation
        window = max(1, int(sample_hz / (2 * cutoff_hz)))
        result = []
        for i in range(len(signal)):
            start = max(0, i - window + 1)
            result.append(sum(signal[start: i + 1]) / (i - start + 1))
        return result
