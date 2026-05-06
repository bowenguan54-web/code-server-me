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
