"""
statistics.functions — 统计分析算法组件

包含: describe, dist, corr, cov, boxplot, percentile, outlier,
      anova, chisq, normtest, ahp, entropy, yoy, interval_prob, chisq_indep
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../"))

from algo_service.sdk.decorators import algo_meta
from examples.algolib.statistics import (
    describe as _describe,
    dist as _dist,
    corr as _corr,
    pearson as _pearson,
    cov as _cov,
    boxplot as _boxplot,
    percentile as _percentile,
    outlier as _outlier,
    anova as _anova,
    chisq as _chisq,
    normtest as _normtest,
    ahp as _ahp,
    entropy as _entropy,
    yoy as _yoy,
)


@algo_meta(
    zh_name="描述性统计",
    zh_description="计算均值、标准差、四分位数、偏度、峰度等基本统计量",
    zh_tags=["统计", "描述", "基本统计"],
    version="1.0.0",
)
def describe(data: list) -> dict:
    """zh_name: 描述性统计
    zh_desc: 计算均值、标准差、四分位数、偏度、峰度等基本统计量
    tags: 统计, 描述, 基本统计"""
    return _describe(data)


@algo_meta(
    zh_name="特征分布分析",
    zh_description="拟合多种概率分布（正态、指数、Gamma、Beta等），返回最优拟合分布",
    zh_tags=["统计", "分布", "拟合"],
    version="1.0.0",
)
def dist(data: list, distributions: list = None) -> dict:
    """zh_name: 特征分布分析
    zh_desc: 拟合正态、指数、Gamma、Beta、对数正态等分布，返回最优拟合
    tags: 统计, 分布, 拟合"""
    return _dist(data, distributions)


@algo_meta(
    zh_name="相关系数矩阵",
    zh_description="计算多变量间相关系数矩阵，支持 Pearson / Spearman / Kendall 方法",
    zh_tags=["统计", "相关性", "矩阵"],
    version="1.0.0",
)
def corr(data: list, method: str = "pearson") -> dict:
    """zh_name: 相关系数矩阵
    zh_desc: 计算多变量相关系数矩阵，支持 pearson/spearman/kendall
    tags: 统计, 相关性, 矩阵"""
    return _corr(data, method)


@algo_meta(
    zh_name="皮尔森相关系数",
    zh_description="计算两组数值序列之间的皮尔森线性相关系数及显著性 p 值",
    zh_tags=["统计", "相关性", "Pearson"],
    version="1.0.0",
)
def pearson_corr(x: list, y: list) -> dict:
    """zh_name: 皮尔森相关系数
    zh_desc: 计算两组序列的皮尔森相关系数及 p 值
    tags: 统计, 相关性, Pearson"""
    return _pearson(x, y)


@algo_meta(
    zh_name="协方差矩阵",
    zh_description="计算多变量间样本协方差矩阵（可调自由度修正量）",
    zh_tags=["统计", "协方差", "矩阵"],
    version="1.0.0",
)
def cov(data: list, ddof: int = 1) -> dict:
    """zh_name: 协方差矩阵
    zh_desc: 计算多变量间样本协方差矩阵
    tags: 统计, 协方差, 矩阵"""
    return _cov(data, ddof)


@algo_meta(
    zh_name="箱线图统计量",
    zh_description="计算 Q1、中位数、Q3、IQR、上下须以及异常值",
    zh_tags=["统计", "箱线图", "异常值"],
    version="1.0.0",
)
def boxplot(data: list, whis: float = 1.5) -> dict:
    """zh_name: 箱线图统计量
    zh_desc: 计算 Q1/Q3/IQR/须/异常值
    tags: 统计, 箱线图, 异常值"""
    return _boxplot(data, whis)


@algo_meta(
    zh_name="百分位数",
    zh_description="计算任意分位数，默认返回 P10/P25/P50/P75/P90",
    zh_tags=["统计", "分位数", "百分位"],
    version="1.0.0",
)
def percentile(data: list, q=None) -> dict:
    """zh_name: 百分位数
    zh_desc: 计算任意分位数，默认 P10/P25/P50/P75/P90
    tags: 统计, 分位数, 百分位"""
    return _percentile(data, q)


@algo_meta(
    zh_name="孤立点检测",
    zh_description="使用 IQR 或 Z-Score 方法检测数值序列中的异常离群点",
    zh_tags=["统计", "异常检测", "孤立点"],
    version="1.0.0",
)
def outlier(data: list, method: str = "iqr", threshold: float = 1.5) -> dict:
    """zh_name: 孤立点检测
    zh_desc: 使用 IQR 或 Z-Score 方法检测异常离群点
    tags: 统计, 异常检测, 孤立点"""
    return _outlier(data, method, threshold)


@algo_meta(
    zh_name="单因素方差分析（ANOVA）",
    zh_description="对多组数据进行单因素方差分析，输出 F 统计量和 p 值",
    zh_tags=["统计", "ANOVA", "假设检验"],
    version="1.0.0",
)
def anova(*groups) -> dict:
    """zh_name: 单因素方差分析（ANOVA）
    zh_desc: 多组数据单因素 ANOVA，输出 F 统计量和 p 值
    tags: 统计, ANOVA, 假设检验"""
    return _anova(*groups)


@algo_meta(
    zh_name="卡方拟合性检验",
    zh_description="对观测频数进行卡方拟合优度检验，默认使用均匀分布作为期望",
    zh_tags=["统计", "卡方", "假设检验"],
    version="1.0.0",
)
def chisq_goodness(observed: list, expected: list = None) -> dict:
    """zh_name: 卡方拟合性检验
    zh_desc: 卡方拟合优度检验，对比观测与期望频数
    tags: 统计, 卡方, 假设检验"""
    return _chisq(observed, expected)


@algo_meta(
    zh_name="正态分布检验",
    zh_description="同时执行 Shapiro-Wilk 和 D'Agostino-Pearson 正态性检验",
    zh_tags=["统计", "正态检验", "假设检验"],
    version="1.0.0",
)
def normtest(data: list) -> dict:
    """zh_name: 正态分布检验
    zh_desc: Shapiro-Wilk + D'Agostino-Pearson 正态性联合检验
    tags: 统计, 正态检验, 假设检验"""
    return _normtest(data)


@algo_meta(
    zh_name="层次分析法（AHP）",
    zh_description="基于成对比较矩阵计算各指标权重，并输出一致性比率",
    zh_tags=["统计", "AHP", "权重", "决策分析"],
    version="1.0.0",
)
def ahp(matrix: list) -> dict:
    """zh_name: 层次分析法（AHP）
    zh_desc: 成对比较矩阵 → 指标权重 + 一致性比率
    tags: 统计, AHP, 权重, 决策分析"""
    return _ahp(matrix)


@algo_meta(
    zh_name="熵权法",
    zh_description="计算 Shannon 信息熵，支持自定义对数底（bit/nat）",
    zh_tags=["统计", "信息熵", "权重"],
    version="1.0.0",
)
def entropy(data: list, base: float = 2.0) -> dict:
    """zh_name: 熵权法
    zh_desc: 计算 Shannon 信息熵及归一化熵
    tags: 统计, 信息熵, 权重"""
    return _entropy(data, base)


@algo_meta(
    zh_name="同比增长率（YoY）",
    zh_description="计算当期值相对同期基准的同比增长率（%）",
    zh_tags=["统计", "同比", "时序"],
    version="1.0.0",
)
def yoy(current: list, previous: list, labels: list = None) -> dict:
    """zh_name: 同比增长率（YoY）
    zh_desc: 计算当期值相对同期的同比增长率
    tags: 统计, 同比, 时序"""
    return _yoy(current, previous, labels)


@algo_meta(
    zh_name="卡方独立性检验",
    zh_description="对列联表进行卡方独立性检验，判断两分类变量是否相关",
    zh_tags=["统计", "卡方", "独立性", "假设检验"],
    version="1.0.0",
)
def chisq_independence(contingency_table: list) -> dict:
    """zh_name: 卡方独立性检验
    zh_desc: 列联表卡方独立性检验，判断两变量是否独立
    tags: 统计, 卡方, 独立性, 假设检验"""
    import time
    import numpy as np
    from scipy import stats as sp_stats

    t0 = time.perf_counter()
    arr = np.array(contingency_table, dtype=float)
    chi2, p, dof, expected = sp_stats.chi2_contingency(arr)
    return {
        "result": {
            "chi2": round(float(chi2), 6),
            "p_value": round(float(p), 8),
            "dof": int(dof),
            "significant": bool(p < 0.05),
            "expected": [[round(float(v), 4) for v in row] for row in expected],
        },
        "meta": {"algorithm": "chisq_independence", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3)},
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
    }


@algo_meta(
    zh_name="区间概率估计",
    zh_description="估计正态分布下某数值区间的概率（累积分布函数）",
    zh_tags=["统计", "概率", "区间估计"],
    version="1.0.0",
)
def interval_prob(data: list, lower: float = None, upper: float = None) -> dict:
    """zh_name: 区间概率估计
    zh_desc: 基于正态分布估计数值落入给定区间的概率
    tags: 统计, 概率, 区间估计"""
    import time
    import numpy as np
    from scipy import stats as sp_stats

    t0 = time.perf_counter()
    arr = np.array(data, dtype=float)
    mu, sigma = float(np.mean(arr)), float(np.std(arr, ddof=1))
    dist_obj = sp_stats.norm(mu, sigma)
    lo_prob = dist_obj.cdf(lower) if lower is not None else 0.0
    hi_prob = dist_obj.cdf(upper) if upper is not None else 1.0
    prob = hi_prob - lo_prob
    return {
        "result": {
            "probability": round(prob, 6),
            "mean": round(mu, 6),
            "std": round(sigma, 6),
            "lower": lower,
            "upper": upper,
        },
        "meta": {"algorithm": "interval_prob", "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3)},
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 3),
    }
