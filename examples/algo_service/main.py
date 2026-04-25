"""
algo_service.main — FastAPI 应用入口
"""

import asyncio
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

# ── 确保 algolib 和 algo_service 包可以被正确导入 ──────────────────────────────
_EXAMPLES_DIR = Path(__file__).parent.parent.resolve()
if str(_EXAMPLES_DIR) not in sys.path:
    sys.path.insert(0, str(_EXAMPLES_DIR))

from algo_service.models.schemas import AlgorithmInfo
from algo_service.sdk.registry import registry
from algo_service.sdk.dynamic_router import load_file
from algo_service.sdk.sse_manager import subscribe, event_stream
from algo_service.sdk.file_watcher import AlgoFileWatcher
from algo_service.routers import (
    preprocess_router,
    statistics_router,
    ml_router,
    timeseries_router,
    signal_proc_router,
)

# ── 用户算法目录 ───────────────────────────────────────────────────────────────
USER_ALGO_DIR = Path(__file__).parent / "user_algorithms"
USER_ALGO_DIR.mkdir(exist_ok=True)

_watcher: AlgoFileWatcher = AlgoFileWatcher(str(USER_ALGO_DIR))


# ── 生命周期 ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时加载已有自定义算法
    loop = asyncio.get_event_loop()
    for py_file in USER_ALGO_DIR.glob("**/*.py"):
        if py_file.name.startswith("_"):
            continue
        load_file(str(py_file))
    # 启动文件监控
    _watcher.start(loop)
    yield
    # 关闭时停止监控
    _watcher.stop()


# ── 应用实例 ──────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AlgoService API",
    description="算法调用服务 — 内置算法 + 自定义算法热加载",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 内置算法路由 ──────────────────────────────────────────────────────────────
API_PREFIX = "/api/v1"

app.include_router(preprocess_router, prefix=API_PREFIX)
app.include_router(statistics_router, prefix=API_PREFIX)
app.include_router(ml_router, prefix=API_PREFIX)
app.include_router(timeseries_router, prefix=API_PREFIX)
app.include_router(signal_proc_router, prefix=API_PREFIX)


# ── 健康检查 ─────────────────────────────────────────────────────────────────
@app.get("/health", tags=["system"])
def health():
    return {"status": "ok", "custom_algo_count": registry.count()}


# ── 算法列表 ─────────────────────────────────────────────────────────────────
@app.get("/api/v1/algorithms", response_model=list[AlgorithmInfo], tags=["system"])
def list_algorithms():
    """返回当前已注册的所有自定义算法信息"""
    return registry.all()


@app.get("/api/v1/algorithms/count", tags=["system"])
def algo_count():
    return {"count": registry.count()}


# ── SSE 事件流（供编辑器插件订阅）─────────────────────────────────────────────
@app.get("/api/v1/events/algo-changes", tags=["events"])
async def algo_changes_stream():
    """Server-Sent Events 流，当自定义算法增删改时推送事件"""
    q = subscribe()

    async def generator():
        async for chunk in event_stream(q):
            yield chunk

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("algo_service.main:app", host="0.0.0.0", port=8000, reload=False)
