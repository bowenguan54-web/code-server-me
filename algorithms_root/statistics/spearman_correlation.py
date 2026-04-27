"""Statistical correlation algorithms."""
from __future__ import annotations
from typing import Sequence
from algo_service.sdk.decorators import algo_meta


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
