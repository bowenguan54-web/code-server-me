"""
algo_service.sdk.decorators — @algo_export 装饰器
为自定义算法函数提供注解支持，自动注册到算法注册表。
"""

import time
import functools
from typing import Any, Callable, Optional


def algo_export(
    category: str = "custom",
    description: str = "",
    version: str = "1.0.0",
    inputs: Optional[dict[str, str]] = None,
    outputs: Optional[dict[str, str]] = None,
) -> Callable:
    """标记一个函数为可导出算法

    用法::

        @algo_export(category="ml", description="自定义 KMeans", version="1.0.0")
        def my_kmeans(data, k=3):
            ...
            return {"result": ..., "meta": {...}}

    Args:
        category: 算法分类，如 "ml" / "statistics" / "custom"
        description: 算法描述
        version: 版本号
        inputs: 参数说明 {param_name: type_desc}
        outputs: 返回字段说明 {field_name: type_desc}

    Returns:
        装饰后的函数，附带 `_algo_meta` 属性。
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> dict:
            t0 = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                # 确保统一格式
                if isinstance(result, dict) and "result" in result:
                    result.setdefault("meta", {})
                    result["meta"]["algorithm"] = func.__name__
                    result["meta"]["version"] = version
                    result.setdefault("elapsed_ms", round((time.perf_counter() - t0) * 1000, 3))
                    return result
                # 如果用户返回原始值，包装成标准格式
                elapsed = round((time.perf_counter() - t0) * 1000, 3)
                return {
                    "result": result,
                    "meta": {"algorithm": func.__name__, "version": version, "elapsed_ms": elapsed},
                    "elapsed_ms": elapsed,
                }
            except Exception as exc:
                elapsed = round((time.perf_counter() - t0) * 1000, 3)
                return {
                    "result": None,
                    "meta": {"algorithm": func.__name__, "version": version, "elapsed_ms": elapsed},
                    "elapsed_ms": elapsed,
                    "error": str(exc),
                }

        # 附加元信息，供 ast_parser / file_watcher 读取
        wrapper._algo_meta = {  # type: ignore[attr-defined]
            "name": func.__name__,
            "category": category,
            "description": description or (func.__doc__ or "").strip().split("\n")[0],
            "version": version,
            "inputs": inputs or {},
            "outputs": outputs or {},
        }
        return wrapper

    return decorator
