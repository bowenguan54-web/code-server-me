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


def naive_bayes(X_train: list, y_train: list, X_test: list = None) -> dict:
    """zh_name: 朴素贝叶斯
    zh_desc: 使用高斯朴素贝叶斯进行分类，适合连续数值特征
    tags: 分类, 监督学习, 贝叶斯"""
    return _naive_bayes(X_train, y_train, X_test)
