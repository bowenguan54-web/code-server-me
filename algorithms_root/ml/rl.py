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


def rl(n_states: int, n_actions: int, episodes: int = 100,
       alpha: float = 0.1, gamma: float = 0.9, epsilon: float = 0.1, seed: int = 42) -> dict:
    """zh_name: 强化学习（Q-Learning）
    zh_desc: 使用表格型 Q-Learning 进行强化学习，适合离散状态/动作空间
    tags: 强化学习, Q-Learning"""
    return _rl(n_states, n_actions, episodes, alpha, gamma, epsilon, seed)
