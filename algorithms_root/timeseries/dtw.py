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


def dtw(s1: list, s2: list, window: int = None) -> dict:
    """zh_name: 动态时间规整
    zh_desc: 计算两条时间序列之间的 DTW 距离，支持 Sakoe-Chiba 带宽约束
    tags: 相似度, 时序, DTW"""
    return _dtw(s1, s2, window)
