"""
algo_service.sdk.file_watcher — 文件监控
使用 watchdog 监控 user_algorithms 目录，
检测到 .py 文件变化后触发动态加载/卸载，并广播 SSE 事件。
"""

import asyncio
import time
import threading
from pathlib import Path
from typing import Optional

from watchdog.events import FileSystemEventHandler, FileSystemEvent
from watchdog.observers import Observer

from algo_service.sdk import dynamic_router
from algo_service.sdk.sse_manager import broadcast

# 防抖间隔（秒）
DEBOUNCE_SECONDS = 0.3

# 全局 event loop 引用（由 main.py lifespan 设置）
_loop: Optional[asyncio.AbstractEventLoop] = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def _broadcast_sync(event_type: str, data: dict) -> None:
    """在非 async 线程中安全地调度 broadcast 协程"""
    if _loop is None or _loop.is_closed():
        return
    asyncio.run_coroutine_threadsafe(broadcast(event_type, data), _loop)


class _AlgoFileHandler(FileSystemEventHandler):
    """监控 .py 文件事件，带防抖"""

    def __init__(self) -> None:
        super().__init__()
        self._timers: dict[str, threading.Timer] = {}

    def _debounce(self, key: str, callback, delay: float = DEBOUNCE_SECONDS) -> None:
        existing = self._timers.pop(key, None)
        if existing:
            existing.cancel()
        timer = threading.Timer(delay, callback)
        timer.daemon = True
        timer.start()
        self._timers[key] = timer

    def on_created(self, event: FileSystemEvent) -> None:
        if event.is_directory or not str(event.src_path).endswith(".py"):
            return
        path = str(event.src_path)
        self._debounce(path, lambda: self._handle_add(path))

    def on_modified(self, event: FileSystemEvent) -> None:
        if event.is_directory or not str(event.src_path).endswith(".py"):
            return
        path = str(event.src_path)
        self._debounce(path, lambda: self._handle_modify(path))

    def on_deleted(self, event: FileSystemEvent) -> None:
        if event.is_directory or not str(event.src_path).endswith(".py"):
            return
        path = str(event.src_path)
        self._debounce(path, lambda: self._handle_remove(path))

    def on_moved(self, event: FileSystemEvent) -> None:
        if event.is_directory:
            return
        src = str(event.src_path)
        dest = str(event.dest_path)
        if src.endswith(".py"):
            self._debounce(src, lambda: self._handle_remove(src))
        if dest.endswith(".py"):
            self._debounce(dest, lambda: self._handle_add(dest))

    @staticmethod
    def _handle_add(path: str) -> None:
        added = dynamic_router.load_file(path)
        if added:
            _broadcast_sync("algo_added", {"path": path, "algorithms": added, "count": len(added)})

    @staticmethod
    def _handle_modify(path: str) -> None:
        removed, added = dynamic_router.reload_file(path)
        _broadcast_sync(
            "algo_updated",
            {"path": path, "removed": removed, "added": added, "count": len(added)},
        )

    @staticmethod
    def _handle_remove(path: str) -> None:
        removed = dynamic_router.unload_file(path)
        if removed:
            _broadcast_sync("algo_removed", {"path": path, "algorithms": removed, "count": len(removed)})


class AlgoFileWatcher:
    """用户算法目录监控器"""

    def __init__(self, watch_dir: str) -> None:
        self._watch_dir = str(Path(watch_dir).resolve())
        self._observer: Optional[Observer] = None
        self._handler = _AlgoFileHandler()

    def start(self, loop: asyncio.AbstractEventLoop) -> None:
        set_event_loop(loop)
        self._observer = Observer()
        self._observer.schedule(self._handler, self._watch_dir, recursive=True)
        self._observer.start()

    def stop(self) -> None:
        if self._observer:
            self._observer.stop()
            self._observer.join()
            self._observer = None
