"""execute_raw.py – 原始 Python 代码执行端点"""
from __future__ import annotations

import asyncio
import json
import re
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from ..setup_env import get_registry  # type: ignore[import]

router = APIRouter(prefix="/api/v1", tags=["execute"])

_bearer = HTTPBearer(auto_error=False)

# 结果标记，脚本用 print 输出这一行来传递结构化返回值
_RESULT_MARKER = "__ALGOLIB_RESULT__:"


class ExecuteRequest(BaseModel):
    code: str = Field(..., description="要执行的 Python 代码")
    params: dict[str, Any] = Field(default_factory=dict, description="注入为局部变量的参数")
    timeout: float = Field(default=60.0, ge=1, le=300, description="超时秒数")


class ExecuteResponse(BaseModel):
    success: bool
    result: Any = None
    stdout: str = ""
    stderr: str = ""
    elapsed_ms: float = 0.0
    exit_code: int = 0


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

        # 异步运行子进程
        proc = await asyncio.create_subprocess_exec(
            "python3",
            str(tmp_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
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

        return ExecuteResponse(
            success=exit_code == 0,
            result=result,
            stdout=clean_stdout,
            stderr=stderr,
            elapsed_ms=elapsed_ms,
            exit_code=exit_code,
        )

    finally:
        if tmp_path and tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass
