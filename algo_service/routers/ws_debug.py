"""WebSocket debugger endpoint: /ws/debug

Implements a web-based Python debugger using pdb under the hood.

Client → Server protocol:
  {"action": "start", "files": [...], "entry_file": "...", "entry_func": "...",
   "params": {...}, "breakpoints": {"filename": [line, ...]}}
  {"action": "next"|"step"|"continue"|"return"|"quit"|"restart"}
  {"action": "eval", "expression": "..."}
  {"action": "locals"}
  {"action": "stack"}

Server → Client protocol:
  {"type": "started"}
  {"type": "stopped", "file": "...", "line": N, "func": "...", "reason": "..."}
  {"type": "locals", "variables": [{"name","type","value","repr"}]}
  {"type": "stack", "frames": [{"file","line","func"}]}
  {"type": "eval_result", "expression": "...", "result": "...", "error": null}
  {"type": "output", "stream": "stdout"|"stderr", "data": "..."}
  {"type": "ended", "reason": "completed|error|timeout|cancelled", "exit_code": N, "elapsed_ms": N}
  {"type": "error", "message": "..."}
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import sys
import tempfile
import time
from pathlib import Path

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..sdk.auth_utils import decode_token, find_user_by_id

router = APIRouter(tags=["websocket"])

_PROJECT_ROOT = str(Path(__file__).parent.parent.parent)
_PDB_PROMPT = "__ALGOLIB_PDB__> "
_TIMEOUT = 120.0  # seconds

# pdb command to dump locals as JSON with a sentinel prefix
_LOCALS_CMD = (
    "!import json as _aljson; print('__ALGOLIB_LOCALS__:' + _aljson.dumps("
    "{k: {'type': type(v).__name__, 'repr': repr(v)[:200]}"
    " for k, v in locals().items() if not k.startswith('_')}"
    ", default=str, ensure_ascii=False))"
)


def _validate_ws_token(token: str) -> dict | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
        return find_user_by_id(payload.get("sub", ""))
    except Exception:
        return None


def _make_runner(tmpdir: str, entry_file_path: str, entry_func: str) -> str:
    """Generate the pdb runner script that will be launched as a subprocess.

    Uses pdb.run() with a code object compiled from the entry file so that
    ALL lines (including module-level) can have breakpoints.
    """
    return f'''\
import sys, json, ast as _ast, pdb as _pdb

sys.path.insert(0, {repr(tmpdir)})

with open(sys.argv[1]) as _f:
    _config = json.load(_f)

with open({repr(entry_file_path)}) as _f:
    _entry_src = _f.read()

_params = _config.get("params", {{}})

# Find the first executable line of the entry function via AST
# (avoids running the module before pdb is active)
_fn_first_line = None
try:
    _tree = _ast.parse(_entry_src)
    for _node in _ast.walk(_tree):
        if isinstance(_node, (_ast.FunctionDef, _ast.AsyncFunctionDef)) \
                and _node.name == {repr(entry_func)}:
            if _node.body:
                _fn_first_line = _node.body[0].lineno
            break
except Exception:
    pass


class _AlgoDebugger(_pdb.Pdb):
    # pdb.Pdb.__init__ explicitly sets self.prompt = "(Pdb) ", overriding class
    # attributes.  Must override in __init__ after calling super().
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.prompt = {repr(_PDB_PROMPT)}


_dbg = _AlgoDebugger(stdout=sys.stdout)
_bp_set = False
for _bp_file, _bp_lines in _config.get("breakpoints", {{}}).items():
    for _line in _bp_lines:
        try:
            _dbg.set_break(_bp_file, int(_line))
            _bp_set = True
        except Exception as _e:
            print(f"Warning: cannot set breakpoint {{_bp_file}}:{{_line}}: {{_e}}", flush=True)

# If no user breakpoints, set a synthetic breakpoint at the function entry line
# so auto-continue lands the user inside their function, not at an import.
if not _bp_set and _fn_first_line:
    try:
        _dbg.set_break({repr(entry_file_path)}, _fn_first_line)
    except Exception:
        pass

# Append the function call at the end of the source so pdb.run() traces the
# entire file (including module-level code) and then calls the function.
# Use chr(10) for newlines to avoid backslash-escape conflicts inside the
# outer f-string that generates this runner script.
import json as _jmod
_NL = chr(10)
_call_src = (
    _NL + _NL + "# === ALGOLIB_DEBUG_CALL (auto-generated) ===" + _NL
    + "__algolib_dbg_params = " + _jmod.dumps(_params) + _NL
    + {repr(entry_func)} + "(**__algolib_dbg_params)" + _NL
)
_combined = _entry_src + _call_src

# Compile with the ORIGINAL filename so set_break paths match co_filename.
_code_obj = compile(_combined, {repr(entry_file_path)}, "exec")
_glbls = {{"__name__": "__main__", "__file__": {repr(entry_file_path)}}}

try:
    _dbg.run(_code_obj, _glbls, _glbls)
except Exception as _exc:
    import traceback as _tb
    _tb.print_exc()
'''


def _resolve_filename(full_path: str, file_map: dict[str, str]) -> str:
    """Convert absolute temp path to relative filename."""
    full_norm = os.path.normpath(full_path)
    for rel_name, abs_path in file_map.items():
        if os.path.normpath(abs_path) == full_norm:
            return rel_name
    return os.path.basename(full_path)


def _parse_stopped_location(text: str) -> tuple[str, int, str] | None:
    """Parse pdb location line `> /path/file.py(N)func()`.
    Returns (full_path, line, func) or None.
    """
    m = re.search(r"^> (.+?)\((\d+)\)(\w+)\(\)", text, re.MULTILINE)
    if not m:
        return None
    return m.group(1), int(m.group(2)), m.group(3)


def _parse_locals_from_output(text: str) -> list[dict] | None:
    """Extract __ALGOLIB_LOCALS__: JSON from pdb output."""
    m = re.search(r"__ALGOLIB_LOCALS__:(.+)", text)
    if not m:
        return None
    try:
        raw = json.loads(m.group(1))
        return [
            {
                "name": k,
                "type": v.get("type", ""),
                "value": v.get("repr", ""),
                "repr": v.get("repr", ""),
            }
            for k, v in raw.items()
        ]
    except Exception:
        return None


def _parse_stack_from_output(text: str, file_map: dict[str, str]) -> list[dict]:
    """Parse pdb `w` (where) output into stack frames."""
    frames = []
    for m in re.finditer(r"(?:^[ >])\s*(.+?)\((\d+)\)(\w+)\(\)", text, re.MULTILINE):
        full_path = m.group(1).strip()
        frames.append(
            {
                "file": _resolve_filename(full_path, file_map),
                "line": int(m.group(2)),
                "func": m.group(3),
            }
        )
    return frames


def _extract_plain_output(text: str) -> str:
    """Remove pdb-internal lines; return printable program output."""
    lines = []
    for line in text.splitlines():
        stripped = line.lstrip()
        # Filter our custom prompt (and fallback standard prompt)
        if stripped.startswith(_PDB_PROMPT.rstrip()) or stripped == "(Pdb)" or stripped == "(Pdb) ":
            continue
        if re.match(r"^> .+\(\d+\)\w+\(\)", line):
            continue
        if line.startswith("-> "):
            continue
        if "--Call--" == line.strip() or "--Return--" == line.strip():
            continue
        if "__ALGOLIB_LOCALS__:" in line:
            continue
        lines.append(line)
    result = "\n".join(lines).strip()
    return result


@router.websocket("/ws/debug")
async def ws_debug(websocket: WebSocket, token: str = "") -> None:
    user = _validate_ws_token(token)
    if not user:
        await websocket.close(code=4001)
        return

    await websocket.accept()

    proc: asyncio.subprocess.Process | None = None
    tmpdir: str | None = None
    file_map: dict[str, str] = {}
    start_time: float = time.monotonic()
    saved_start_msg: dict | None = None

    # ── helpers ────────────────────────────────────────────────────────────────

    async def send_msg(msg: dict) -> None:
        try:
            await websocket.send_json(msg)
        except Exception:
            pass

    async def read_until_prompt(timeout: float = 10.0) -> tuple[str, bool]:
        """Read subprocess stdout until pdb prompt or EOF/timeout.
        Returns (text_before_prompt, is_eof).
        """
        nonlocal proc
        if proc is None:
            return "", True
        buf = ""
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return buf, False
            try:
                chunk = await asyncio.wait_for(
                    proc.stdout.read(4096),  # type: ignore[union-attr]
                    timeout=min(remaining, 0.3),
                )
                if not chunk:
                    return buf, True  # EOF
                buf += chunk.decode("utf-8", errors="replace")
                if _PDB_PROMPT in buf:
                    idx = buf.index(_PDB_PROMPT)
                    return buf[:idx], False
            except asyncio.TimeoutError:
                if deadline <= time.monotonic():
                    return buf, False

    async def send_pdb(cmd: str) -> None:
        nonlocal proc
        if proc and proc.stdin:
            try:
                proc.stdin.write((cmd + "\n").encode())
                await proc.stdin.drain()
            except Exception:
                pass

    async def kill_proc() -> None:
        nonlocal proc
        if proc:
            try:
                proc.kill()
                await asyncio.wait_for(proc.wait(), timeout=3.0)
            except Exception:
                pass
            proc = None

    async def cleanup_tmpdir() -> None:
        nonlocal tmpdir
        if tmpdir:
            shutil.rmtree(tmpdir, ignore_errors=True)
            tmpdir = None

    # ── start command ─────────────────────────────────────────────────────────

    async def do_start(msg: dict) -> bool:
        nonlocal proc, tmpdir, file_map, start_time, saved_start_msg
        saved_start_msg = msg
        await kill_proc()
        await cleanup_tmpdir()

        tmpdir = tempfile.mkdtemp(prefix="algolib_debug_")
        start_time = time.monotonic()
        file_map = {}

        files: list[dict] = msg.get("files", [])
        for f in files:
            rel: str = f["filename"]
            fp = os.path.join(tmpdir, rel)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            Path(fp).write_text(f["content"], encoding="utf-8")
            file_map[rel] = fp

        entry_file: str = msg.get("entry_file", files[0]["filename"] if files else "main.py")
        entry_func: str = msg.get("entry_func", "main")
        entry_fp = os.path.join(tmpdir, entry_file)

        # Convert relative bp filenames to absolute paths
        raw_bp: dict[str, list[int]] = msg.get("breakpoints", {})
        bp_full = {os.path.join(tmpdir, k): v for k, v in raw_bp.items()}

        params: dict = msg.get("params", {})

        config_path = os.path.join(tmpdir, "_dbg_config.json")
        Path(config_path).write_text(
            json.dumps({"breakpoints": bp_full, "params": params}),
            encoding="utf-8",
        )

        runner_path = os.path.join(tmpdir, "_debug_runner.py")
        Path(runner_path).write_text(
            _make_runner(tmpdir, entry_fp, entry_func),
            encoding="utf-8",
        )

        pp = _PROJECT_ROOT
        if os.environ.get("PYTHONPATH"):
            pp = _PROJECT_ROOT + os.pathsep + os.environ["PYTHONPATH"]
        env = {**os.environ, "PYTHONPATH": pp, "PYTHONUNBUFFERED": "1"}

        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            runner_path,
            config_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=tmpdir,
            env=env,
        )

        await send_msg({"type": "started"})
        return True

    # ── debug session loop ────────────────────────────────────────────────────

    async def run_debug_session() -> None:
        """Runs until the debug session ends (quit/complete/timeout/error)."""
        nonlocal proc

        # Initial read: pdb stops at first line (module line 1) due to stopframe=None.
        text, eof = await read_until_prompt(timeout=30.0)

        # Auto-continue past module-level setup to the first user/synthetic breakpoint.
        # This means the user sees their breakpoint directly rather than "stopped at line 1".
        if not eof:
            await send_pdb("c")
            text, eof = await read_until_prompt(timeout=30.0)

        while True:
            # Forward any plain program output
            plain = _extract_plain_output(text)
            if plain:
                await send_msg({"type": "output", "stream": "stdout", "data": plain + "\n"})

            if eof or proc is None:
                exit_code = proc.returncode if proc else 0
                elapsed = (time.monotonic() - start_time) * 1000
                await send_msg(
                    {
                        "type": "ended",
                        "reason": "completed",
                        "exit_code": exit_code or 0,
                        "elapsed_ms": elapsed,
                    }
                )
                await kill_proc()
                return

            if time.monotonic() - start_time > _TIMEOUT:
                await send_msg(
                    {
                        "type": "ended",
                        "reason": "timeout",
                        "exit_code": -1,
                        "elapsed_ms": _TIMEOUT * 1000,
                    }
                )
                await kill_proc()
                return

            # Check if pdb stopped at a location
            loc = _parse_stopped_location(text)
            if not loc:
                # Not stopped — program still running, read more output
                text, eof = await read_until_prompt(timeout=30.0)
                continue

            full_path, line_num, func_name = loc
            rel_file = _resolve_filename(full_path, file_map)

            await send_msg(
                {
                    "type": "stopped",
                    "file": rel_file,
                    "line": line_num,
                    "func": func_name,
                    "reason": "breakpoint",
                }
            )

            # Auto-query locals
            await send_pdb(_LOCALS_CMD)
            locals_text, _ = await read_until_prompt(timeout=5.0)
            vars_list = _parse_locals_from_output(locals_text)
            if vars_list is not None:
                await send_msg({"type": "locals", "variables": vars_list})

            # Auto-query stack
            await send_pdb("w")
            stack_text, _ = await read_until_prompt(timeout=5.0)
            frames = _parse_stack_from_output(stack_text, file_map)
            if frames:
                await send_msg({"type": "stack", "frames": frames})

            # ── Paused: accept client commands ────────────────────────────────
            while True:
                remaining = _TIMEOUT - (time.monotonic() - start_time)
                if remaining <= 0:
                    await send_msg(
                        {
                            "type": "ended",
                            "reason": "timeout",
                            "exit_code": -1,
                            "elapsed_ms": _TIMEOUT * 1000,
                        }
                    )
                    await kill_proc()
                    return

                try:
                    cmd_msg = await asyncio.wait_for(
                        websocket.receive_json(), timeout=min(remaining, 60.0)
                    )
                except asyncio.TimeoutError:
                    continue
                except (WebSocketDisconnect, Exception):
                    return

                action = cmd_msg.get("action", "")

                if action == "quit":
                    await send_pdb("q")
                    await asyncio.sleep(0.3)
                    elapsed = (time.monotonic() - start_time) * 1000
                    await send_msg(
                        {
                            "type": "ended",
                            "reason": "cancelled",
                            "exit_code": 0,
                            "elapsed_ms": elapsed,
                        }
                    )
                    await kill_proc()
                    return

                elif action == "restart":
                    if saved_start_msg:
                        await do_start(saved_start_msg)
                        text, eof = await read_until_prompt(timeout=30.0)
                        break  # Exit paused loop → outer while processes new text

                elif action == "eval":
                    expr = cmd_msg.get("expression", "").strip()
                    if not expr:
                        continue
                    await send_pdb(f"p {expr}")
                    eval_text, _ = await read_until_prompt(timeout=10.0)
                    result = _extract_plain_output(eval_text).strip()
                    error: str | None = None
                    if result.startswith("*** "):
                        error = result[4:]
                        result = None  # type: ignore[assignment]
                    await send_msg(
                        {
                            "type": "eval_result",
                            "expression": expr,
                            "result": result,
                            "error": error,
                        }
                    )

                elif action == "locals":
                    await send_pdb(_LOCALS_CMD)
                    ltext, _ = await read_until_prompt(timeout=5.0)
                    vlist = _parse_locals_from_output(ltext)
                    if vlist is not None:
                        await send_msg({"type": "locals", "variables": vlist})

                elif action == "stack":
                    await send_pdb("w")
                    stext, _ = await read_until_prompt(timeout=5.0)
                    sframes = _parse_stack_from_output(stext, file_map)
                    await send_msg({"type": "stack", "frames": sframes})

                elif action in ("next", "step", "continue", "return"):
                    cmd_map = {"next": "n", "step": "s", "continue": "c", "return": "r"}
                    await send_pdb(cmd_map[action])
                    text, eof = await read_until_prompt(timeout=30.0)
                    break  # Exit paused loop → outer while processes next stop

    # ── main WebSocket handler ────────────────────────────────────────────────

    try:
        while True:
            try:
                msg = await asyncio.wait_for(websocket.receive_json(), timeout=300.0)
            except asyncio.TimeoutError:
                break
            except (WebSocketDisconnect, Exception):
                break

            action = msg.get("action", "")

            if action == "start":
                ok = await do_start(msg)
                if ok:
                    await run_debug_session()
                    # After session ends, loop back to allow restart via a new "start"

            elif action == "quit":
                break

    except (WebSocketDisconnect, Exception):
        pass
    finally:
        await kill_proc()
        await cleanup_tmpdir()
