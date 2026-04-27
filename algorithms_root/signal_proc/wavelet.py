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


def wavelet(signal: list, wavelet_name: str = "db4", level: int = 3) -> dict:
    """zh_name: 小波变换
    zh_desc: 对信号进行离散小波分解，输出近似系数和各层细节系数
    tags: 小波, 信号处理, 时频分析"""
    return _wavelet(signal, wavelet_name, level)
