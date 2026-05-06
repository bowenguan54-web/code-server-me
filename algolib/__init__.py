"""
alg – proxy object for calling algorithm components via the local FastAPI service.

Usage in a notebook or script::

    from algolib import alg
    result = alg.statistics.pearson_correlation([1, 2, 3], [4, 5, 6])
"""

from __future__ import annotations

import json
from typing import Any


def _serialize(obj: Any) -> Any:
    """Best-effort serialisation: handles numpy/pandas types."""
    try:
        import numpy as np  # noqa: PLC0415

        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.integer, np.floating)):
            return obj.item()
    except ImportError:
        pass
    try:
        import pandas as pd  # noqa: PLC0415

        if isinstance(obj, pd.DataFrame):
            return obj.to_dict(orient="records")
        if isinstance(obj, pd.Series):
            return obj.tolist()
    except ImportError:
        pass
    if isinstance(obj, (list, tuple)):
        return [_serialize(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


class _NamespaceProxy:
    __slots__ = ("_ns", "_base_url")

    def __init__(self, namespace: str, base_url: str) -> None:
        self._ns = namespace
        self._base_url = base_url

    def __getattr__(self, func_name: str) -> Any:
        ns = self._ns
        base = self._base_url

        def _call(*args: Any, **kwargs: Any) -> Any:
            import requests  # noqa: PLC0415

            url = f"{base}/api/v1/{ns}/{func_name}"
            payload = {"args": _serialize(list(args)), "kwargs": _serialize(kwargs)}
            try:
                resp = requests.post(url, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
            except requests.RequestException as exc:
                raise RuntimeError(
                    f"Failed to call alg.{ns}.{func_name}: {exc}"
                ) from exc
            if not data.get("success", False):
                raise RuntimeError(data.get("error") or "Unknown error from AlgoLib service")
            return data["result"]

        _call.__name__ = func_name
        return _call


class _AlgProxy:
    """
    Attribute-access proxy: ``alg.namespace.func(args)`` is forwarded as
    ``POST http://localhost:8000/api/v1/{namespace}/{func}`` with a JSON body.
    """

    __slots__ = ("_base_url",)

    def __init__(self, base_url: str = "http://localhost:8000") -> None:
        self._base_url = base_url

    def __getattr__(self, namespace: str) -> _NamespaceProxy:
        return _NamespaceProxy(namespace, self._base_url)


#: Module-level singleton – ``from algolib import alg``
alg = _AlgProxy()
