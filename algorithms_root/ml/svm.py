"""
ml — 机器学习算法组件

包含: svm, knn, dtree, naive_bayes, random_forest, logistic, linear,
      kmeans, gmm, rl, xgboost, lgbm
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))
from algo_service.sdk.decorators import algo_meta
from examples.algolib.ml import (
    svm as _svm,
    knn as _knn,
    dtree as _dtree,
    naive_bayes as _naive_bayes,
    random_forest as _random_forest,
    logistic as _logistic,
    linear as _linear,
    kmeans as _kmeans,
    gmm as _gmm,
    rl as _rl,
    xgboost as _xgboost,
    lgbm as _lgbm,
)


def svm(X_train: list, y_train: list, X_test: list = None, task: str = "classify",
        kernel: str = "rbf", C: float = 1.0, gamma: str = "scale") -> dict:
    """zh_name: 支持向量机
    zh_desc: 使用支持向量机进行分类或回归，支持 rbf/linear/poly/sigmoid 核函数
    tags: 分类, 回归, 监督学习"""
    return _svm(X_train, y_train, X_test, task, kernel, C, gamma)
