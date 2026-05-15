"""lint.py – 实时语法检查端点"""
from __future__ import annotations

import ast
import json
import re
import subprocess
import tempfile
from pathlib import Path

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["lint"])


class LintRequest(BaseModel):
    code: str
    filename: str = "untitled.py"


class LintDiagnostic(BaseModel):
    line: int
    column: int = 0
    end_line: int | None = None
    end_column: int | None = None
    message: str
    severity: str = "error"  # "error" | "warning" | "info"
    source: str = "python"
    code: str = ""


class LintResponse(BaseModel):
    diagnostics: list[LintDiagnostic] = Field(default_factory=list)


@router.post("/lint", response_model=LintResponse)
async def lint_code(req: LintRequest) -> LintResponse:
    """多层 Python 代码检查：AST 语法 → pyflakes → ruff（可选）"""
    diagnostics: list[LintDiagnostic] = []

    # ── 第1层：AST 编译检查（SyntaxError） ──
    try:
        ast.parse(req.code, filename=req.filename)
    except SyntaxError as e:
        diagnostics.append(LintDiagnostic(
            line=e.lineno or 1,
            column=max(0, (e.offset or 1) - 1),
            end_line=getattr(e, "end_lineno", None),
            end_column=getattr(e, "end_offset", None),
            message=str(e.msg),
            severity="error",
            source="python",
            code="SyntaxError",
        ))
        return LintResponse(diagnostics=diagnostics)

    # ── 第2层：pyflakes 检查 ──
    try:
        import io
        import pyflakes.api as pf_api  # type: ignore[import]

        class _Collector:
            def __init__(self) -> None:
                self.items: list[str] = []

            def unexpectedError(self, filename: str, msg: str) -> None:
                pass

            def syntaxError(self, filename: str, msg: str, lineno: int, offset: int | None, text: str | None) -> None:
                pass

            def flake(self, msg: object) -> None:
                self.items.append(str(msg))

        collector = _Collector()
        pf_api.check(req.code, req.filename, reporter=collector)

        for item in collector.items:
            m = re.match(r"[^:]+:(\d+):(\d+):\s*(.*)", item)
            if m:
                diagnostics.append(LintDiagnostic(
                    line=int(m.group(1)),
                    column=max(0, int(m.group(2)) - 1),
                    message=m.group(3),
                    severity="warning",
                    source="pyflakes",
                ))
    except ImportError:
        pass

    # ── 第3层：ruff 检查（如果安装了） ──
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".py", delete=False, encoding="utf-8"
        ) as f:
            f.write(req.code)
            tmp = Path(f.name)

        result = subprocess.run(
            ["ruff", "check", "--output-format=json", "--no-fix", str(tmp)],
            capture_output=True, text=True, timeout=10,
        )
        if result.stdout.strip():
            for item in json.loads(result.stdout):
                loc = item.get("location", {})
                end_loc = item.get("end_location", {})
                diagnostics.append(LintDiagnostic(
                    line=loc.get("row", 1),
                    column=max(0, loc.get("column", 1) - 1),
                    end_line=end_loc.get("row") or None,
                    end_column=end_loc.get("column") or None,
                    message=item.get("message", ""),
                    severity="warning",
                    source="ruff",
                    code=item.get("code", ""),
                ))
        tmp.unlink(missing_ok=True)
    except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
        pass

    return LintResponse(diagnostics=diagnostics)
