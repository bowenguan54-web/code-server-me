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


def corr(data: list, method: str = "pearson") -> dict:
    """zh_name: 相关系数矩阵
    zh_desc: 计算多变量相关系数矩阵，支持 pearson/spearman/kendall
    tags: 统计, 相关性, 矩阵"""
    return _corr(data, method)
