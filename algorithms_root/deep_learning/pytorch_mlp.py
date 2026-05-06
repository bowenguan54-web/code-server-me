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
