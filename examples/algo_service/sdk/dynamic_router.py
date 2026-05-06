"""
algo_service.sdk.dynamic_router — 动态路由注册
负责在运行时加载/卸载用户算法文件，并将函数注册到 FastAPI 路由。
"""

import importlib.util
import importlib.machinery
import sys
import traceback
from pathlib import Path
from typing import Any, Callable

from algo_service.models.schemas import AlgorithmInfo
from algo_service.sdk.registry import registry
from algo_service.sdk.ast_parser import parse_file


def _load_module(file_path: str) -> tuple[Any, str]:
    """从文件路径动态导入 Python 模块，返回 (module, module_name)"""
    path = Path(file_path).resolve()
    module_name = f"user_algo_{path.stem}_{abs(hash(str(path)))}"
    spec = importlib.util.spec_from_file_location(module_name, str(path))
    if spec is None or spec.loader is None:
        raise ImportError(f"无法加载模块: {file_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module, module_name


def load_file(file_path: str) -> list[str]:
    """加载用户算法文件，将被 @algo_export 装饰的函数注册到 registry

    Args:
        file_path: .py 文件路径（绝对路径）

    Returns:
        成功注册的算法名称列表
    """
    # 先用 AST 静态扫描，快速判断是否有 @algo_export
    algo_metas = parse_file(file_path)
    if not algo_metas:
        return []

    try:
        module, _ = _load_module(file_path)
    except Exception:
        traceback.print_exc()
        return []

    registered: list[str] = []
    for meta in algo_metas:
        func: Callable = getattr(module, meta["name"], None)  # type: ignore
        if func is None:
            continue
        # 优先从运行时 _algo_meta 读取（比 AST 更准确）
        runtime_meta: dict = getattr(func, "_algo_meta", {})
        info = AlgorithmInfo(
            name=meta["name"],
            category=runtime_meta.get("category", meta.get("category", "custom")),
            description=runtime_meta.get("description", meta.get("description", "")),
            version=runtime_meta.get("version", meta.get("version", "1.0.0")),
            inputs=runtime_meta.get("inputs", meta.get("inputs", {})),
            outputs=runtime_meta.get("outputs", meta.get("outputs", {})),
            source="custom",
            path=file_path,
        )
        registry.register(info)
        registered.append(meta["name"])
    return registered


def unload_file(file_path: str) -> list[str]:
    """卸载用户算法文件，从 registry 中移除所有来自该文件的算法

    Args:
        file_path: .py 文件路径

    Returns:
        被移除的算法名称列表
    """
    removed = registry.unregister_by_path(file_path)
    return removed


def reload_file(file_path: str) -> tuple[list[str], list[str]]:
    """重新加载用户算法文件（先卸载，再加载）

    Returns:
        (removed_names, added_names)
    """
    removed = unload_file(file_path)
    added = load_file(file_path)
    return removed, added
