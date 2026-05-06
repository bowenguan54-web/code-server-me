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


def dtree(X_train: list, y_train: list, X_test: list = None,
          criterion: str = "gini", max_depth: int = None) -> dict:
    """zh_name: 决策树
    zh_desc: 使用决策树进行分类，支持 gini/entropy 准则
    tags: 分类, 监督学习, 可解释"""
    return _dtree(X_train, y_train, X_test, criterion, max_depth)
