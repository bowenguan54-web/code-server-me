"""execute_raw.py – 原始 Python 代码执行端点"""
from __future__ import annotations

import asyncio
import json
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any

# 项目根目录（algo_service 的上两级）加入 PYTHONPATH，使 subprocess 能 import algo_service
_PROJECT_ROOT = str(Path(__file__).parent.parent.parent)

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from .algorithms import get_registry

router = APIRouter(prefix="/api/v1", tags=["execute"])

_bearer = HTTPBearer(auto_error=False)

# 结果标记，脚本用 print 输出这一行来传递结构化返回值
_RESULT_MARKER = "__ALGOLIB_RESULT__:"


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="要执行的 Python 代码")
    params: dict[str, Any] = Field(default_factory=dict, description="注入为局部变量的参数")
    timeout: float = Field(default=60.0, ge=1, le=300, description="超时秒数")


class ErrorLocation(BaseModel):
    line: int
    column: int = 0
    message: str
    type: str = "error"
    filename: str = ""


class ExecuteResponse(BaseModel):
    success: bool
    result: Any = None
    stdout: str = ""
    stderr: str = ""
    elapsed_ms: float = 0.0
    exit_code: int = 0
    errors: list[ErrorLocation] = Field(default_factory=list)


def _parse_traceback_errors(stderr: str, tmp_filename: str) -> list[dict]:
    """从 stderr 中解析 Python traceback，提取行号和错误信息。"""
    errors: list[dict] = []

    file_line_pattern = re.compile(
        r'File "([^"]*)",\s*line\s+(\d+)(?:,\s*in\s+\S+)?'
    )

    lines = stderr.strip().splitlines()

    # 找最后一个非空非 File/^ 开头的行作为错误消息
    error_message = ""
    for line in reversed(lines):
        stripped = line.strip()
        if stripped and not stripped.startswith("File ") and not stripped.startswith("^"):
            error_message = stripped
            break

    for match in file_line_pattern.finditer(stderr):
        filename = match.group(1)
        line_num = int(match.group(2))
        if tmp_filename in filename or filename == "<string>":
            errors.append({
                "line": line_num,
                "column": 0,
                "message": error_message,
                "type": "error",
                "filename": filename,
            })

    # SyntaxError: 从 ^ 符号提取列号
    syntax_match = re.search(r'^(\s*)\^', stderr, re.MULTILINE)
    if syntax_match and errors:
        errors[-1]["column"] = len(syntax_match.group(1))

    if not errors and error_message:
        errors.append({
            "line": 1,
            "column": 0,
            "message": error_message,
            "type": "error",
            "filename": "",
        })

    return errors


def _get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """简单 token 验证：检查 token 是否能被 registry 识别"""
    if not creds:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未提供认证 token")

    registry = get_registry()
    token = creds.credentials

    # 通过 registry 提供的 verify_token 验证
    try:
        user_id: str | None = registry.verify_token(token) if hasattr(registry, "verify_token") else None
    except Exception:
        user_id = None

    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="无效的 token")
    return user_id


@router.post("/execute-raw", response_model=ExecuteResponse)
async def execute_raw(
    req: ExecuteRequest,
    _user_id: str = Depends(_get_current_user),
) -> ExecuteResponse:
    """在沙箱中执行任意 Python 代码，捕获 stdout/stderr 和结构化返回值"""

    # 生成注入参数的前置代码
    params_code = ""
    if req.params:
        params_json = json.dumps(req.params, ensure_ascii=False)
        params_code = f"import json as _json\n_params = _json.loads({params_json!r})\nlocals().update(_params)\n"

    full_code = params_code + req.code

    # 写入临时文件
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".py",
            delete=False,
            encoding="utf-8",
            prefix="algolib_exec_",
        ) as f:
            f.write(full_code)
            tmp_path = Path(f.name)

        start = time.perf_counter()

        # 异步运行子进程（注入 PYTHONPATH 使代码可以 import algo_service）
        _env = os.environ.copy()
        _env["PYTHONPATH"] = _PROJECT_ROOT + (os.pathsep + _env["PYTHONPATH"] if _env.get("PYTHONPATH") else "")
        proc = await asyncio.create_subprocess_exec(
            "python3",
            str(tmp_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=_env,
            cwd=_PROJECT_ROOT,
        )

        try:
            stdout_b, stderr_b = await asyncio.wait_for(
                proc.communicate(), timeout=req.timeout
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.communicate()
            return ExecuteResponse(
                success=False,
                stderr=f"执行超时（>{req.timeout:.0f}s）",
                elapsed_ms=(time.perf_counter() - start) * 1000,
                exit_code=-1,
            )

        elapsed_ms = (time.perf_counter() - start) * 1000
        exit_code = proc.returncode or 0
        stdout = stdout_b.decode("utf-8", errors="replace")
        stderr = stderr_b.decode("utf-8", errors="replace")

        # 解析结构化结果
        result: Any = None
        clean_stdout_lines: list[str] = []
        for line in stdout.splitlines():
            if line.startswith(_RESULT_MARKER):
                payload = line[len(_RESULT_MARKER):]
                try:
                    result = json.loads(payload)
                except json.JSONDecodeError:
                    result = payload
            else:
                clean_stdout_lines.append(line)

        clean_stdout = "\n".join(clean_stdout_lines)

        # 解析 traceback 错误位置
        parsed_errors = _parse_traceback_errors(stderr, str(tmp_path)) if stderr else []

        # 修正行号偏移：减去参数注入代码的行数
        if params_code and parsed_errors:
            offset = params_code.count("\n")
            for err in parsed_errors:
                err["line"] = max(1, err["line"] - offset)

        return ExecuteResponse(
            success=exit_code == 0,
            result=result,
            stdout=clean_stdout,
            stderr=stderr,
            elapsed_ms=elapsed_ms,
            exit_code=exit_code,
            errors=[ErrorLocation(**e) for e in parsed_errors],
        )

    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
