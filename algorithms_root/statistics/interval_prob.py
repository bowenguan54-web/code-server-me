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
