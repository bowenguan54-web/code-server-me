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


@algo_meta(
    zh_name="Scikit-learn Pipeline",
    zh_description="构建 sklearn Pipeline，组合预处理（StandardScaler）与分类器（SVM/RF/LR）",
    zh_tags=["多框架", "Scikit-learn", "Pipeline", "分类"],
    version="1.0.0",
)
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


@algo_meta(
    zh_name="OpenCV 图像预处理",
    zh_description="使用 OpenCV 对像素矩阵进行灰度化、高斯模糊、Canny 边缘检测等处理",
    zh_tags=["多框架", "OpenCV", "图像处理", "计算机视觉"],
    version="1.0.0",
)
def opencv_preprocess(
    image_data: list,
    operations: list = None,
) -> dict:
    """zh_name: OpenCV 图像预处理
    zh_desc: 使用 OpenCV 对像素矩阵进行灰度化、模糊、边缘检测
    tags: 多框架, OpenCV, 图像处理, 计算机视觉"""
    t0 = time.perf_counter()
    try:
        import cv2
        import numpy as np

        img = np.array(image_data, dtype=np.uint8)
        ops = operations or ["gray", "blur"]
        applied = []
        for op in ops:
            if op == "gray" and img.ndim == 3:
                img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                applied.append("gray")
            elif op == "blur":
                img = cv2.GaussianBlur(img, (5, 5), 0)
                applied.append("blur")
            elif op == "canny":
                img = cv2.Canny(img, 100, 200)
                applied.append("canny")
            elif op == "threshold":
                _, img = cv2.threshold(img, 127, 255, cv2.THRESH_BINARY)
                applied.append("threshold")
        result = {
            "framework": "opencv",
            "operations_applied": applied,
            "output_shape": list(img.shape),
            "output": img.tolist(),
        }
    except ImportError:
        result = {
            "framework": "opencv",
            "status": "opencv-python not installed, returning stub",
            "operations_applied": [],
            "output": [],
        }
    return _result(result, "opencv_preprocess", time.perf_counter() - t0,
                   operations=operations or ["gray", "blur"])


@algo_meta(
    zh_name="MXNet 前馈网络",
    zh_description="使用 Apache MXNet / Gluon 构建前馈网络并训练（需要 mxnet 包）",
    zh_tags=["多框架", "MXNet", "Gluon", "深度学习"],
    version="1.0.0",
)
def mxnet_mlp(
    X_train: list,
    y_train: list,
    X_test: list = None,
    hidden_units: list = None,
    epochs: int = 10,
    lr: float = 0.01,
    seed: int = None,
) -> dict:
    """zh_name: MXNet 前馈网络
    zh_desc: 使用 Apache MXNet/Gluon 构建前馈神经网络（需要安装 mxnet 包）
    tags: 多框架, MXNet, Gluon, 深度学习"""
    t0 = time.perf_counter()
    try:
        import mxnet as mx
        from mxnet import gluon, autograd
        import numpy as np

        if seed is not None:
            mx.random.seed(seed)

        units = hidden_units or [64, 32]
        X = np.array(X_train, dtype=float)
        y = np.array(y_train)
        n_classes = len(set(y.tolist()))

        net = gluon.nn.Sequential()
        with net.name_scope():
            for u in units:
                net.add(gluon.nn.Dense(u, activation="relu"))
            net.add(gluon.nn.Dense(n_classes))

        net.initialize(mx.init.Xavier())
        trainer = gluon.Trainer(net.collect_params(), "adam", {"learning_rate": lr})
        loss_fn = gluon.loss.SoftmaxCrossEntropyLoss()

        X_mx = mx.nd.array(X)
        y_mx = mx.nd.array(y)
        for _ in range(epochs):
            with autograd.record():
                out = net(X_mx)
                loss = loss_fn(out, y_mx)
            loss.backward()
            trainer.step(len(X))

        predictions = net(mx.nd.array(X_test)).argmax(axis=1).asnumpy().tolist() if X_test else []
        result = {
            "framework": "mxnet",
            "final_loss": round(float(loss.mean().asscalar()), 6),
            "epochs": epochs,
            "predictions": predictions,
        }
    except ImportError:
        result = {
            "framework": "mxnet",
            "status": "mxnet not installed, returning stub",
            "predictions": [],
        }
    return _result(result, "mxnet_mlp", time.perf_counter() - t0, epochs=epochs, lr=lr)


@algo_meta(
    zh_name="框架版本查询",
    zh_description="检测当前环境中已安装的机器学习框架及其版本信息",
    zh_tags=["多框架", "环境检测", "版本"],
    version="1.0.0",
)
def framework_info() -> dict:
    """zh_name: 框架版本查询
    zh_desc: 检测已安装的 sklearn/torch/tensorflow/cv2/mxnet/xgboost/lightgbm 版本
    tags: 多框架, 环境检测, 版本"""
    t0 = time.perf_counter()
    frameworks = {}
    for name, module in [
        ("scikit-learn", "sklearn"),
        ("pytorch", "torch"),
        ("tensorflow", "tensorflow"),
        ("opencv", "cv2"),
        ("mxnet", "mxnet"),
        ("xgboost", "xgboost"),
        ("lightgbm", "lightgbm"),
        ("numpy", "numpy"),
        ("scipy", "scipy"),
        ("pandas", "pandas"),
    ]:
        try:
            import importlib
            mod = importlib.import_module(module)
            frameworks[name] = getattr(mod, "__version__", "installed")
        except ImportError:
            frameworks[name] = "not installed"
    return _result(frameworks, "framework_info", time.perf_counter() - t0)
