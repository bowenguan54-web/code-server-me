"""
algo_service.sdk.ast_parser — 静态 AST 分析
扫描 Python 文件，找出所有被 @algo_export 装饰的函数并提取元信息。
不需要导入目标模块，纯静态分析。
"""

import ast
from pathlib import Path
from typing import Optional


def _extract_string(node: ast.expr) -> Optional[str]:
    """从 AST 节点提取字符串常量"""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _extract_dict(node: ast.expr) -> dict[str, str]:
    """从 AST Dict 节点提取 {str: str} 字典"""
    if not isinstance(node, ast.Dict):
        return {}
    result: dict[str, str] = {}
    for k, v in zip(node.keys, node.values):
        key = _extract_string(k) if k is not None else None
        val = _extract_string(v) if v is not None else None
        if key and val:
            result[key] = val
    return result


def _is_algo_export(decorator: ast.expr) -> bool:
    """判断装饰器是否为 algo_export"""
    if isinstance(decorator, ast.Name) and decorator.id == "algo_export":
        return True
    if isinstance(decorator, ast.Call):
        func = decorator.func
        if isinstance(func, ast.Name) and func.id == "algo_export":
            return True
        if isinstance(func, ast.Attribute) and func.attr == "algo_export":
            return True
    return False


def _parse_algo_export_args(call: ast.Call) -> dict:
    """从 algo_export(...) 调用节点提取关键字参数"""
    meta: dict = {}
    kw_map = {kw.arg: kw.value for kw in call.keywords if kw.arg}
    if "category" in kw_map:
        meta["category"] = _extract_string(kw_map["category"]) or "custom"
    if "description" in kw_map:
        meta["description"] = _extract_string(kw_map["description"]) or ""
    if "version" in kw_map:
        meta["version"] = _extract_string(kw_map["version"]) or "1.0.0"
    if "inputs" in kw_map:
        meta["inputs"] = _extract_dict(kw_map["inputs"])
    if "outputs" in kw_map:
        meta["outputs"] = _extract_dict(kw_map["outputs"])
    return meta


def parse_file(file_path: str) -> list[dict]:
    """解析 Python 文件，返回所有 @algo_export 装饰函数的元信息列表

    返回每个元素格式::

        {
            "name": "my_kmeans",
            "category": "ml",
            "description": "...",
            "version": "1.0.0",
            "inputs": {},
            "outputs": {},
            "source": "custom",
            "path": "/abs/path/to/file.py",
            "lineno": 12,
        }
    """
    path = Path(file_path).resolve()
    try:
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
    except (OSError, SyntaxError):
        return []

    results: list[dict] = []
    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        for decorator in node.decorator_list:
            if not _is_algo_export(decorator):
                continue
            meta: dict = {
                "name": node.name,
                "category": "custom",
                "description": "",
                "version": "1.0.0",
                "inputs": {},
                "outputs": {},
                "source": "custom",
                "path": str(path),
                "lineno": node.lineno,
            }
            # 从 @algo_export(...) 参数提取
            if isinstance(decorator, ast.Call):
                meta.update(_parse_algo_export_args(decorator))
            # 如果没有 description，尝试从 docstring 提取首行
            if not meta["description"]:
                body = node.body
                if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant):
                    doc = body[0].value.value
                    if isinstance(doc, str):
                        meta["description"] = doc.strip().split("\n")[0]
            results.append(meta)
            break  # 每个函数只处理第一个 @algo_export
    return results
