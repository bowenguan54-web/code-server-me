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


def gmm(X: list, n_components: int = 3, covariance_type: str = "full", seed: int = 42) -> dict:
    """zh_name: 高斯混合模型
    zh_desc: 使用 GMM 进行软聚类，输出簇标签和各分量参数
    tags: 聚类, 无监督学习, 概率模型"""
    return _gmm(X, n_components, covariance_type, seed)
