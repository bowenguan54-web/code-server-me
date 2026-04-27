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


def logistic(X_train: list, y_train: list, X_test: list = None,
             C: float = 1.0, max_iter: int = 200) -> dict:
    """zh_name: 逻辑回归
    zh_desc: 使用逻辑回归进行二分类或多分类，输出概率和系数
    tags: 分类, 监督学习, 线性模型"""
    return _logistic(X_train, y_train, X_test, C, max_iter)
