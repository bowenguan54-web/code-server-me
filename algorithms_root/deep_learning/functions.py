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


@algo_meta(
    zh_name="XGBoost 训练",
    zh_description="使用 XGBoost 进行梯度提升树训练，支持分类与回归任务",
    zh_tags=["深度学习", "XGBoost", "梯度提升", "集成学习"],
    version="1.0.0",
)
def xgboost_train(
    X_train: list,
    y_train: list,
    X_test: list = None,
    task: str = "classify",
    n_estimators: int = 100,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    seed: int = None,
) -> dict:
    """zh_name: XGBoost 训练
    zh_desc: 使用 XGBoost 梯度提升树进行分类或回归，支持特征重要性输出
    tags: 深度学习, XGBoost, 梯度提升, 集成学习"""
    t0 = time.perf_counter()
    try:
        import xgboost as xgb
        import numpy as np

        params = {
            "n_estimators": n_estimators,
            "max_depth": max_depth,
            "learning_rate": learning_rate,
            "random_state": seed,
            "eval_metric": "logloss" if task == "classify" else "rmse",
        }
        if task == "classify":
            model = xgb.XGBClassifier(**params, use_label_encoder=False)
        else:
            model = xgb.XGBRegressor(**params)

        model.fit(np.array(X_train), np.array(y_train))
        importance = model.feature_importances_.tolist()
        predictions = model.predict(np.array(X_test)).tolist() if X_test else []
        result = {
            "framework": "xgboost",
            "task": task,
            "feature_importance": importance,
            "predictions": predictions,
            "n_features": len(importance),
        }
    except ImportError:
        # Stub when xgboost not installed
        result = {
            "framework": "xgboost",
            "task": task,
            "status": "xgboost not installed, returning stub",
            "predictions": [],
        }
    return _result(result, "xgboost_train", time.perf_counter() - t0,
                   n_estimators=n_estimators, max_depth=max_depth)


@algo_meta(
    zh_name="LightGBM 训练",
    zh_description="使用 LightGBM 进行高效梯度提升训练，速度优于 XGBoost",
    zh_tags=["深度学习", "LightGBM", "梯度提升", "集成学习"],
    version="1.0.0",
)
def lgbm_train(
    X_train: list,
    y_train: list,
    X_test: list = None,
    task: str = "classify",
    n_estimators: int = 100,
    num_leaves: int = 31,
    learning_rate: float = 0.1,
    seed: int = None,
) -> dict:
    """zh_name: LightGBM 训练
    zh_desc: LightGBM 高效梯度提升，适合大规模数据集，输出特征重要性
    tags: 深度学习, LightGBM, 梯度提升, 集成学习"""
    t0 = time.perf_counter()
    try:
        import lightgbm as lgb
        import numpy as np

        params = {
            "n_estimators": n_estimators,
            "num_leaves": num_leaves,
            "learning_rate": learning_rate,
            "random_state": seed,
        }
        if task == "classify":
            model = lgb.LGBMClassifier(**params)
        else:
            model = lgb.LGBMRegressor(**params)

        model.fit(np.array(X_train), np.array(y_train))
        importance = model.feature_importances_.tolist()
        predictions = model.predict(np.array(X_test)).tolist() if X_test else []
        result = {
            "framework": "lightgbm",
            "task": task,
            "feature_importance": importance,
            "predictions": predictions,
            "n_features": len(importance),
        }
    except ImportError:
        result = {
            "framework": "lightgbm",
            "task": task,
            "status": "lightgbm not installed, returning stub",
            "predictions": [],
        }
    return _result(result, "lgbm_train", time.perf_counter() - t0,
                   n_estimators=n_estimators, num_leaves=num_leaves)


@algo_meta(
    zh_name="多层感知机（MLP）",
    zh_description="使用 scikit-learn MLPClassifier 构建多层感知机神经网络",
    zh_tags=["深度学习", "MLP", "神经网络", "分类"],
    version="1.0.0",
)
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


@algo_meta(
    zh_name="TensorFlow 模型构建",
    zh_description="基于 TensorFlow/Keras 构建并训练一个前馈神经网络（需要 TensorFlow 2.x）",
    zh_tags=["深度学习", "TensorFlow", "Keras", "神经网络"],
    version="1.0.0",
)
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


@algo_meta(
    zh_name="PyTorch 前馈网络",
    zh_description="基于 PyTorch 构建并训练一个前馈神经网络分类器",
    zh_tags=["深度学习", "PyTorch", "神经网络", "分类"],
    version="1.0.0",
)
def pytorch_mlp(
    X_train: list,
    y_train: list,
    X_test: list = None,
    hidden_units: list = None,
    epochs: int = 20,
    lr: float = 0.001,
    seed: int = None,
) -> dict:
    """zh_name: PyTorch 前馈网络
    zh_desc: 使用 PyTorch 构建前馈神经网络分类器，支持自定义结构和学习率
    tags: 深度学习, PyTorch, 神经网络, 分类"""
    t0 = time.perf_counter()
    try:
        import torch
        import torch.nn as nn
        import numpy as np

        if seed is not None:
            torch.manual_seed(seed)

        units = hidden_units or [64, 32]
        X = torch.tensor(X_train, dtype=torch.float32)
        y = torch.tensor(y_train, dtype=torch.long)
        in_features = X.shape[1]
        n_classes = int(y.max().item()) + 1

        layers = []
        prev = in_features
        for u in units:
            layers += [nn.Linear(prev, u), nn.ReLU()]
            prev = u
        layers.append(nn.Linear(prev, n_classes))
        model = nn.Sequential(*layers)

        optimizer = torch.optim.Adam(model.parameters(), lr=lr)
        criterion = nn.CrossEntropyLoss()
        for _ in range(epochs):
            optimizer.zero_grad()
            out = model(X)
            loss = criterion(out, y)
            loss.backward()
            optimizer.step()

        with torch.no_grad():
            predictions = model(torch.tensor(X_test, dtype=torch.float32)).argmax(dim=1).tolist() if X_test else []

        result = {
            "framework": "pytorch",
            "final_loss": round(float(loss.item()), 6),
            "epochs": epochs,
            "lr": lr,
            "predictions": predictions,
        }
    except ImportError:
        result = {
            "framework": "pytorch",
            "status": "pytorch not installed, returning stub",
            "predictions": [],
        }
    return _result(result, "pytorch_mlp", time.perf_counter() - t0, epochs=epochs, lr=lr)
