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


def tensorflow_mlp(
    X_train: list,
    y_train: list,
    X_test: list = None,
    hidden_units: list = None,
    epochs: int = 10,
    batch_size: int = 32,
    seed: int = None,
) -> dict:
    """zh_name: TensorFlow 模型构建
    zh_desc: 使用 TensorFlow/Keras 构建前馈神经网络，支持自定义层数和 epochs
    tags: 深度学习, TensorFlow, Keras, 神经网络"""
    t0 = time.perf_counter()
    try:
        import tensorflow as tf
        import numpy as np

        if seed is not None:
            tf.random.set_seed(seed)

        units = hidden_units or [64, 32]
        X = np.array(X_train, dtype=float)
        y = np.array(y_train)

        n_classes = len(set(y.tolist()))
        model = tf.keras.Sequential()
        model.add(tf.keras.layers.Input(shape=(X.shape[1],)))
        for u in units:
            model.add(tf.keras.layers.Dense(u, activation="relu"))
        if n_classes == 2:
            model.add(tf.keras.layers.Dense(1, activation="sigmoid"))
            model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy"])
        else:
            model.add(tf.keras.layers.Dense(n_classes, activation="softmax"))
            model.compile(optimizer="adam", loss="sparse_categorical_crossentropy", metrics=["accuracy"])

        history = model.fit(X, y, epochs=epochs, batch_size=batch_size, verbose=0)
        predictions = model.predict(np.array(X_test)).tolist() if X_test else []
        result = {
            "framework": "tensorflow",
            "final_loss": round(float(history.history["loss"][-1]), 6),
            "final_accuracy": round(float(history.history["accuracy"][-1]), 6),
            "epochs": epochs,
            "predictions": predictions,
        }
    except ImportError:
        result = {
            "framework": "tensorflow",
            "status": "tensorflow not installed, returning stub",
            "predictions": [],
        }
    return _result(result, "tensorflow_mlp", time.perf_counter() - t0, epochs=epochs)
