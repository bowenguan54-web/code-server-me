"""Statistical correlation algorithms."""
from __future__ import annotations
from typing import Sequence
from algo_service.sdk.decorators import algo_meta


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
