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


def fft(signal: list, fs: float = 1.0, n_fft: int = None) -> dict:
    """zh_name: 快速傅里叶变换（FFT）
    zh_desc: 对实数信号进行 FFT，输出频率、幅度、相位和功率谱
    tags: 频谱分析, 信号处理, FFT"""
    return _fft(signal, fs, n_fft)
