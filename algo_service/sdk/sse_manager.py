"""
SSE (Server-Sent Events) manager: broadcast algorithm-change events to all connected clients.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator

logger = logging.getLogger(__name__)


class SSEManager:
    """Thread-safe (asyncio) broadcast queue manager."""

    def __init__(self) -> None:
        self._queues: list[asyncio.Queue[str]] = []

    def add_client(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=100)
        self._queues.append(queue)
        logger.info("SSE client connected. Total: %d", len(self._queues))
        return queue

    def remove_client(self, queue: asyncio.Queue[str]) -> None:
        try:
            self._queues.remove(queue)
        except ValueError:
            pass
        logger.info("SSE client disconnected. Total: %d", len(self._queues))

    def broadcast(self, data: dict) -> None:
        """Enqueue *data* for every connected client (non-blocking, drops slow clients)."""
        payload = json.dumps(data, ensure_ascii=False)
        stale: list[asyncio.Queue[str]] = []
        for queue in self._queues:
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                stale.append(queue)
        for queue in stale:
            self.remove_client(queue)

    async def event_stream(self, queue: asyncio.Queue[str]) -> AsyncIterator[str]:
        """Async generator yielding raw SSE ``data:`` lines."""
        try:
            while True:
                payload = await queue.get()
                yield f"data: {payload}\n\n"
        except asyncio.CancelledError:
            return


# Module-level singleton used by the router.
sse_manager = SSEManager()
