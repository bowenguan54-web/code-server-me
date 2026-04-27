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


def lstm_clf(X_train: list, y_train: list, X_test: list = None,
             hidden_layers: tuple = (64, 32), max_iter: int = 200, seed: int = None) -> dict:
    """zh_name: LSTM 序列分类
    zh_desc: 基于 MLP 近似的 LSTM 序列分类，适合展平的时间序列特征输入
    tags: 分类, 时序, 深度学习"""
    return _lstm_clf(X_train, y_train, X_test, hidden_layers, max_iter, seed)
