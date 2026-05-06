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


def dct(signal: list, dct_type: int = 2, norm: str = "ortho") -> dict:
    """zh_name: 离散余弦变换（DCT）
    zh_desc: 对信号进行 DCT 变换，输出系数和前 10 个系数的能量占比
    tags: 变换, 信号处理, DCT"""
    return _dct(signal, dct_type, norm)
