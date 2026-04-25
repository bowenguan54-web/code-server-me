"""
signal_proc — 信号处理算法组件

包含: fft, dft, dct, wavelet, conv, adaptive,
      lowpass, highpass, bandpass, bandstop
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))

from algo_service.sdk.decorators import algo_meta
from examples.algolib.signal_proc import (
    fft as _fft,
    dft as _dft,
    dct as _dct,
    wavelet as _wavelet,
    conv as _conv,
    adaptive as _adaptive,
    lowpass as _lowpass,
    highpass as _highpass,
    bandpass as _bandpass,
    bandstop as _bandstop,
)


@algo_meta(
    zh_name="快速傅里叶变换（FFT）",
    zh_description="对实数信号进行 FFT，输出频率、幅度、相位和功率谱",
    zh_tags=["频谱分析", "信号处理", "FFT"],
    version="1.0.0",
)
def fft(signal: list, fs: float = 1.0, n_fft: int = None) -> dict:
    """zh_name: 快速傅里叶变换（FFT）
    zh_desc: 对实数信号进行 FFT，输出频率、幅度、相位和功率谱
    tags: 频谱分析, 信号处理, FFT"""
    return _fft(signal, fs, n_fft)


@algo_meta(
    zh_name="离散傅里叶变换（DFT）",
    zh_description="使用矩阵运算实现 DFT，输出实部、虚部、幅度和相位",
    zh_tags=["频谱分析", "信号处理", "DFT"],
    version="1.0.0",
)
def dft(signal: list, normalize: bool = False) -> dict:
    """zh_name: 离散傅里叶变换（DFT）
    zh_desc: 使用矩阵运算实现 DFT，输出实部、虚部、幅度和相位
    tags: 频谱分析, 信号处理, DFT"""
    return _dft(signal, normalize)


@algo_meta(
    zh_name="离散余弦变换（DCT）",
    zh_description="对信号进行 DCT 变换，输出系数和前 10 个系数的能量占比",
    zh_tags=["变换", "信号处理", "DCT"],
    version="1.0.0",
)
def dct(signal: list, dct_type: int = 2, norm: str = "ortho") -> dict:
    """zh_name: 离散余弦变换（DCT）
    zh_desc: 对信号进行 DCT 变换，输出系数和前 10 个系数的能量占比
    tags: 变换, 信号处理, DCT"""
    return _dct(signal, dct_type, norm)


@algo_meta(
    zh_name="小波变换",
    zh_description="对信号进行离散小波分解（需安装 PyWavelets），输出近似系数和细节系数",
    zh_tags=["小波", "信号处理", "时频分析"],
    version="1.0.0",
)
def wavelet(signal: list, wavelet_name: str = "db4", level: int = 3) -> dict:
    """zh_name: 小波变换
    zh_desc: 对信号进行离散小波分解，输出近似系数和各层细节系数
    tags: 小波, 信号处理, 时频分析"""
    return _wavelet(signal, wavelet_name, level)


@algo_meta(
    zh_name="卷积",
    zh_description="计算两个离散序列的线性卷积",
    zh_tags=["卷积", "信号处理"],
    version="1.0.0",
)
def conv(signal: list, kernel: list, mode: str = "full") -> dict:
    """zh_name: 卷积
    zh_desc: 计算两个离散序列的线性卷积，支持 full/same/valid 模式
    tags: 卷积, 信号处理"""
    return _conv(signal, kernel, mode)


@algo_meta(
    zh_name="自适应滤波",
    zh_description="使用 LMS 自适应滤波算法对信号进行噪声消除",
    zh_tags=["滤波", "自适应", "信号处理"],
    version="1.0.0",
)
def adaptive(signal: list, reference: list, mu: float = 0.01, order: int = 4) -> dict:
    """zh_name: 自适应滤波
    zh_desc: 使用 LMS 自适应滤波算法对信号进行噪声消除
    tags: 滤波, 自适应, 信号处理"""
    return _adaptive(signal, reference, mu, order)


@algo_meta(
    zh_name="低通滤波器",
    zh_description="使用 Butterworth 低通滤波器对信号进行滤波，截止频率以 Hz 指定",
    zh_tags=["滤波", "低通", "信号处理"],
    version="1.0.0",
)
def lowpass(signal: list, cutoff: float, fs: float = 1.0, order: int = 4) -> dict:
    """zh_name: 低通滤波器
    zh_desc: 使用 Butterworth 低通滤波器对信号进行滤波
    tags: 滤波, 低通, 信号处理"""
    return _lowpass(signal, cutoff, fs, order)


@algo_meta(
    zh_name="高通滤波器",
    zh_description="使用 Butterworth 高通滤波器对信号进行滤波，截止频率以 Hz 指定",
    zh_tags=["滤波", "高通", "信号处理"],
    version="1.0.0",
)
def highpass(signal: list, cutoff: float, fs: float = 1.0, order: int = 4) -> dict:
    """zh_name: 高通滤波器
    zh_desc: 使用 Butterworth 高通滤波器对信号进行滤波
    tags: 滤波, 高通, 信号处理"""
    return _highpass(signal, cutoff, fs, order)


@algo_meta(
    zh_name="带通滤波器",
    zh_description="使用 Butterworth 带通滤波器保留指定频率范围内的信号",
    zh_tags=["滤波", "带通", "信号处理"],
    version="1.0.0",
)
def bandpass(signal: list, low_cut: float, high_cut: float, fs: float = 1.0, order: int = 4) -> dict:
    """zh_name: 带通滤波器
    zh_desc: 使用 Butterworth 带通滤波器保留指定频率范围内的信号
    tags: 滤波, 带通, 信号处理"""
    return _bandpass(signal, low_cut, high_cut, fs, order)


@algo_meta(
    zh_name="带阻滤波器",
    zh_description="使用 Butterworth 带阻滤波器（陷波器）抑制指定频率范围内的信号",
    zh_tags=["滤波", "带阻", "陷波", "信号处理"],
    version="1.0.0",
)
def bandstop(signal: list, low_cut: float, high_cut: float, fs: float = 1.0, order: int = 4) -> dict:
    """zh_name: 带阻滤波器
    zh_desc: 使用 Butterworth 带阻滤波器抑制指定频率范围内的信号
    tags: 滤波, 带阻, 陷波, 信号处理"""
    return _bandstop(signal, low_cut, high_cut, fs, order)
