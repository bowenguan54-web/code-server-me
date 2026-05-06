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


def lstm_pred(series: list, window: int = 5, steps: int = 3,
              hidden_layers: tuple = (32, 16), max_iter: int = 300, seed: int = None) -> dict:
    """zh_name: LSTM 时序预测
    zh_desc: 基于 MLP 滑动窗口的时序预测，适合单变量时间序列外推
    tags: 预测, 时序, 深度学习"""
    return _lstm_pred(series, window, steps, hidden_layers, max_iter, seed)
