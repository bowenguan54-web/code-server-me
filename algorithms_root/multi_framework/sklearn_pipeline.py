"""
multi_framework — 多算法框架组件

集成 Scikit-learn、PyTorch、TensorFlow、OpenCV、MXNet、XGBoost 等主流框架。
包含: sklearn_pipeline, opencv_preprocess, mxnet_mlp, framework_info
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


def sklearn_pipeline(
    X_train: list,
    y_train: list,
    X_test: list = None,
    model: str = "svm",
    scale: bool = True,
    seed: int = None,
) -> dict:
    """zh_name: Scikit-learn Pipeline
    zh_desc: 构建 sklearn Pipeline（StandardScaler + 分类器），支持 svm/rf/lr
    tags: 多框架, Scikit-learn, Pipeline, 分类"""
    t0 = time.perf_counter()
    import numpy as np
    from sklearn.pipeline import Pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.svm import SVC
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.linear_model import LogisticRegression

    classifiers = {
        "svm": SVC(probability=True, random_state=seed),
        "rf": RandomForestClassifier(n_estimators=100, random_state=seed),
        "lr": LogisticRegression(max_iter=1000, random_state=seed),
    }
    steps = []
    if scale:
        steps.append(("scaler", StandardScaler()))
    steps.append(("clf", classifiers.get(model, classifiers["svm"])))
    pipe = Pipeline(steps)
    pipe.fit(np.array(X_train), np.array(y_train))
    predictions = pipe.predict(np.array(X_test)).tolist() if X_test else []
    score = float(pipe.score(np.array(X_train), np.array(y_train)))
    result = {
        "framework": "scikit-learn",
        "pipeline": [s[0] for s in steps],
        "model": model,
        "train_accuracy": round(score, 4),
        "predictions": predictions,
    }
    return _result(result, "sklearn_pipeline", time.perf_counter() - t0, model=model)
