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
