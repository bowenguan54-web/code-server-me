"""
algo_service.sdk.sse_manager — SSE 广播管理器
使用 asyncio.Queue 向所有连接的 SSE 客户端广播事件。
"""

import asyncio
import json
from typing import AsyncGenerator

# 全局订阅者队列池
_subscribers: list[asyncio.Queue] = []


def subscribe() -> asyncio.Queue:
    """注册一个新的 SSE 客户端队列"""
    q: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(q)
    return q


def unsubscribe(q: asyncio.Queue) -> None:
    """注销一个 SSE 客户端队列"""
    try:
        _subscribers.remove(q)
    except ValueError:
        pass


async def broadcast(event_type: str, data: dict) -> None:
    """向所有订阅者广播事件

    Args:
        event_type: 事件类型字符串，如 "algo_added" / "algo_removed" / "algo_updated"
        data: 事件数据 dict
    """
    payload = json.dumps({"type": event_type, "data": data}, ensure_ascii=False)
    dead: list[asyncio.Queue] = []
    for q in list(_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            dead.append(q)
    for q in dead:
        unsubscribe(q)


async def event_stream(q: asyncio.Queue) -> AsyncGenerator[str, None]:
    """生成 SSE 格式的事件流

    Usage::

        queue = subscribe()
        async for chunk in event_stream(queue):
            yield chunk
    """
    try:
        while True:
            try:
                payload = await asyncio.wait_for(q.get(), timeout=30.0)
                yield f"data: {payload}\n\n"
            except asyncio.TimeoutError:
                # 心跳，保持连接
                yield ": keep-alive\n\n"
    except asyncio.CancelledError:
        pass
    finally:
        unsubscribe(q)
