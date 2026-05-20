"""Decorators for annotating algorithm functions with metadata."""

from __future__ import annotations

from functools import wraps
from typing import Any


def algo_meta(
    zh_name: str = "",
    zh_description: str = "",
    zh_tags: list[str] | None = None,
    version: str = "1.0.0",
    author: str = "",
    input_example: str = "",
    widget_overrides: dict[str, str] | None = None,
) -> Any:
    """
    Decorator to attach Chinese metadata to an algorithm function.

    Usage::

        @algo_meta(zh_name="皮尔逊相关", zh_description="计算两列的皮尔逊相关系数", zh_tags=["统计", "相关性"])
        def pearson_correlation(x, y):
            ...
    """

    def decorator(func: Any) -> Any:
        meta = {
            "zh_name": zh_name or func.__name__,
            "zh_description": zh_description,
            "zh_tags": zh_tags or [],
            "version": version,
            "author": author,
            "input_example": input_example,
            "widget_overrides": widget_overrides or {},
        }
        func._algo_meta = meta  # type: ignore[attr-defined]

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            return func(*args, **kwargs)

        wrapper._algo_meta = meta  # type: ignore[attr-defined]
        return wrapper

    return decorator
