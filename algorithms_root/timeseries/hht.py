"""
timeseries — 时序分析算法组件

包含: dtw, lstm_clf, transformer, cluster_feat, cluster_model,
      cluster_shape, spectral, ar, ma, arma, lstm_pred, hilbert, hht
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))
from algo_service.sdk.decorators import algo_meta
from examples.algolib.timeseries import (
    dtw as _dtw,
    lstm_clf as _lstm_clf,
    transformer as _transformer,
    cluster_feat as _cluster_feat,
    cluster_model as _cluster_model,
    cluster_shape as _cluster_shape,
    spectral as _spectral,
    ar as _ar,
    ma as _ma,
    arma as _arma,
    lstm_pred as _lstm_pred,
    hilbert as _hilbert,
    hht as _hht,
)


def hht(signal: list, fs: float = 1.0, n_imfs: int = 5) -> dict:
    """zh_name: 希尔伯特-黄变换（HHT）
    zh_desc: 基于 EMD 和 Hilbert 谱分析的时频分析方法
    tags: 时频分析, 时序, HHT, EMD"""
    return _hht(signal, fs, n_imfs)
