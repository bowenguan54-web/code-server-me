"""
File watcher: monitors algorithm directories and keeps the registry up-to-date.
Uses Watchdog with a 300 ms debounce to avoid duplicate events on rapid saves.
"""

from __future__ import annotations

import logging
import os
import threading
from collections.abc import Callable
from pathlib import Path

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

from .registry import AlgorithmRegistry

logger = logging.getLogger(__name__)


class _AlgoEventHandler(FileSystemEventHandler):
    def __init__(
        self,
        registry: AlgorithmRegistry,
        on_change: Callable[[str], None],
        on_delete: Callable[[str], None],
        debounce_ms: int = 300,
    ) -> None:
        super().__init__()
        self._registry = registry
        self._on_change = on_change
        self._on_delete = on_delete
        self._debounce_ms = debounce_ms
        self._timers: dict[str, threading.Timer] = {}
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Debounce
    # ------------------------------------------------------------------

    def _debounce(self, key: str, fn: Callable[[], None]) -> None:
        with self._lock:
            existing = self._timers.get(key)
            if existing is not None:
                existing.cancel()
            timer = threading.Timer(self._debounce_ms / 1000.0, fn)
            self._timers[key] = timer
            timer.start()

    # ------------------------------------------------------------------
    # Handlers
    # ------------------------------------------------------------------

    def _handle_py_change(self, path: str) -> None:
        logger.info("Python file changed: %s", path)
        self._registry.rescan_file(path)
        self._on_change(path)

    def _handle_py_delete(self, path: str) -> None:
        logger.info("Python file deleted: %s", path)
        self._registry.unregister_by_file(path)
        self._on_delete(path)

    def _handle_config_change(self, path: str) -> None:
        logger.info("folder_config.json changed: %s", path)
        dirpath = os.path.dirname(path)
        # Clear all entries that came from Python files in this directory.
        for filename in os.listdir(dirpath):
            if filename.endswith(".py"):
                self._registry.unregister_by_file(os.path.join(dirpath, filename))
        # Re-scan each watch root to re-index this directory.
        for root in self._registry.watch_roots:
            rel = os.path.relpath(dirpath, root)
            if not rel.startswith(".."):
                self._registry.scan_directory(root)
                break
        self._on_change(path)

    def _handle_package_manifest_change(self, path: str) -> None:
        logger.info("algopack.json changed: %s", path)
        package_root = os.path.dirname(path)
        from .ast_parser import AstParser

        self._registry._rescan_package_root(package_root, AstParser)  # noqa: SLF001
        self._on_change(path)

    def _handle_package_manifest_delete(self, path: str) -> None:
        logger.info("algopack.json deleted: %s", path)
        package_root = os.path.dirname(path)
        from .ast_parser import AstParser

        self._registry._rescan_package_root(package_root, AstParser)  # noqa: SLF001
        self._on_delete(path)

    # ------------------------------------------------------------------
    # Watchdog callbacks
    # ------------------------------------------------------------------

    def on_created(self, event) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        path: str = event.src_path
        if path.endswith(".py"):
            self._debounce(path, lambda p=path: self._handle_py_change(p))
        elif Path(path).name == "folder_config.json":
            self._debounce(path, lambda p=path: self._handle_config_change(p))
        elif Path(path).name == "algopack.json":
            self._debounce(path, lambda p=path: self._handle_package_manifest_change(p))

    def on_modified(self, event) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        path: str = event.src_path
        if path.endswith(".py"):
            self._debounce(path, lambda p=path: self._handle_py_change(p))
        elif Path(path).name == "folder_config.json":
            self._debounce(path, lambda p=path: self._handle_config_change(p))
        elif Path(path).name == "algopack.json":
            self._debounce(path, lambda p=path: self._handle_package_manifest_change(p))

    def on_deleted(self, event) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        path: str = event.src_path
        if path.endswith(".py"):
            self._debounce(path, lambda p=path: self._handle_py_delete(p))
        elif Path(path).name == "algopack.json":
            self._debounce(path, lambda p=path: self._handle_package_manifest_delete(p))

    def on_moved(self, event) -> None:  # type: ignore[override]
        if event.is_directory:
            return
        if event.src_path.endswith(".py"):
            self._debounce(
                event.src_path,
                lambda p=event.src_path: self._handle_py_delete(p),
            )
        elif Path(event.src_path).name == "algopack.json":
            self._debounce(
                event.src_path,
                lambda p=event.src_path: self._handle_package_manifest_delete(p),
            )
        if event.dest_path.endswith(".py"):
            self._debounce(
                event.dest_path,
                lambda p=event.dest_path: self._handle_py_change(p),
            )
        elif Path(event.dest_path).name == "algopack.json":
            self._debounce(
                event.dest_path,
                lambda p=event.dest_path: self._handle_package_manifest_change(p),
            )

    def cancel_timers(self) -> None:
        with self._lock:
            for timer in self._timers.values():
                timer.cancel()
            self._timers.clear()


class FileWatcher:
    """Manages a Watchdog observer for the given list of directories."""

    def __init__(
        self,
        registry: AlgorithmRegistry,
        on_change: Callable[[str], None] | None = None,
        on_delete: Callable[[str], None] | None = None,
    ) -> None:
        self._registry = registry
        self._on_change: Callable[[str], None] = on_change or (lambda _: None)
        self._on_delete: Callable[[str], None] = on_delete or (lambda _: None)
        self._observer = Observer()
        self._handler: _AlgoEventHandler | None = None
        self._started = False

    def start(self, watch_paths: list[str]) -> None:
        handler = _AlgoEventHandler(
            self._registry,
            self._on_change,
            self._on_delete,
        )
        self._handler = handler
        for path in watch_paths:
            abs_path = os.path.abspath(path)
            if os.path.isdir(abs_path):
                self._observer.schedule(handler, abs_path, recursive=True)
                logger.info("Watching: %s", abs_path)
            else:
                logger.warning("Watch path not found: %s", abs_path)
        self._observer.start()
        self._started = True
        logger.info("FileWatcher started.")

    def stop(self) -> None:
        if self._handler is not None:
            self._handler.cancel_timers()
        if self._started:
            self._observer.stop()
            self._observer.join(timeout=5)
            if self._observer.is_alive():
                logger.warning("FileWatcher observer did not stop within 5 seconds.")
            self._started = False
            logger.info("FileWatcher stopped.")
