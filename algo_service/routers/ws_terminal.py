"""WebSocket endpoints: /ws/terminal (PTY shell) and /ws/execute (streamed code run)."""

from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
import traceback

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..sdk.auth_utils import decode_token, find_user_by_id

router = APIRouter(tags=["websocket"])


def _validate_ws_token(token: str) -> dict | None:
    """Return user dict if token is valid, else None."""
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub", "")
        return find_user_by_id(user_id)
    except Exception:
        return None


# ── /ws/terminal ─────────────────────────────────────────────────────────────


@router.websocket("/ws/terminal")
async def ws_terminal(websocket: WebSocket, token: str = "", cwd: str = "") -> None:
    """PTY-backed interactive bash terminal over WebSocket.

    Client → server messages (JSON):
        {"type": "input", "data": "<string>"}
        {"type": "resize", "rows": N, "cols": M}

    Server → client messages (JSON):
        {"type": "output", "data": "<string>"}
    """
    user = _validate_ws_token(token)
    if not user:
        await websocket.close(code=4001)
        return
    await websocket.accept()

    try:
        import fcntl
        import pty
        import struct
        import termios
    except ImportError as exc:
        await websocket.send_json(
            {"type": "output", "data": f"\r\n\x1b[31mPTY 模块不可用: {exc}\x1b[0m\r\n"}
        )
        try:
            await asyncio.wait_for(websocket.receive_text(), timeout=5)
        except Exception:
            pass
        return

    work_dir: str | None = cwd if (cwd and os.path.isdir(cwd)) else None
    env = {**os.environ, "TERM": "xterm-256color", "COLORTERM": "truecolor"}

    master_fd, slave_fd = pty.openpty()
    try:
        proc = await asyncio.create_subprocess_exec(
            "/bin/bash",
            "--login",
            "-i",
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            env=env,
            cwd=work_dir,
        )
    except Exception as exc:
        os.close(slave_fd)
        os.close(master_fd)
        await websocket.send_json(
            {"type": "output", "data": f"\r\n\x1b[31m无法启动 bash: {exc}\x1b[0m\r\n"}
        )
        return

    os.close(slave_fd)
    loop = asyncio.get_event_loop()

    async def _read_output() -> None:
        while True:
            try:
                data = await loop.run_in_executor(None, lambda: os.read(master_fd, 4096))
                if not data:
                    break
                await websocket.send_json(
                    {"type": "output", "data": data.decode("utf-8", errors="replace")}
                )
            except OSError:
                break
            except Exception:
                break

    output_task = asyncio.create_task(_read_output())
    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=1800)
            except asyncio.TimeoutError:
                break
            msg_type = msg.get("type")
            if msg_type == "input":
                raw = msg.get("data", "")
                if raw:
                    os.write(master_fd, raw.encode("utf-8", errors="replace"))
            elif msg_type == "resize":
                rows = max(1, int(msg.get("rows", 24)))
                cols = max(1, int(msg.get("cols", 80)))
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                try:
                    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
                except OSError:
                    pass
    except WebSocketDisconnect:
        pass
    finally:
        output_task.cancel()
        try:
            proc.kill()
        except Exception:
            pass
        try:
            os.close(master_fd)
        except Exception:
            pass


# ── /ws/execute ──────────────────────────────────────────────────────────────


@router.websocket("/ws/execute")
async def ws_execute(websocket: WebSocket, token: str = "") -> None:
    """Execute Python code snippets and stream stdout/stderr back.

    Client → server messages (JSON):
        {"action": "run",    "code": "<python source>"}
        {"action": "cancel"}

    Server → client messages (JSON):
        {"type": "stdout",  "data": "<line>"}
        {"type": "stderr",  "data": "<line>"}
        {"type": "result",  "success": bool, "exit_code": int,
         "elapsed_ms": float, "result": null, "error": str|null}
    """
    user = _validate_ws_token(token)
    if not user:
        await websocket.close(code=4001)
        return
    await websocket.accept()

    current_proc: asyncio.subprocess.Process | None = None

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=3600)
            except asyncio.TimeoutError:
                break

            action = msg.get("action")

            if action == "cancel":
                if current_proc is not None:
                    try:
                        current_proc.kill()
                    except Exception:
                        pass
                continue

            if action != "run":
                continue

            code: str = msg.get("code", "")
            if not code.strip():
                await websocket.send_json(
                    {"type": "result", "success": False, "error": "代码不能为空", "elapsed_ms": 0}
                )
                continue

            tmp_path = ""
            try:
                with tempfile.NamedTemporaryFile(
                    mode="w", suffix=".py", delete=False, encoding="utf-8"
                ) as fh:
                    fh.write(code)
                    tmp_path = fh.name

                started = time.perf_counter()
                proc = await asyncio.create_subprocess_exec(
                    sys.executable,
                    tmp_path,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                current_proc = proc

                async def _stream_stdout() -> None:
                    assert proc.stdout is not None
                    while True:
                        line = await proc.stdout.readline()
                        if not line:
                            break
                        await websocket.send_json(
                            {"type": "stdout", "data": line.decode("utf-8", errors="replace")}
                        )

                async def _stream_stderr() -> None:
                    assert proc.stderr is not None
                    while True:
                        line = await proc.stderr.readline()
                        if not line:
                            break
                        await websocket.send_json(
                            {"type": "stderr", "data": line.decode("utf-8", errors="replace")}
                        )

                try:
                    await asyncio.wait_for(
                        asyncio.gather(_stream_stdout(), _stream_stderr()),
                        timeout=60.0,
                    )
                except asyncio.TimeoutError:
                    try:
                        proc.kill()
                    except Exception:
                        pass
                    elapsed = (time.perf_counter() - started) * 1000
                    await websocket.send_json(
                        {
                            "type": "result",
                            "success": False,
                            "error": "执行超时（60 秒）",
                            "elapsed_ms": elapsed,
                        }
                    )
                    continue

                await proc.wait()
                elapsed = (time.perf_counter() - started) * 1000
                await websocket.send_json(
                    {
                        "type": "result",
                        "success": proc.returncode == 0,
                        "exit_code": proc.returncode,
                        "elapsed_ms": round(elapsed, 1),
                        "result": None,
                    }
                )

            except Exception as exc:
                await websocket.send_json(
                    {
                        "type": "result",
                        "success": False,
                        "error": str(exc),
                        "traceback": traceback.format_exc(),
                        "elapsed_ms": 0,
                    }
                )
            finally:
                current_proc = None
                if tmp_path:
                    try:
                        os.unlink(tmp_path)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        if current_proc is not None:
            try:
                current_proc.kill()
            except Exception:
                pass
