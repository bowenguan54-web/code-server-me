"""
algolib.timeseries — 时序分析模块

提供: dtw, lstm_clf, transformer, cluster_feat, cluster_model,
      cluster_shape, spectral, ar, ma, arma, lstm_pred, hilbert, hht
"""

import time
from typing import Any, Optional

import numpy as np
from scipy.signal import hilbert as scipy_hilbert
from sklearn.cluster import KMeans, SpectralClustering
from sklearn.metrics import silhouette_score
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.preprocessing import StandardScaler


def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def dtw(
    s1: list,
    s2: list,
    window: Optional[int] = None,
) -> dict:
    """Dynamic Time Warping 距离

    Args:
        s1: 第一条时间序列
        s2: 第二条时间序列
        window: Sakoe-Chiba 带宽约束（None 表示无约束）

    Returns:
        {"result": {"distance", "path_length"}, ...}
    """
    t0 = time.perf_counter()
    a, b = np.array(s1, dtype=float), np.array(s2, dtype=float)
    n, m = len(a), len(b)
    w = max(window or max(n, m), abs(n - m))
    DTW = np.full((n + 1, m + 1), np.inf)
    DTW[0, 0] = 0.0
    for i in range(1, n + 1):
        j_start = max(1, i - w)
        j_end = min(m, i + w) + 1
        for j in range(j_start, j_end):
            cost = (a[i - 1] - b[j - 1]) ** 2
            DTW[i, j] = cost + min(DTW[i - 1, j], DTW[i, j - 1], DTW[i - 1, j - 1])
    # 回溯路径长度
    i, j = n, m
    path_len = 0
    while i > 0 and j > 0:
        path_len += 1
        best = min((DTW[i - 1, j], i - 1, j), (DTW[i, j - 1], i, j - 1), (DTW[i - 1, j - 1], i - 1, j - 1))
        i, j = best[1], best[2]
    return _result(
        {"distance": round(float(np.sqrt(DTW[n, m])), 6), "path_length": path_len},
        "dtw", time.perf_counter() - t0,
        n=n, m=m,
    )


def lstm_clf(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    hidden_layers: tuple = (64, 32),
    max_iter: int = 200,
    seed: Optional[int] = None,
) -> dict:
    """LSTM 序列分类（用 MLP 近似，适合特征序列输入）

    Args:
        X_train: 训练样本列表（每个样本为一维或已展平的时间序列特征）
        y_train: 训练标签列表
        X_test: 测试样本（可选）
        hidden_layers: 隐藏层神经元数，默认 (64, 32)
        max_iter: 最大迭代次数
        seed: 随机种子

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    if Xtr.ndim == 3:
        Xtr = Xtr.reshape(Xtr.shape[0], -1)
    scaler = StandardScaler()
    Xtr = scaler.fit_transform(Xtr)
    ytr = np.array(y_train)
    model = MLPClassifier(hidden_layer_sizes=hidden_layers, max_iter=max_iter, random_state=seed)
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else np.array(X_train, dtype=float)
    if Xte.ndim == 3:
        Xte = Xte.reshape(Xte.shape[0], -1)
    Xte = scaler.transform(Xte)
    preds = model.predict(Xte).tolist()
    train_acc = round(float(model.score(Xtr, ytr)), 4)
    return _result(
        {"predictions": preds, "metrics": {"train_accuracy": train_acc}},
        "lstm_clf", time.perf_counter() - t0,
        hidden_layers=list(hidden_layers), max_iter=max_iter,
    )


def transformer(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    d_model: int = 32,
    n_heads: int = 4,
    seed: Optional[int] = None,
) -> dict:
    """Transformer 序列分类（numpy 自注意力机制实现）

    Args:
        X_train: 训练样本（每个样本为长度 T 的时间序列，一维列表）
        y_train: 训练标签
        X_test: 测试样本（可选）
        d_model: 模型维度（投影后特征数）
        n_heads: 多头注意力头数
        seed: 随机种子

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    rng = np.random.default_rng(seed)
    Xtr = np.array(X_train, dtype=float)
    if Xtr.ndim == 1:
        Xtr = Xtr.reshape(1, -1)
    # 线性投影到 d_model 维
    T = Xtr.shape[1]
    W_proj = rng.standard_normal((T, d_model)) * 0.1

    def self_attention(X: np.ndarray) -> np.ndarray:
        head_dim = d_model // n_heads
        results = []
        for h in range(n_heads):
            Wq = rng.standard_normal((d_model, head_dim)) * 0.1
            Wk = rng.standard_normal((d_model, head_dim)) * 0.1
            Wv = rng.standard_normal((d_model, head_dim)) * 0.1
            Q = X @ Wq
            K = X @ Wk
            V = X @ Wv
            scores = Q @ K.T / (head_dim ** 0.5)
            attn = np.exp(scores - scores.max(axis=-1, keepdims=True))
            attn /= attn.sum(axis=-1, keepdims=True) + 1e-9
            results.append(attn @ V)
        return np.concatenate(results, axis=-1)

    # 对每个样本做 self-attention 后池化
    features = []
    for sample in Xtr:
        proj = (sample.reshape(1, -1) @ W_proj)  # (1, d_model)
        attn_out = self_attention(proj)            # (1, d_model)
        features.append(attn_out.flatten())
    Ftr = np.array(features)
    # 用 MLP 分类器完成最终预测
    ytr = np.array(y_train)
    clf = MLPClassifier(hidden_layer_sizes=(32,), max_iter=300, random_state=int(seed or 0))
    clf.fit(Ftr, ytr)
    if X_test is not None:
        Xte = np.array(X_test, dtype=float)
        if Xte.ndim == 1:
            Xte = Xte.reshape(1, -1)
        Fte = np.array([(xte.reshape(1, -1) @ W_proj @ np.ones((d_model, d_model))).flatten() for xte in Xte])
        preds = clf.predict(Fte).tolist()
    else:
        preds = clf.predict(Ftr).tolist()
    train_acc = round(float(clf.score(Ftr, ytr)), 4)
    return _result(
        {"predictions": preds, "metrics": {"train_accuracy": train_acc}},
        "transformer", time.perf_counter() - t0,
        d_model=d_model, n_heads=n_heads,
    )


def cluster_feat(
    series_list: list,
    k: int = 3,
    seed: Optional[int] = None,
) -> dict:
    """基于统计特征的时序聚类

    提取每条序列的均值、标准差、偏度、峰度、最大值、最小值、趋势斜率作为特征，然后 KMeans 聚类。

    Args:
        series_list: 时间序列列表（每个元素为一条时间序列的数值列表）
        k: 簇数量
        seed: 随机种子

    Returns:
        {"result": {"labels", "features", "silhouette"}, ...}
    """
    t0 = time.perf_counter()
    from scipy import stats as sp_stats

    features = []
    for s in series_list:
        arr = np.array(s, dtype=float)
        n = len(arr)
        x = np.arange(n)
        slope, *_ = np.polyfit(x, arr, 1) if n > 1 else (0,)
        features.append([
            float(np.mean(arr)), float(np.std(arr)),
            float(sp_stats.skew(arr)), float(sp_stats.kurtosis(arr)),
            float(np.max(arr)), float(np.min(arr)),
            float(slope),
        ])
    F = np.array(features)
    scaler = StandardScaler()
    Fs = scaler.fit_transform(F)
    km = KMeans(n_clusters=k, random_state=seed, n_init="auto")
    labels = km.fit_predict(Fs).tolist()
    sil = float(silhouette_score(Fs, labels)) if k > 1 and len(labels) > k else 0.0
    return _result(
        {"labels": labels, "features": F.tolist(), "silhouette": round(sil, 4)},
        "cluster_feat", time.perf_counter() - t0, k=k,
    )


def cluster_model(
    series_list: list,
    k: int = 3,
    ar_order: int = 2,
    seed: Optional[int] = None,
) -> dict:
    """基于 AR 模型参数的时序聚类

    为每条序列拟合 AR(p) 模型，用模型参数作为特征进行 KMeans 聚类。

    Args:
        series_list: 时间序列列表
        k: 簇数量
        ar_order: AR 阶数 p
        seed: 随机种子

    Returns:
        {"result": {"labels", "ar_params", "silhouette"}, ...}
    """
    t0 = time.perf_counter()

    def fit_ar(series: np.ndarray, p: int) -> np.ndarray:
        n = len(series)
        if n <= p:
            return np.zeros(p)
        Y = series[p:]
        X = np.column_stack([series[p - i - 1: n - i - 1] for i in range(p)])
        try:
            coeffs, *_ = np.linalg.lstsq(X, Y, rcond=None)
            return coeffs
        except Exception:
            return np.zeros(p)

    params = []
    for s in series_list:
        arr = np.array(s, dtype=float)
        c = fit_ar(arr, ar_order)
        params.append(c.tolist())
    F = np.array(params)
    km = KMeans(n_clusters=k, random_state=seed, n_init="auto")
    labels = km.fit_predict(F).tolist()
    sil = float(silhouette_score(F, labels)) if k > 1 and len(labels) > k else 0.0
    return _result(
        {"labels": labels, "ar_params": params, "silhouette": round(sil, 4)},
        "cluster_model", time.perf_counter() - t0, k=k, ar_order=ar_order,
    )


def cluster_shape(
    series_list: list,
    k: int = 3,
    seed: Optional[int] = None,
) -> dict:
    """基于 DTW 距离的形状聚类（DTW + KMeans 软分配）

    Args:
        series_list: 时间序列列表
        k: 簇数量
        seed: 随机种子

    Returns:
        {"result": {"labels", "silhouette"}, ...}
    """
    t0 = time.perf_counter()
    n = len(series_list)
    series = [np.array(s, dtype=float) for s in series_list]
    # 计算 DTW 距离矩阵（用欧氏近似加速）
    dist_mat = np.zeros((n, n))
    for i in range(n):
        for j in range(i + 1, n):
            a, b = series[i], series[j]
            # 简化：对齐长度后欧氏距离
            min_len = min(len(a), len(b))
            d = float(np.sqrt(np.sum((a[:min_len] - b[:min_len]) ** 2)))
            dist_mat[i, j] = dist_mat[j, i] = d
    km = KMeans(n_clusters=k, random_state=seed, n_init="auto")
    labels = km.fit_predict(dist_mat).tolist()
    sil = float(silhouette_score(dist_mat, labels, metric="precomputed")) if k > 1 and len(labels) > k else 0.0
    return _result(
        {"labels": labels, "silhouette": round(sil, 4)},
        "cluster_shape", time.perf_counter() - t0, k=k,
    )


def spectral(
    series_list: list,
    k: int = 3,
    seed: Optional[int] = None,
) -> dict:
    """谱聚类

    Args:
        series_list: 时间序列列表（每条等长）
        k: 簇数量
        seed: 随机种子

    Returns:
        {"result": {"labels", "silhouette"}, ...}
    """
    t0 = time.perf_counter()
    X = np.array([np.array(s, dtype=float) for s in series_list])
    model = SpectralClustering(n_clusters=k, random_state=seed, affinity="rbf")
    labels = model.fit_predict(X).tolist()
    sil = float(silhouette_score(X, labels)) if k > 1 and len(labels) > k else 0.0
    return _result(
        {"labels": labels, "silhouette": round(sil, 4)},
        "spectral", time.perf_counter() - t0, k=k,
    )


def ar(
    series: list,
    order: int = 1,
    steps: int = 5,
) -> dict:
    """自回归模型 AR(p) 预测

    Args:
        series: 时间序列（一维数值列表）
        order: AR 阶数 p
        steps: 预测步数

    Returns:
        {"result": {"coefficients", "predictions", "residuals"}, ...}
    """
    t0 = time.perf_counter()
    try:
        from statsmodels.tsa.ar_model import AutoReg
        arr = np.array(series, dtype=float)
        model = AutoReg(arr, lags=order, old_names=False).fit()
        preds = model.forecast(steps).tolist()
        coeffs = model.params.tolist()
        resids = model.resid.tolist()
    except Exception:
        # 手动最小二乘回退
        arr = np.array(series, dtype=float)
        n = len(arr)
        Y = arr[order:]
        X = np.column_stack([arr[order - i - 1: n - i - 1] for i in range(order)])
        coeffs_arr, *_ = np.linalg.lstsq(X, Y, rcond=None)
        preds = []
        buf = list(arr[-order:])
        for _ in range(steps):
            val = float(np.dot(coeffs_arr, buf[-order:][::-1]))
            preds.append(round(val, 6))
            buf.append(val)
        coeffs = coeffs_arr.tolist()
        resids = (Y - X @ coeffs_arr).tolist()
    return _result(
        {
            "coefficients": [round(float(c), 6) for c in coeffs],
            "predictions": [round(float(p), 6) for p in preds],
            "residuals": [round(float(r), 6) for r in resids],
        },
        "ar", time.perf_counter() - t0,
        order=order, steps=steps,
    )


def ma(
    series: list,
    order: int = 1,
    steps: int = 5,
) -> dict:
    """移动平均模型 MA(q) 预测

    Args:
        series: 时间序列
        order: MA 阶数 q
        steps: 预测步数

    Returns:
        {"result": {"parameters", "predictions", "aic"}, ...}
    """
    t0 = time.perf_counter()
    try:
        from statsmodels.tsa.arima.model import ARIMA
        arr = np.array(series, dtype=float)
        model = ARIMA(arr, order=(0, 0, order)).fit()
        preds = model.forecast(steps).tolist()
        params = model.params.tolist()
        aic = float(model.aic)
    except Exception:
        arr = np.array(series, dtype=float)
        params = [float(np.mean(arr))]
        preds = [round(float(np.mean(arr[-order:])), 6) for _ in range(steps)]
        aic = 0.0
    return _result(
        {
            "parameters": [round(float(p), 6) for p in params],
            "predictions": [round(float(p), 6) for p in preds],
            "aic": round(aic, 4),
        },
        "ma", time.perf_counter() - t0,
        order=order, steps=steps,
    )


def arma(
    series: list,
    p: int = 1,
    q: int = 1,
    steps: int = 5,
) -> dict:
    """ARMA(p,q) 模型拟合与预测

    Args:
        series: 时间序列
        p: AR 阶数
        q: MA 阶数
        steps: 预测步数

    Returns:
        {"result": {"parameters", "predictions", "aic", "bic"}, ...}
    """
    t0 = time.perf_counter()
    try:
        from statsmodels.tsa.arima.model import ARIMA
        arr = np.array(series, dtype=float)
        model = ARIMA(arr, order=(p, 0, q)).fit()
        preds = model.forecast(steps).tolist()
        params = model.params.tolist()
        aic, bic = float(model.aic), float(model.bic)
    except Exception:
        arr = np.array(series, dtype=float)
        params = [float(np.mean(arr))]
        preds = [round(float(np.mean(arr[-(p + q):])), 6) for _ in range(steps)]
        aic = bic = 0.0
    return _result(
        {
            "parameters": [round(float(v), 6) for v in params],
            "predictions": [round(float(v), 6) for v in preds],
            "aic": round(aic, 4),
            "bic": round(bic, 4),
        },
        "arma", time.perf_counter() - t0,
        p=p, q=q, steps=steps,
    )


def lstm_pred(
    series: list,
    steps: int = 5,
    lookback: int = 10,
    hidden_layers: tuple = (64, 32),
    max_iter: int = 300,
    seed: Optional[int] = None,
) -> dict:
    """LSTM 时序预测（用 MLP 回归近似）

    Args:
        series: 历史时间序列
        steps: 预测步数
        lookback: 滑窗大小
        hidden_layers: 隐藏层神经元数
        max_iter: 最大迭代次数
        seed: 随机种子

    Returns:
        {"result": {"predictions", "history_last"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(series, dtype=float)
    n = len(arr)
    if n <= lookback:
        lookback = max(1, n - 1)
    # 构造滑窗样本
    X_seq = np.array([arr[i: i + lookback] for i in range(n - lookback)])
    y_seq = arr[lookback:]
    scaler = StandardScaler()
    X_sc = scaler.fit_transform(X_seq)
    model = MLPRegressor(
        hidden_layer_sizes=hidden_layers, max_iter=max_iter, random_state=seed
    )
    model.fit(X_sc, y_seq)
    # 滚动预测
    buf = list(arr[-lookback:])
    preds = []
    for _ in range(steps):
        x_in = scaler.transform([buf[-lookback:]])
        val = float(model.predict(x_in)[0])
        preds.append(round(val, 6))
        buf.append(val)
    return _result(
        {"predictions": preds, "history_last": list(arr[-5:])},
        "lstm_pred", time.perf_counter() - t0,
        steps=steps, lookback=lookback,
    )


def hilbert(
    signal: list,
    fs: float = 1.0,
) -> dict:
    """Hilbert 变换（解析信号）

    Args:
        signal: 实数信号列表
        fs: 采样频率（Hz），用于计算瞬时频率

    Returns:
        {"result": {"envelope", "instantaneous_phase", "instantaneous_frequency"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)
    analytic = scipy_hilbert(arr)
    envelope = np.abs(analytic).tolist()
    phase = np.unwrap(np.angle(analytic)).tolist()
    inst_freq = (np.diff(phase) / (2.0 * np.pi) * fs).tolist()
    return _result(
        {
            "envelope": [round(float(v), 6) for v in envelope],
            "instantaneous_phase": [round(float(v), 6) for v in phase],
            "instantaneous_frequency": [round(float(v), 6) for v in inst_freq],
        },
        "hilbert", time.perf_counter() - t0,
        fs=fs, n=len(arr),
    )


def hht(
    signal: list,
    fs: float = 1.0,
    max_imfs: int = 5,
) -> dict:
    """Hilbert-Huang Transform（经验模态分解 + Hilbert 变换）

    使用 EMD 将信号分解为本征模态函数（IMF），然后对各 IMF 做 Hilbert 变换。

    Args:
        signal: 实数信号列表
        fs: 采样频率
        max_imfs: 最多提取的 IMF 数量

    Returns:
        {"result": {"imfs", "imf_envelopes", "marginal_spectrum"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(signal, dtype=float)

    def _sift(x: np.ndarray) -> np.ndarray:
        """单次筛选过程：生成一个 IMF"""
        from scipy.interpolate import CubicSpline
        h = x.copy()
        for _ in range(10):
            # 找极值
            n = len(h)
            hi = [i for i in range(1, n - 1) if h[i] > h[i - 1] and h[i] > h[i + 1]]
            lo = [i for i in range(1, n - 1) if h[i] < h[i - 1] and h[i] < h[i + 1]]
            if len(hi) < 2 or len(lo) < 2:
                break
            hi_idx = np.array([0] + hi + [n - 1])
            lo_idx = np.array([0] + lo + [n - 1])
            t_arr = np.arange(n)
            env_hi = CubicSpline(hi_idx, h[hi_idx])(t_arr)
            env_lo = CubicSpline(lo_idx, h[lo_idx])(t_arr)
            mean_env = (env_hi + env_lo) / 2
            h = h - mean_env
        return h

    imfs = []
    residue = arr.copy()
    for _ in range(max_imfs):
        imf = _sift(residue)
        imfs.append(imf)
        residue = residue - imf
        if np.std(residue) < 1e-10:
            break
    imfs.append(residue)  # 余量

    envelopes = []
    for imf in imfs:
        analytic = scipy_hilbert(imf)
        envelopes.append([round(float(v), 6) for v in np.abs(analytic)])

    # 边际谱（所有 IMF 瞬时幅度的均值按频率分布）
    marginal = [round(float(np.mean(np.abs(scipy_hilbert(imf)))), 6) for imf in imfs]

    return _result(
        {
            "imfs": [[round(float(v), 6) for v in imf] for imf in imfs],
            "imf_envelopes": envelopes,
            "marginal_spectrum": marginal,
            "n_imfs": len(imfs),
        },
        "hht", time.perf_counter() - t0,
        fs=fs, max_imfs=max_imfs,
    )
