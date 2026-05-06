"""
algo_service.sdk.registry — AlgorithmRegistry
全局算法注册表，管理内置和自定义算法元信息。
"""

from threading import Lock
from typing import Optional

from algo_service.models.schemas import AlgorithmInfo


class AlgorithmRegistry:
    """线程安全的算法注册表"""

    def __init__(self) -> None:
        self._lock = Lock()
        self._registry: dict[str, AlgorithmInfo] = {}

    def register(self, info: AlgorithmInfo) -> None:
        with self._lock:
            self._registry[info.name] = info

    def unregister(self, name: str) -> None:
        with self._lock:
            self._registry.pop(name, None)

    def unregister_by_path(self, path: str) -> list[str]:
        """删除来自指定文件路径的所有算法，返回被删除的名称列表"""
        with self._lock:
            to_remove = [name for name, info in self._registry.items() if info.path == path]
            for name in to_remove:
                del self._registry[name]
        return to_remove

    def get(self, name: str) -> Optional[AlgorithmInfo]:
        with self._lock:
            return self._registry.get(name)

    def all(self) -> list[AlgorithmInfo]:
        with self._lock:
            return list(self._registry.values())

    def all_dict(self) -> list[dict]:
        with self._lock:
            return [info.model_dump() for info in self._registry.values()]

    def count(self) -> int:
        with self._lock:
            return len(self._registry)


# 全局单例
registry = AlgorithmRegistry()
