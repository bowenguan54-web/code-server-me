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
