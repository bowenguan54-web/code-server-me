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


def dft(signal: list, normalize: bool = False) -> dict:
    """zh_name: 离散傅里叶变换（DFT）
    zh_desc: 使用矩阵运算实现 DFT，输出实部、虚部、幅度和相位
    tags: 频谱分析, 信号处理, DFT"""
    return _dft(signal, normalize)
