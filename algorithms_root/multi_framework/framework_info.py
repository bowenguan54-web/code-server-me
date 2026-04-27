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
