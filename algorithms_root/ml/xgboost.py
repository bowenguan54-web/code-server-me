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


def xgboost(X_train: list, y_train: list, X_test: list = None,
            n_estimators: int = 100, max_depth: int = 3,
            learning_rate: float = 0.1, seed: int = 42) -> dict:
    """zh_name: XGBoost
    zh_desc: 使用 XGBoost 进行梯度提升分类，支持交叉验证和特征重要性
    tags: 分类, 集成学习, 梯度提升"""
    return _xgboost(X_train, y_train, X_test, n_estimators, max_depth, learning_rate, seed)
