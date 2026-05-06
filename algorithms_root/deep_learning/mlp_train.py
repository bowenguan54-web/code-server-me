"""
deep_learning — 深度学习算法组件

支持 TensorFlow、MXNet、XGBoost、LightGBM 等主流深度学习框架。
包含: xgboost_train, lgbm_train, mlp_train, cnn_train, rnn_train
"""
from __future__ import annotations
import time
from typing import Any
from algo_service.sdk.decorators import algo_meta
def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def mlp_train(
    X_train: list,
    y_train: list,
    X_test: list = None,
    hidden_layer_sizes: list = None,
    activation: str = "relu",
    max_iter: int = 200,
    seed: int = None,
) -> dict:
    """zh_name: 多层感知机（MLP）
    zh_desc: scikit-learn MLP 多层感知机分类，支持自定义隐藏层结构和激活函数
    tags: 深度学习, MLP, 神经网络, 分类"""
    t0 = time.perf_counter()
    from sklearn.neural_network import MLPClassifier
    import numpy as np

    layers = tuple(hidden_layer_sizes) if hidden_layer_sizes else (128, 64)
    clf = MLPClassifier(
        hidden_layer_sizes=layers,
        activation=activation,
        max_iter=max_iter,
        random_state=seed,
    )
    clf.fit(np.array(X_train), np.array(y_train))
    predictions = clf.predict(np.array(X_test)).tolist() if X_test else []
    result = {
        "framework": "sklearn",
        "model": "MLPClassifier",
        "hidden_layer_sizes": list(layers),
        "n_iter": clf.n_iter_,
        "loss": round(float(clf.loss_), 6),
        "predictions": predictions,
    }
    return _result(result, "mlp_train", time.perf_counter() - t0,
                   hidden_layers=list(layers), activation=activation)
