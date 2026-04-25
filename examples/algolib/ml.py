"""
algolib.ml — 机器学习模块

提供: svm, knn, dtree, naive_bayes, random_forest, logistic, linear,
      kmeans, gmm, rl, xgboost, lgbm
"""

import time
from typing import Any, Optional

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    silhouette_score,
)
from sklearn.mixture import GaussianMixture
from sklearn.model_selection import cross_val_score
from sklearn.naive_bayes import GaussianNB
from sklearn.neighbors import KNeighborsClassifier
from sklearn.preprocessing import LabelEncoder
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier
from sklearn.cluster import KMeans


def _result(result: Any, algo: str, elapsed: float, **meta) -> dict:
    return {
        "result": result,
        "meta": {"algorithm": algo, "elapsed_ms": round(elapsed * 1000, 3), **meta},
        "elapsed_ms": round(elapsed * 1000, 3),
    }


def _encode_labels(y: list):
    le = LabelEncoder()
    return le.fit_transform(y), le


def _report(y_true, y_pred) -> dict:
    rpt = classification_report(y_true, y_pred, output_dict=True, zero_division=0)
    return {
        "accuracy": round(float(accuracy_score(y_true, y_pred)), 4),
        "macro_f1": round(float(rpt.get("macro avg", {}).get("f1-score", 0)), 4),
        "weighted_f1": round(float(rpt.get("weighted avg", {}).get("f1-score", 0)), 4),
    }


def svm(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    task: str = "classify",
    kernel: str = "rbf",
    C: float = 1.0,
    gamma: str = "scale",
) -> dict:
    """支持向量机

    Args:
        X_train: 训练特征（二维列表）
        y_train: 训练标签列表
        X_test: 测试特征（二维列表，可选）
        task: "classify"（分类）或 "regress"（回归）
        kernel: "rbf" / "linear" / "poly" / "sigmoid"
        C: 正则化参数
        gamma: 核参数 "scale" / "auto" 或 float

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    if task == "regress":
        ytr = np.array(y_train, dtype=float)
        model = SVR(kernel=kernel, C=C, gamma=gamma)
        model.fit(Xtr, ytr)
        preds = model.predict(np.array(X_test, dtype=float) if X_test else Xtr).tolist()
        y_ref = np.array(X_test, dtype=float) if X_test else ytr
        metrics = {}
    else:
        ytr, le = _encode_labels(y_train)
        model = SVC(kernel=kernel, C=C, gamma=gamma)
        model.fit(Xtr, ytr)
        Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
        yte = ytr if X_test is None else None
        preds = le.inverse_transform(model.predict(Xte)).tolist()
        if yte is not None:
            metrics = _report(le.inverse_transform(ytr), preds)
        else:
            metrics = {}
    return _result(
        {"predictions": preds, "metrics": metrics},
        "svm", time.perf_counter() - t0,
        task=task, kernel=kernel, C=C,
    )


def knn(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    k: int = 5,
    weights: str = "uniform",
) -> dict:
    """K 近邻分类

    Args:
        X_train: 训练特征（二维列表）
        y_train: 训练标签列表
        X_test: 测试特征（可选）
        k: 近邻数量
        weights: "uniform" 或 "distance"

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = KNeighborsClassifier(n_neighbors=k, weights=weights)
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    return _result(
        {"predictions": preds, "metrics": metrics},
        "knn", time.perf_counter() - t0,
        k=k, weights=weights,
    )


def dtree(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    max_depth: Optional[int] = None,
    min_samples_split: int = 2,
) -> dict:
    """决策树分类

    Args:
        X_train: 训练特征
        y_train: 训练标签
        X_test: 测试特征（可选）
        max_depth: 最大深度（None 不限制）
        min_samples_split: 最小分裂样本数

    Returns:
        {"result": {"predictions", "metrics", "feature_importances"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = DecisionTreeClassifier(max_depth=max_depth, min_samples_split=min_samples_split)
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    importances = [round(float(v), 6) for v in model.feature_importances_]
    return _result(
        {"predictions": preds, "metrics": metrics, "feature_importances": importances},
        "dtree", time.perf_counter() - t0,
        max_depth=max_depth,
    )


def naive_bayes(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
) -> dict:
    """朴素贝叶斯分类（高斯分布）

    Args:
        X_train: 训练特征
        y_train: 训练标签
        X_test: 测试特征（可选）

    Returns:
        {"result": {"predictions", "metrics", "class_prior"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = GaussianNB()
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    return _result(
        {
            "predictions": preds,
            "metrics": metrics,
            "class_prior": [round(float(p), 6) for p in model.class_prior_],
        },
        "naive_bayes", time.perf_counter() - t0,
    )


def random_forest(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    n_estimators: int = 100,
    max_depth: Optional[int] = None,
    seed: Optional[int] = None,
) -> dict:
    """随机森林分类

    Args:
        X_train: 训练特征
        y_train: 训练标签
        X_test: 测试特征（可选）
        n_estimators: 决策树数量
        max_depth: 每棵树最大深度
        seed: 随机种子

    Returns:
        {"result": {"predictions", "metrics", "feature_importances"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = RandomForestClassifier(
        n_estimators=n_estimators, max_depth=max_depth, random_state=seed
    )
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    importances = [round(float(v), 6) for v in model.feature_importances_]
    return _result(
        {"predictions": preds, "metrics": metrics, "feature_importances": importances},
        "random_forest", time.perf_counter() - t0,
        n_estimators=n_estimators,
    )


def logistic(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    C: float = 1.0,
    max_iter: int = 1000,
    seed: Optional[int] = None,
) -> dict:
    """逻辑回归分类

    Args:
        X_train: 训练特征
        y_train: 训练标签
        X_test: 测试特征（可选）
        C: 正则化强度倒数（越小正则化越强）
        max_iter: 最大迭代次数
        seed: 随机种子

    Returns:
        {"result": {"predictions", "probabilities", "metrics", "coefficients"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = LogisticRegression(C=C, max_iter=max_iter, random_state=seed)
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    probs = model.predict_proba(Xte).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    coeffs = model.coef_.tolist()
    return _result(
        {"predictions": preds, "probabilities": probs, "metrics": metrics, "coefficients": coeffs},
        "logistic", time.perf_counter() - t0,
        C=C,
    )


def linear(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    fit_intercept: bool = True,
) -> dict:
    """线性回归

    Args:
        X_train: 训练特征
        y_train: 目标值列表
        X_test: 测试特征（可选）
        fit_intercept: 是否拟合截距

    Returns:
        {"result": {"predictions", "metrics", "coefficients", "intercept"}, ...}
    """
    t0 = time.perf_counter()
    Xtr = np.array(X_train, dtype=float)
    ytr = np.array(y_train, dtype=float)
    model = LinearRegression(fit_intercept=fit_intercept)
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = model.predict(Xte).tolist()
    y_ref = ytr if X_test is None else None
    mse = float(mean_squared_error(ytr, model.predict(Xtr)))
    mae = float(mean_absolute_error(ytr, model.predict(Xtr)))
    r2 = float(r2_score(ytr, model.predict(Xtr)))
    metrics = {"mse": round(mse, 6), "rmse": round(mse ** 0.5, 6), "mae": round(mae, 6), "r2": round(r2, 6)}
    return _result(
        {
            "predictions": preds,
            "metrics": metrics,
            "coefficients": [round(float(c), 6) for c in model.coef_],
            "intercept": round(float(model.intercept_), 6),
        },
        "linear", time.perf_counter() - t0,
    )


def kmeans(
    X: list,
    k: int = 3,
    max_iter: int = 300,
    seed: Optional[int] = None,
) -> dict:
    """K-Means 聚类

    Args:
        X: 特征矩阵（二维列表）
        k: 簇数量
        max_iter: 最大迭代次数
        seed: 随机种子

    Returns:
        {"result": {"labels", "centroids", "inertia", "silhouette"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(X, dtype=float)
    model = KMeans(n_clusters=k, max_iter=max_iter, random_state=seed, n_init="auto")
    labels = model.fit_predict(arr)
    sil = float(silhouette_score(arr, labels)) if k > 1 and len(arr) > k else 0.0
    return _result(
        {
            "labels": labels.tolist(),
            "centroids": model.cluster_centers_.tolist(),
            "inertia": round(float(model.inertia_), 4),
            "silhouette": round(sil, 4),
            "n_iter": int(model.n_iter_),
        },
        "kmeans", time.perf_counter() - t0,
        k=k,
    )


def gmm(
    X: list,
    n_components: int = 3,
    covariance_type: str = "full",
    seed: Optional[int] = None,
) -> dict:
    """高斯混合模型（GMM）聚类

    Args:
        X: 特征矩阵（二维列表）
        n_components: 混合分量数
        covariance_type: "full" / "tied" / "diag" / "spherical"
        seed: 随机种子

    Returns:
        {"result": {"labels", "means", "weights", "bic", "aic"}, ...}
    """
    t0 = time.perf_counter()
    arr = np.array(X, dtype=float)
    model = GaussianMixture(
        n_components=n_components, covariance_type=covariance_type, random_state=seed
    )
    model.fit(arr)
    labels = model.predict(arr).tolist()
    return _result(
        {
            "labels": labels,
            "means": model.means_.tolist(),
            "weights": [round(float(w), 6) for w in model.weights_],
            "bic": round(float(model.bic(arr)), 4),
            "aic": round(float(model.aic(arr)), 4),
            "converged": bool(model.converged_),
        },
        "gmm", time.perf_counter() - t0,
        n_components=n_components, covariance_type=covariance_type,
    )


def rl(
    n_states: int,
    n_actions: int,
    episodes: int = 200,
    alpha: float = 0.1,
    gamma: float = 0.99,
    epsilon: float = 0.1,
    seed: Optional[int] = None,
) -> dict:
    """Q-Learning 强化学习（表格型，随机环境演示）

    演示用途：在随机奖励环境中运行 Q-Learning，返回学到的 Q 表和训练曲线。

    Args:
        n_states: 状态空间大小
        n_actions: 动作空间大小
        episodes: 训练轮数
        alpha: 学习率
        gamma: 折扣因子
        epsilon: ε-贪心探索率
        seed: 随机种子

    Returns:
        {"result": {"q_table", "rewards", "mean_reward"}, ...}
    """
    t0 = time.perf_counter()
    rng = np.random.default_rng(seed)
    Q = np.zeros((n_states, n_actions))
    # 固定随机奖励矩阵（reward[s][a] → (next_state, reward)）
    reward_mat = rng.random((n_states, n_actions))
    next_state_mat = rng.integers(0, n_states, size=(n_states, n_actions))
    episode_rewards = []
    for _ in range(episodes):
        state = int(rng.integers(0, n_states))
        total_r = 0.0
        for _step in range(50):
            if rng.random() < epsilon:
                action = int(rng.integers(0, n_actions))
            else:
                action = int(np.argmax(Q[state]))
            next_s = int(next_state_mat[state, action])
            r = float(reward_mat[state, action])
            Q[state, action] += alpha * (r + gamma * np.max(Q[next_s]) - Q[state, action])
            state = next_s
            total_r += r
        episode_rewards.append(round(total_r, 4))
    return _result(
        {
            "q_table": Q.tolist(),
            "rewards": episode_rewards,
            "mean_reward": round(float(np.mean(episode_rewards)), 4),
        },
        "rl", time.perf_counter() - t0,
        episodes=episodes, alpha=alpha, gamma=gamma,
    )


def xgboost(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    n_estimators: int = 100,
    max_depth: int = 6,
    learning_rate: float = 0.1,
    seed: Optional[int] = None,
) -> dict:
    """XGBoost 梯度提升分类/回归

    Args:
        X_train: 训练特征
        y_train: 训练标签（分类：字符串/整数；回归：浮点数）
        X_test: 测试特征（可选）
        n_estimators: 树的数量
        max_depth: 最大深度
        learning_rate: 学习率
        seed: 随机种子

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    try:
        import xgboost as xgb  # type: ignore
    except ImportError:
        return _result(
            {"error": "xgboost 未安装，请运行: pip install xgboost"},
            "xgboost", time.perf_counter() - t0,
        )
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = xgb.XGBClassifier(
        n_estimators=n_estimators, max_depth=max_depth,
        learning_rate=learning_rate, random_state=seed,
        eval_metric="mlogloss", verbosity=0,
    )
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    return _result(
        {"predictions": preds, "metrics": metrics},
        "xgboost", time.perf_counter() - t0,
        n_estimators=n_estimators, max_depth=max_depth,
    )


def lgbm(
    X_train: list,
    y_train: list,
    X_test: Optional[list] = None,
    n_estimators: int = 100,
    max_depth: int = -1,
    learning_rate: float = 0.1,
    num_leaves: int = 31,
    seed: Optional[int] = None,
) -> dict:
    """LightGBM 梯度提升分类

    Args:
        X_train: 训练特征
        y_train: 训练标签
        X_test: 测试特征（可选）
        n_estimators: 树的数量
        max_depth: 最大深度（-1 不限制）
        learning_rate: 学习率
        num_leaves: 叶子节点数
        seed: 随机种子

    Returns:
        {"result": {"predictions", "metrics"}, ...}
    """
    t0 = time.perf_counter()
    try:
        import lightgbm as lgb  # type: ignore
    except ImportError:
        return _result(
            {"error": "lightgbm 未安装，请运行: pip install lightgbm"},
            "lgbm", time.perf_counter() - t0,
        )
    Xtr = np.array(X_train, dtype=float)
    ytr, le = _encode_labels(y_train)
    model = lgb.LGBMClassifier(
        n_estimators=n_estimators, max_depth=max_depth,
        learning_rate=learning_rate, num_leaves=num_leaves,
        random_state=seed, verbosity=-1,
    )
    model.fit(Xtr, ytr)
    Xte = np.array(X_test, dtype=float) if X_test is not None else Xtr
    preds = le.inverse_transform(model.predict(Xte)).tolist()
    metrics = _report(le.inverse_transform(ytr), le.inverse_transform(model.predict(Xtr)))
    return _result(
        {"predictions": preds, "metrics": metrics},
        "lgbm", time.perf_counter() - t0,
        n_estimators=n_estimators, num_leaves=num_leaves,
    )
