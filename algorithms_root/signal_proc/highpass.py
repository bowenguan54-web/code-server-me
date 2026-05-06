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


def highpass(signal: list, cutoff: float, fs: float = 1.0, order: int = 4) -> dict:
    """zh_name: 高通滤波器
    zh_desc: 使用 Butterworth 高通滤波器对信号进行滤波
    tags: 滤波, 高通, 信号处理"""
    return _highpass(signal, cutoff, fs, order)
