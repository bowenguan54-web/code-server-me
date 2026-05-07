"""
FastAPI application entry point for the AlgoLib backend service.

Start with:
    uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.algorithms import external_router, router as algorithms_router, set_registry
from .routers.auth import router as auth_router
from .routers.packages import router as packages_router
from .routers.publish import router as publish_router
from .routers.snippets import router as snippets_router
from .routers.stubs import router as stubs_router
from .routers.submissions import router as submissions_router
from .routers.users import router as users_router
from .setup_env import ensure_algolib_installed
from .sdk.file_watcher import FileWatcher
from .sdk.registry import AlgorithmRegistry
from .sdk.sse_manager import sse_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── Config ─────────────────────────────────────────────────────────────────────


def _load_config() -> dict:
    config_path = Path(__file__).parent.parent / "config.yaml"
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as fh:
            return yaml.safe_load(fh) or {}
    return {}


_config = _load_config()

# ── Singletons ─────────────────────────────────────────────────────────────────

registry = AlgorithmRegistry()
_watcher: FileWatcher | None = None


# ── Lifespan ───────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _watcher

    ensure_algolib_installed()

    watch_dirs: list[str] = _config.get("watch_directories", [])
    if not watch_dirs:
        logger.warning("No watch_directories configured in config.yaml")

    base_dir = Path(__file__).parent.parent
    resolved: list[str] = []
    for d in watch_dirs:
        p = Path(d)
        if not p.is_absolute():
            p = base_dir / p
        resolved.append(str(p.resolve()))

    # Initial scan.
    for d in resolved:
        if os.path.isdir(d):
            try:
                registry.scan_directory(d)
                logger.info("Scanned %s → %d algorithms", d, registry.count)
            except Exception as exc:
                logger.error("Scan failed for %s: %s", d, exc)
        else:
            logger.warning("Watch directory not found: %s", d)

    # Broadcast callback for the file watcher.
    def _broadcast(file_path: str) -> None:
        sse_manager.broadcast(
            {"event": "updated", "file": file_path, "algorithms": registry.to_completion_json()}
        )

    # Start file watcher.
    if resolved:
        _watcher = FileWatcher(registry, on_change=_broadcast, on_delete=_broadcast)
        _watcher.start(resolved)

    yield

    # Shutdown.
    if _watcher is not None:
        _watcher.stop()


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="AlgoLib Service",
    version="1.0.0",
    description="Algorithm library backend service for the VSCode extension.",
    lifespan=lifespan,
)

# CORS – allow all origins by default (tighten for production).
cors_origins: list[str] = _config.get("cors_origins", ["*"])
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Wire registry into the router.
set_registry(registry)

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(submissions_router)
app.include_router(packages_router)
app.include_router(stubs_router)
app.include_router(snippets_router)
app.include_router(algorithms_router)
app.include_router(publish_router)
app.include_router(external_router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "algorithms": registry.count,
        "packages": registry.package_count,
        "watch_directories": registry.watch_roots,
    }
