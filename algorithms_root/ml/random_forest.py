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


def random_forest(X_train: list, y_train: list, X_test: list = None,
                  n_estimators: int = 100, max_depth: int = None, seed: int = 42) -> dict:
    """zh_name: 随机森林
    zh_desc: 使用随机森林集成算法进行分类，输出特征重要性
    tags: 分类, 集成学习, 监督学习"""
    return _random_forest(X_train, y_train, X_test, n_estimators, max_depth, seed)
