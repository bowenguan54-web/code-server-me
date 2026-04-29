"""
AST-based parser for extracting algorithm function metadata from Python source files.
"""

from __future__ import annotations

import ast
import re
import logging
from typing import Any

logger = logging.getLogger(__name__)


class AstParser:
    """Parses a Python source file and extracts top-level function definitions."""

    @staticmethod
    def extract_functions(file_path: str) -> list[dict]:
        """
        Return a list of function-info dicts for every top-level function in *file_path*.
        """
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                source = f.read()
        except OSError as exc:
            logger.error("Cannot read %s: %s", file_path, exc)
            return []

        try:
            tree = ast.parse(source, filename=file_path)
        except SyntaxError as exc:
            logger.error("Syntax error in %s: %s", file_path, exc)
            return []

        results: list[dict] = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                info = AstParser._extract_function_info(node, source)
                if info:
                    results.append(info)
        return results

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_function_info(
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        source: str,
    ) -> dict | None:
        func_name = node.name
        if func_name.startswith("_"):
            # Skip private/dunder helpers by convention.
            return None

        docstring = ast.get_docstring(node) or ""
        en_description = docstring.split("\n")[0].strip() if docstring else ""
        snippet_body = AstParser._get_source_segment(source, node)
        params = AstParser._extract_params(node, docstring)

        return_type = "Any"
        if node.returns is not None:
            try:
                return_type = ast.unparse(node.returns)
            except Exception:
                pass

        # Prefer @algo_meta decorator; fall back to docstring conventions.
        meta = AstParser._extract_algo_meta(node) or AstParser._parse_docstring_meta(
            docstring, func_name, en_description
        )

        return {
            "func_name": func_name,
            "en_description": en_description,
            "snippet_body": snippet_body,
            "params": params,
            "return_type": return_type,
            "zh_name": meta.get("zh_name") or func_name,
            "zh_description": meta.get("zh_description") or en_description,
            "zh_tags": meta.get("zh_tags") or [],
            "version": meta.get("version") or "1.0.0",
            "input_example": meta.get("input_example") or "",
        }

    @staticmethod
    def _get_source_segment(
        source: str,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
    ) -> str:
        """Return the verbatim source text of *node*."""
        segment = ast.get_source_segment(source, node)
        if segment:
            return segment
        # Fallback: use line numbers.
        lines = source.splitlines(keepends=True)
        start = node.lineno - 1
        end = getattr(node, "end_lineno", len(lines))
        return "".join(lines[start:end])

    @staticmethod
    def _extract_params(
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        docstring: str,
    ) -> list[dict]:
        args = node.args
        all_args = args.args
        num_defaults = len(args.defaults)
        offset = len(all_args) - num_defaults

        docstring_params = AstParser._parse_docstring_args(docstring)
        params: list[dict] = []
        for i, arg in enumerate(all_args):
            if arg.arg == "self":
                continue
            type_str = "Any"
            if arg.annotation is not None:
                try:
                    type_str = ast.unparse(arg.annotation)
                except Exception:
                    pass

            default_val: str | None = None
            default_idx = i - offset
            if default_idx >= 0:
                try:
                    default_val = ast.unparse(args.defaults[default_idx])
                except Exception:
                    default_val = "..."

            params.append(
                {
                    "name": arg.arg,
                    "type": type_str,
                    "default": default_val,
                    "description": docstring_params.get(arg.arg, ""),
                }
            )
        return params

    @staticmethod
    def _parse_docstring_args(docstring: str) -> dict[str, str]:
        """Parse Google-style or NumPy-style Args section from a docstring."""
        if not docstring:
            return {}

        params: dict[str, str] = {}
        lines = docstring.split("\n")
        in_args = False
        current_param: str | None = None

        for line in lines:
            stripped = line.strip()
            if stripped in ("Args:", "Arguments:", "Parameters:"):
                in_args = True
                current_param = None
                continue
            if in_args and stripped and not line[0:1].isspace() and stripped.endswith(":"):
                in_args = False
                current_param = None
                continue
            if not in_args:
                continue

            # Google style: "    param_name (Type): description"
            m = re.match(r"^\s+(\w+)\s*(?:\([^)]*\))?\s*:\s*(.*)", line)
            if m:
                current_param = m.group(1)
                params[current_param] = m.group(2).strip()
            elif current_param and stripped:
                params[current_param] = (params.get(current_param, "") + " " + stripped).strip()

        return params

    @staticmethod
    def _extract_algo_meta(
        node: ast.FunctionDef | ast.AsyncFunctionDef,
    ) -> dict | None:
        """Extract keyword arguments from an @algo_meta(...) decorator."""
        for decorator in node.decorator_list:
            if not isinstance(decorator, ast.Call):
                continue
            func = decorator.func
            name = func.id if isinstance(func, ast.Name) else (func.attr if isinstance(func, ast.Attribute) else "")
            if name != "algo_meta":
                continue
            meta: dict[str, Any] = {}
            for kw in decorator.keywords:
                if not kw.arg:
                    continue
                try:
                    meta[kw.arg] = ast.literal_eval(kw.value)
                except Exception:
                    try:
                        meta[kw.arg] = ast.unparse(kw.value)
                    except Exception:
                        pass
            return meta
        return None

    @staticmethod
    def _parse_docstring_meta(
        docstring: str,
        func_name: str,
        en_description: str,
    ) -> dict:
        """
        Lightweight convention parser: look for lines like::

            zh_name: 皮尔逊相关
            zh_desc: 计算两列的皮尔逊相关系数
            tags: 统计, 相关性
            version: 1.2.0
        """
        meta: dict[str, Any] = {
            "zh_name": func_name,
            "zh_description": en_description,
            "zh_tags": [],
            "version": "1.0.0",
        }
        if not docstring:
            return meta
        for line in docstring.split("\n"):
            s = line.strip()
            if s.startswith("zh_name:"):
                meta["zh_name"] = s[8:].strip()
            elif s.startswith("zh_desc:"):
                meta["zh_description"] = s[8:].strip()
            elif s.startswith("tags:"):
                meta["zh_tags"] = [t.strip() for t in s[5:].split(",") if t.strip()]
            elif s.startswith("version:"):
                meta["version"] = s[8:].strip()
        return meta
