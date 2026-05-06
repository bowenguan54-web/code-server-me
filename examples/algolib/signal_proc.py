"""
algolib.signal_proc — 信号处理模块

提供: fft, dft, dct, wavelet, conv, adaptive,
      lowpass, highpass, bandpass, bandstop
"""

import time
from typing import Any, Optional

import numpy as np
from scipy.fft import dct as scipy_dct
from scipy.signal import butter, lfilter, sosfilt, butter as butter_sos


def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def fft(
    signal: list,
    fs: float = 1.0,
    n_fft: Optional[int] = None,
) -> dict:
    """快速傅里叶变换（FFT）

    Args:
        signal: 实数或复数信号列表
        fs: 采样频率（Hz）
        n_fft: FFT 点数（默认等于信号长度）

    Returns:
        {"result": {"frequencies", "magnitude", "phase", "power_spectrum"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    n = n_fft or len(arr)
    spectrum = np.fft.rfft(arr, n=n)
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    magnitude = np.abs(spectrum)
    phase = np.angle(spectrum)
    power = magnitude ** 2
    peak_idx = int(np.argmax(magnitude[1:])) + 1  # 忽略 DC 分量
    return _result(
        {
            "frequencies": [round(float(f), 6) for f in freqs],
            "magnitude": [round(float(m), 6) for m in magnitude],
            "phase": [round(float(p), 6) for p in phase],
            "power_spectrum": [round(float(p), 6) for p in power],
            "peak_frequency": round(float(freqs[peak_idx]), 6),
            "peak_magnitude": round(float(magnitude[peak_idx]), 6),
        },
        "fft", time.perf_counter() - t0,
        n=n, fs=fs,
    )


def dft(
    signal: list,
    normalize: bool = False,
) -> dict:
    """离散傅里叶变换（矩阵实现）

    Args:
        signal: 实数信号列表（长度 N）
        normalize: 是否正交归一化（除以 sqrt(N)）

    Returns:
        {"result": {"real", "imag", "magnitude", "phase"}, ...}
    """
    t0 = time.perf_counter()
    x = np.array(signal, dtype=float)
    N = len(x)
    k = np.arange(N).reshape(N, 1)
    n = np.arange(N).reshape(1, N)
    W = np.exp(-2j * np.pi * k * n / N)
    X = W @ x
    if normalize:
        X = X / np.sqrt(N)
    return _result(
        {
            "real": [round(float(v), 6) for v in X.real],
            "imag": [round(float(v), 6) for v in X.imag],
            "magnitude": [round(float(v), 6) for v in np.abs(X)],
            "phase": [round(float(v), 6) for v in np.angle(X)],
        },
        "dft", time.perf_counter() - t0,
        N=N, normalize=normalize,
    )


def dct(
    signal: list,
    dct_type: int = 2,
    norm: Optional[str] = "ortho",
) -> dict:
    """离散余弦变换（DCT）

    Args:
        signal: 实数信号列表
        dct_type: DCT 类型 1/2/3/4，默认 2（最常用）
        norm: "ortho" 正交归一化，None 不归一化

    Returns:
        {"result": {"coefficients", "energy_ratio_top10"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    coeffs = scipy_dct(arr, type=dct_type, norm=norm)
    total_energy = float(np.sum(coeffs ** 2))
    top10_energy = float(np.sum(np.sort(coeffs ** 2)[-10:])) if len(coeffs) >= 10 else total_energy
    energy_ratio = round(top10_energy / total_energy, 4) if total_energy > 0 else 0.0
    return _result(
        {
            "coefficients": [round(float(c), 6) for c in coeffs],
            "energy_ratio_top10": energy_ratio,
            "total_energy": round(total_energy, 6),
        },
        "dct", time.perf_counter() - t0,
        dct_type=dct_type, norm=norm,
    )


def wavelet(
    signal: list,
    wavelet_name: str = "db4",
    level: int = 3,
) -> dict:
    """小波变换（离散小波分解）

    Args:
        signal: 实数信号列表
        wavelet_name: 小波基名称，如 "db4" / "haar" / "sym5"（需要安装 PyWavelets）
        level: 分解层数

    Returns:
        {"result": {"approximation", "details", "level"}, ...}
    """
    t0 = time.perf_counter()
    try:
        import pywt  # type: ignore
        arr = np.array(signal, dtype=float)
        coeffs = pywt.wavedec(arr, wavelet=wavelet_name, level=level)
        approx = [round(float(v), 6) for v in coeffs[0]]
        details = [[round(float(v), 6) for v in c] for c in coeffs[1:]]
        return _result(
            {"approximation": approx, "details": details, "level": level},
            "wavelet", time.perf_counter() - t0,
            wavelet=wavelet_name,
        )
    except ImportError:
        # 回退：用 scipy CWT（Morlet）
        from scipy.signal import cwt, morlet2
        arr = np.array(signal, dtype=float)
        widths = np.arange(1, level * 4 + 1)
        cwt_matrix = cwt(arr, morlet2, widths)
        return _result(
            {
                "approximation": [round(float(v), 6) for v in cwt_matrix[0].real],
                "details": [[round(float(v), 6) for v in row.real] for row in cwt_matrix[1:]],
                "level": len(cwt_matrix),
            },
            "wavelet", time.perf_counter() - t0,
            wavelet="morlet2_fallback",
        )


def conv(
    signal: list,
    kernel: list,
    mode: str = "full",
) -> dict:
    """卷积运算

    Args:
        signal: 输入信号列表
        kernel: 卷积核列表
        mode: "full" / "same" / "valid"

    Returns:
        {"result": {"output", "output_length"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    k = np.array(kernel, dtype=float)
    output = np.convolve(arr, k, mode=mode)
    return _result(
        {"output": [round(float(v), 6) for v in output], "output_length": len(output)},
        "conv", time.perf_counter() - t0,
        mode=mode, kernel_length=len(k),
    )


def adaptive(
    desired: list,
    input_signal: list,
    mu: float = 0.01,
    filter_order: int = 4,
) -> dict:
    """自适应滤波（LMS 算法）

    Args:
        desired: 期望信号列表
        input_signal: 输入参考信号列表
        mu: 步长（学习率），0 < mu < 1 / (N * P(x))
        filter_order: 滤波器阶数 M

    Returns:
        {"result": {"output", "error", "final_weights"}, ...}
    """
    t0 = time.perf_counter()
    d = np.array(desired, dtype=float)
    x = np.array(input_signal, dtype=float)
    n_samples = min(len(d), len(x))
    M = filter_order
    w = np.zeros(M)
    output = np.zeros(n_samples)
    error = np.zeros(n_samples)
    for i in range(n_samples):
        # 填充输入缓冲
        start = max(0, i - M + 1)
        buf = x[start: i + 1]
        if len(buf) < M:
            buf = np.pad(buf, (M - len(buf), 0))
        buf = buf[:M][::-1]
        y = float(np.dot(w, buf))
        e = d[i] - y
        w += 2 * mu * e * buf
        output[i] = y
        error[i] = e
    return _result(
        {
            "output": [round(float(v), 6) for v in output],
            "error": [round(float(v), 6) for v in error],
            "final_weights": [round(float(v), 6) for v in w],
            "final_mse": round(float(np.mean(error ** 2)), 6),
        },
        "adaptive", time.perf_counter() - t0,
        mu=mu, filter_order=M,
    )


def lowpass(
    signal: list,
    cutoff: float,
    fs: float,
    order: int = 5,
) -> dict:
    """Butterworth 低通滤波

    Args:
        signal: 输入信号列表
        cutoff: 截止频率（Hz）
        fs: 采样频率（Hz）
        order: 滤波器阶数

    Returns:
        {"result": {"filtered", "cutoff_normalized"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    nyq = fs / 2.0
    normal_cutoff = cutoff / nyq
    sos = butter(order, normal_cutoff, btype="low", analog=False, output="sos")
    filtered = sosfilt(sos, arr)
    return _result(
        {
            "filtered": [round(float(v), 6) for v in filtered],
            "cutoff_normalized": round(normal_cutoff, 6),
        },
        "lowpass", time.perf_counter() - t0,
        cutoff=cutoff, fs=fs, order=order,
    )


def highpass(
    signal: list,
    cutoff: float,
    fs: float,
    order: int = 5,
) -> dict:
    """Butterworth 高通滤波

    Args:
        signal: 输入信号列表
        cutoff: 截止频率（Hz）
        fs: 采样频率（Hz）
        order: 滤波器阶数

    Returns:
        {"result": {"filtered", "cutoff_normalized"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    nyq = fs / 2.0
    normal_cutoff = cutoff / nyq
    sos = butter(order, normal_cutoff, btype="high", analog=False, output="sos")
    filtered = sosfilt(sos, arr)
    return _result(
        {
            "filtered": [round(float(v), 6) for v in filtered],
            "cutoff_normalized": round(normal_cutoff, 6),
        },
        "highpass", time.perf_counter() - t0,
        cutoff=cutoff, fs=fs, order=order,
    )


def bandpass(
    signal: list,
    lowcut: float,
    highcut: float,
    fs: float,
    order: int = 5,
) -> dict:
    """Butterworth 带通滤波

    Args:
        signal: 输入信号列表
        lowcut: 低截止频率（Hz）
        highcut: 高截止频率（Hz）
        fs: 采样频率（Hz）
        order: 滤波器阶数

    Returns:
        {"result": {"filtered"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    nyq = fs / 2.0
    low = lowcut / nyq
    high = highcut / nyq
    sos = butter(order, [low, high], btype="bandpass", analog=False, output="sos")
    filtered = sosfilt(sos, arr)
    return _result(
        {"filtered": [round(float(v), 6) for v in filtered]},
        "bandpass", time.perf_counter() - t0,
        lowcut=lowcut, highcut=highcut, fs=fs, order=order,
    )


def bandstop(
    signal: list,
    lowcut: float,
    highcut: float,
    fs: float,
    order: int = 5,
) -> dict:
    """Butterworth 带阻（陷波）滤波

    Args:
        signal: 输入信号列表
        lowcut: 阻带低截止频率（Hz）
        highcut: 阻带高截止频率（Hz）
        fs: 采样频率（Hz）
        order: 滤波器阶数

    Returns:
        {"result": {"filtered"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    nyq = fs / 2.0
    low = lowcut / nyq
    high = highcut / nyq
    sos = butter(order, [low, high], btype="bandstop", analog=False, output="sos")
    filtered = sosfilt(sos, arr)
    return _result(
        {"filtered": [round(float(v), 6) for v in filtered]},
        "bandstop", time.perf_counter() - t0,
        lowcut=lowcut, highcut=highcut, fs=fs, order=order,
    )
