"""
FastAPI application entry point for the AlgoLib backend service.

Start with:
    uvicorn algo_service.main:app --host 0.0.0.0 --port 8000 --reload
"""

from __future__ import annotations

import logging
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator
from uuid import uuid4

import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .routers.algorithms import external_router, router as algorithms_router, set_registry
from .routers.apikeys import find_key_by_value, is_expired, namespace_allowed, touch_key_last_used
from .routers.apikeys import router as apikeys_router
from .routers.monitor import record_call_log
from .routers.monitor import router as monitor_router
from .routers.packages import router as packages_router
from .routers.publish import router as publish_router
from .routers.snippets import router as snippets_router
from .routers.stubs import router as stubs_router
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


class ApiKeyMiddleware(BaseHTTPMiddleware):
    """Validate API keys, enforce rate limits, and log external API calls."""

    def __init__(self, app: FastAPI) -> None:
        """Initialize the middleware with an in-memory rate counter."""

        super().__init__(app)
        self._rate_counts: dict[str, dict[int, int]] = defaultdict(dict)

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        """Handle API key validation for /api/external/ requests."""

        if not request.url.path.startswith("/api/external/"):
            return await call_next(request)

        request_id = uuid4().hex
        namespace, function_name = self._parse_external_path(request.url.path)
        started = time.perf_counter()
        api_key_id: str | None = None

        failure = self._validate_request(request, namespace, function_name)
        if failure is not None:
            elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
            self._write_call_log(
                request_id=request_id,
                namespace=namespace,
                function_name=function_name,
                api_key_id=api_key_id,
                request=request,
                elapsed_ms=elapsed_ms,
                success=False,
                error_code=failure.status_code,
            )
            return failure

        key = getattr(request.state, "api_key", None)
        if isinstance(key, dict):
            api_key_id = str(key.get("id") or "")
            touch_key_last_used(api_key_id)

        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - started) * 1000, 3)
        self._write_call_log(
            request_id=request_id,
            namespace=namespace,
            function_name=function_name,
            api_key_id=api_key_id,
            request=request,
            elapsed_ms=elapsed_ms,
            success=response.status_code < 400,
            error_code=None if response.status_code < 400 else response.status_code,
        )
        response.headers["X-Request-ID"] = request_id
        return response

    def _parse_external_path(self, path: str) -> tuple[str, str]:
        """Extract namespace and function name from an external API path."""

        prefix = "/api/external/v1/"
        if not path.startswith(prefix):
            return "", ""
        parts = [part for part in path[len(prefix) :].strip("/").split("/") if part]
        if len(parts) < 2:
            return "", ""
        return parts[0], parts[1]

    def _validate_request(self, request: Request, namespace: str, function_name: str) -> JSONResponse | None:
        """Return a JSON error response when API key validation fails."""

        authorization = request.headers.get("Authorization", "")
        if not authorization.startswith("ApiKey "):
            return JSONResponse({"success": False, "detail": "Missing ApiKey authorization"}, status_code=401)
        key_value = authorization.removeprefix("ApiKey ").strip()
        try:
            key = find_key_by_value(key_value)
        except HTTPException as exc:
            return JSONResponse({"success": False, "detail": exc.detail}, status_code=exc.status_code)
        if key is None or key.get("status") != "active":
            return JSONResponse({"success": False, "detail": "API key is invalid or disabled"}, status_code=401)
        if is_expired(key):
            return JSONResponse({"success": False, "detail": "API key is expired"}, status_code=401)
        if not namespace_allowed(key, namespace, function_name):
            return JSONResponse({"success": False, "detail": "API key cannot call this namespace"}, status_code=403)
        if self._rate_limited(key):
            return JSONResponse({"success": False, "detail": "Rate limit exceeded"}, status_code=429)
        request.state.api_key = key
        return None

    def _rate_limited(self, key: dict[str, Any]) -> bool:
        """Increment the per-minute counter and report whether it exceeded the limit."""

        key_id = str(key.get("id") or "")
        limit = int(key.get("rate_limit") or 60)
        minute = int(time.time() // 60)
        bucket = self._rate_counts[key_id]
        for old_minute in list(bucket):
            if old_minute != minute:
                bucket.pop(old_minute, None)
        bucket[minute] = bucket.get(minute, 0) + 1
        return bucket[minute] > limit

    def _write_call_log(
        self,
        request_id: str,
        namespace: str,
        function_name: str,
        api_key_id: str | None,
        request: Request,
        elapsed_ms: float,
        success: bool,
        error_code: int | None,
    ) -> None:
        """Persist one external API call log entry."""

        try:
            record_call_log(
                {
                    "request_id": request_id,
                    "namespace": namespace,
                    "function_name": function_name,
                    "api_key_id": api_key_id,
                    "caller_ip": request.client.host if request.client else "",
                    "request_time": datetime.now(timezone.utc).isoformat(),
                    "elapsed_ms": elapsed_ms,
                    "success": success,
                    "error_code": error_code,
                }
            )
        except HTTPException as exc:
            logger.error("Failed to write call log: %s", exc.detail)


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
app.add_middleware(ApiKeyMiddleware)

# Wire registry into the router.
set_registry(registry)

app.include_router(packages_router)
app.include_router(stubs_router)
app.include_router(snippets_router)
app.include_router(publish_router)
app.include_router(apikeys_router)
app.include_router(monitor_router)
app.include_router(algorithms_router)
app.include_router(external_router)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "algorithms": registry.count,
        "packages": registry.package_count,
        "watch_directories": registry.watch_roots,
    }
