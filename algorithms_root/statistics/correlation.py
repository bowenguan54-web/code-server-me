"""Statistical correlation algorithms."""

from __future__ import annotations

from typing import Sequence

from algo_service.sdk.decorators import algo_meta


@algo_meta(
    zh_name="皮尔逊相关系数",
    zh_description="计算两个等长数值序列之间的皮尔逊线性相关系数",
    zh_tags=["统计", "相关性", "线性"],
    version="1.0.0",
)
def pearson_correlation(x: Sequence[float], y: Sequence[float]) -> float:
    """
    Compute the Pearson linear correlation coefficient between *x* and *y*.

    Args:
        x: First numeric sequence.
        y: Second numeric sequence (same length as *x*).

    Returns:
        Pearson r in the range [-1, 1].

    Raises:
        ValueError: If *x* and *y* have different lengths or zero variance.
    """
    if len(x) != len(y):
        raise ValueError("x and y must have the same length")
    n = len(x)
    if n == 0:
        raise ValueError("Sequences must not be empty")

    mean_x = sum(x) / n
    mean_y = sum(y) / n
    cov = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(x, y))
    std_x = (sum((xi - mean_x) ** 2 for xi in x) ** 0.5)
    std_y = (sum((yi - mean_y) ** 2 for yi in y) ** 0.5)

    if std_x == 0 or std_y == 0:
        raise ValueError("Standard deviation is zero; correlation is undefined")
    return cov / (std_x * std_y)


@algo_meta(
    zh_name="斯皮尔曼秩相关",
    zh_description="计算两个序列的斯皮尔曼秩相关系数（无需正态分布假设）",
    zh_tags=["统计", "相关性", "非参数"],
    version="1.0.0",
)
def spearman_correlation(x: Sequence[float], y: Sequence[float]) -> float:
    """
    Compute Spearman's rank correlation coefficient.

    Args:
        x: First numeric sequence.
        y: Second numeric sequence (same length as *x*).

    Returns:
        Spearman rho in the range [-1, 1].
    """
    def _rank(seq: Sequence[float]) -> list[float]:
        sorted_vals = sorted(enumerate(seq), key=lambda t: t[1])
        ranks = [0.0] * len(seq)
        i = 0
        while i < len(sorted_vals):
            j = i
            while j < len(sorted_vals) - 1 and sorted_vals[j + 1][1] == sorted_vals[j][1]:
                j += 1
            avg_rank = (i + j) / 2 + 1
            for k in range(i, j + 1):
                ranks[sorted_vals[k][0]] = avg_rank
            i = j + 1
        return ranks

    rx = _rank(x)
    ry = _rank(y)
    return pearson_correlation(rx, ry)
