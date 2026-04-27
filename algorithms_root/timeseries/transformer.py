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


def transformer(X_train: list, y_train: list, X_test: list = None,
                d_model: int = 32, n_heads: int = 4, seed: int = None) -> dict:
    """zh_name: Transformer 序列分类
    zh_desc: 基于自注意力机制的 Transformer 时序分类（numpy 实现）
    tags: 分类, 时序, Transformer, 注意力机制"""
    return _transformer(X_train, y_train, X_test, d_model, n_heads, seed)
