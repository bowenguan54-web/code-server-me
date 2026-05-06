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
