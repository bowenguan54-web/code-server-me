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


@algo_meta(
    zh_name="支持向量机",
    zh_description="使用支持向量机进行分类或回归，支持多种核函数（rbf/linear/poly/sigmoid）",
    zh_tags=["分类", "回归", "监督学习"],
    version="1.0.0",
)
def svm(X_train: list, y_train: list, X_test: list = None, task: str = "classify",
        kernel: str = "rbf", C: float = 1.0, gamma: str = "scale") -> dict:
    """zh_name: 支持向量机
    zh_desc: 使用支持向量机进行分类或回归，支持 rbf/linear/poly/sigmoid 核函数
    tags: 分类, 回归, 监督学习"""
    return _svm(X_train, y_train, X_test, task, kernel, C, gamma)


@algo_meta(
    zh_name="K 近邻",
    zh_description="使用 K 近邻算法进行分类，基于距离投票",
    zh_tags=["分类", "监督学习"],
    version="1.0.0",
)
def knn(X_train: list, y_train: list, X_test: list = None, k: int = 5) -> dict:
    """zh_name: K 近邻
    zh_desc: 使用 K 近邻算法进行分类，基于距离投票
    tags: 分类, 监督学习"""
    return _knn(X_train, y_train, X_test, k)


@algo_meta(
    zh_name="决策树",
    zh_description="使用决策树进行分类，支持 gini/entropy 准则和最大深度控制",
    zh_tags=["分类", "监督学习", "可解释"],
    version="1.0.0",
)
def dtree(X_train: list, y_train: list, X_test: list = None,
          criterion: str = "gini", max_depth: int = None) -> dict:
    """zh_name: 决策树
    zh_desc: 使用决策树进行分类，支持 gini/entropy 准则
    tags: 分类, 监督学习, 可解释"""
    return _dtree(X_train, y_train, X_test, criterion, max_depth)


@algo_meta(
    zh_name="朴素贝叶斯",
    zh_description="使用高斯朴素贝叶斯进行分类，适合连续数值特征",
    zh_tags=["分类", "监督学习", "贝叶斯"],
    version="1.0.0",
)
def naive_bayes(X_train: list, y_train: list, X_test: list = None) -> dict:
    """zh_name: 朴素贝叶斯
    zh_desc: 使用高斯朴素贝叶斯进行分类，适合连续数值特征
    tags: 分类, 监督学习, 贝叶斯"""
    return _naive_bayes(X_train, y_train, X_test)


@algo_meta(
    zh_name="随机森林",
    zh_description="使用随机森林集成算法进行分类，输出特征重要性",
    zh_tags=["分类", "集成学习", "监督学习"],
    version="1.0.0",
)
def random_forest(X_train: list, y_train: list, X_test: list = None,
                  n_estimators: int = 100, max_depth: int = None, seed: int = 42) -> dict:
    """zh_name: 随机森林
    zh_desc: 使用随机森林集成算法进行分类，输出特征重要性
    tags: 分类, 集成学习, 监督学习"""
    return _random_forest(X_train, y_train, X_test, n_estimators, max_depth, seed)


@algo_meta(
    zh_name="逻辑回归",
    zh_description="使用逻辑回归进行二分类或多分类，输出概率和系数",
    zh_tags=["分类", "监督学习", "线性模型"],
    version="1.0.0",
)
def logistic(X_train: list, y_train: list, X_test: list = None,
             C: float = 1.0, max_iter: int = 200) -> dict:
    """zh_name: 逻辑回归
    zh_desc: 使用逻辑回归进行二分类或多分类，输出概率和系数
    tags: 分类, 监督学习, 线性模型"""
    return _logistic(X_train, y_train, X_test, C, max_iter)


@algo_meta(
    zh_name="线性回归",
    zh_description="使用最小二乘法进行线性回归，输出系数、R² 等指标",
    zh_tags=["回归", "监督学习", "线性模型"],
    version="1.0.0",
)
def linear(X_train: list, y_train: list, X_test: list = None) -> dict:
    """zh_name: 线性回归
    zh_desc: 使用最小二乘法进行线性回归，输出系数、R² 等指标
    tags: 回归, 监督学习, 线性模型"""
    return _linear(X_train, y_train, X_test)


@algo_meta(
    zh_name="K-Means 聚类",
    zh_description="使用 K-Means 算法对数据进行无监督聚类，输出簇标签和轮廓系数",
    zh_tags=["聚类", "无监督学习"],
    version="1.0.0",
)
def kmeans(X: list, k: int = 3, max_iter: int = 300, seed: int = 42) -> dict:
    """zh_name: K-Means 聚类
    zh_desc: 使用 K-Means 算法对数据进行无监督聚类，输出簇标签和轮廓系数
    tags: 聚类, 无监督学习"""
    return _kmeans(X, k, max_iter, seed)


@algo_meta(
    zh_name="高斯混合模型",
    zh_description="使用高斯混合模型（GMM）进行软聚类，输出簇标签和各分量参数",
    zh_tags=["聚类", "无监督学习", "概率模型"],
    version="1.0.0",
)
def gmm(X: list, n_components: int = 3, covariance_type: str = "full", seed: int = 42) -> dict:
    """zh_name: 高斯混合模型
    zh_desc: 使用 GMM 进行软聚类，输出簇标签和各分量参数
    tags: 聚类, 无监督学习, 概率模型"""
    return _gmm(X, n_components, covariance_type, seed)


@algo_meta(
    zh_name="强化学习（Q-Learning）",
    zh_description="使用表格型 Q-Learning 进行强化学习，适合离散状态/动作空间",
    zh_tags=["强化学习", "Q-Learning"],
    version="1.0.0",
)
def rl(n_states: int, n_actions: int, episodes: int = 100,
       alpha: float = 0.1, gamma: float = 0.9, epsilon: float = 0.1, seed: int = 42) -> dict:
    """zh_name: 强化学习（Q-Learning）
    zh_desc: 使用表格型 Q-Learning 进行强化学习，适合离散状态/动作空间
    tags: 强化学习, Q-Learning"""
    return _rl(n_states, n_actions, episodes, alpha, gamma, epsilon, seed)


@algo_meta(
    zh_name="XGBoost",
    zh_description="使用 XGBoost 进行梯度提升分类，支持交叉验证和特征重要性",
    zh_tags=["分类", "集成学习", "梯度提升"],
    version="1.0.0",
)
def xgboost(X_train: list, y_train: list, X_test: list = None,
            n_estimators: int = 100, max_depth: int = 3,
            learning_rate: float = 0.1, seed: int = 42) -> dict:
    """zh_name: XGBoost
    zh_desc: 使用 XGBoost 进行梯度提升分类，支持交叉验证和特征重要性
    tags: 分类, 集成学习, 梯度提升"""
    return _xgboost(X_train, y_train, X_test, n_estimators, max_depth, learning_rate, seed)


@algo_meta(
    zh_name="LightGBM",
    zh_description="使用 LightGBM 进行高效梯度提升分类，速度快、内存占用低",
    zh_tags=["分类", "集成学习", "梯度提升"],
    version="1.0.0",
)
def lgbm(X_train: list, y_train: list, X_test: list = None,
         n_estimators: int = 100, max_depth: int = -1,
         learning_rate: float = 0.1, seed: int = 42) -> dict:
    """zh_name: LightGBM
    zh_desc: 使用 LightGBM 进行高效梯度提升分类，速度快、内存占用低
    tags: 分类, 集成学习, 梯度提升"""
    return _lgbm(X_train, y_train, X_test, n_estimators, max_depth, learning_rate, seed)
