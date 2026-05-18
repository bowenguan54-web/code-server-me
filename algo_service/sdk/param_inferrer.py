"""参数控件与输出渲染类型自动推断工具。"""

from __future__ import annotations

import re
from collections.abc import Iterable
from typing import Any


# 参数名关键词 -> 前端控件类型。注意：images 必须排在 image 前面。
_NAME_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"images|imgs|photos|pictures|pics|frames|thumbnails", re.I), "images"),
    (re.compile(r"image|img|photo|picture|pic|frame|thumbnail|avatar|icon", re.I), "image"),
    (re.compile(r"matrix|table|dataframe|df|csv_data|excel_data", re.I), "dataframe"),
    (re.compile(r"json_data|json_str|config|options|settings", re.I), "json"),
    (re.compile(r"text|content|body|message|prompt|query|sentence|paragraph", re.I), "text"),
    (re.compile(r"audio|sound|wav|mp3|voice|speech", re.I), "audio"),
    (re.compile(r"video|mp4|avi|clip|movie", re.I), "video"),
    (re.compile(r"file|filepath|file_path|csv|excel|xlsx|xls|pdf|document|attachment", re.I), "file"),
    (re.compile(r"^url$|^link$|^href$|^endpoint$", re.I), "url"),
    (re.compile(r"^colou?r$|^bg_colou?r$|^fg_colou?r$", re.I), "color"),
    (re.compile(r"date|time|datetime|timestamp", re.I), "datetime"),
    (re.compile(r"password|secret|token|api_key|apikey", re.I), "password"),
]


# 类型注解 -> 前端控件类型。
_TYPE_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"Image\.Image|PIL\.Image|ndarray|np\.ndarray", re.I), "image"),
    (re.compile(r"\bbytes\b", re.I), "file"),
    (re.compile(r"DataFrame|pd\.DataFrame", re.I), "dataframe"),
    (re.compile(r"Literal\[", re.I), "literal"),
    (re.compile(r"datetime|date", re.I), "datetime"),
]


def _split_top_level_types(type_text: str) -> list[str]:
    """按顶层逗号拆分泛型内部类型，避免拆坏嵌套泛型。"""

    parts: list[str] = []
    depth = 0
    start = 0
    for index, char in enumerate(type_text):
        if char == "[":
            depth += 1
        elif char == "]":
            depth = max(0, depth - 1)
        elif char == "," and depth == 0:
            parts.append(type_text[start:index].strip())
            start = index + 1
    tail = type_text[start:].strip()
    if tail:
        parts.append(tail)
    return parts


def _unwrap_optional_union(type_str: str) -> tuple[str, bool]:
    """解包 Optional[X] / Union[X, None]，返回真实类型和是否可空。"""

    text = (type_str or "Any").strip()
    optional_match = re.fullmatch(r"(?:typing\.)?Optional\[(.+)\]", text)
    if optional_match:
        return optional_match.group(1).strip(), True

    union_match = re.fullmatch(r"(?:typing\.)?Union\[(.+)\]", text)
    if union_match:
        parts = _split_top_level_types(union_match.group(1))
        nullable = any(part in {"None", "NoneType", "type(None)"} for part in parts)
        for part in parts:
            if part not in {"None", "NoneType", "type(None)"}:
                return part, nullable
        return "Any", nullable

    pipe_parts = [part.strip() for part in text.split("|")]
    if len(pipe_parts) > 1:
        nullable = any(part in {"None", "NoneType", "type(None)"} for part in pipe_parts)
        for part in pipe_parts:
            if part not in {"None", "NoneType"}:
                return part, nullable
        return "Any", nullable

    return text, False


def infer_param_widget(param: dict[str, Any]) -> str:
    """根据参数 name、type、default、description 自动推断前端控件类型。"""

    name = str(param.get("name", "")).strip()
    raw_type = str(param.get("type", "Any")).strip()
    type_str, _nullable = _unwrap_optional_union(raw_type)
    description = str(param.get("description", "")).strip().lower()

    type_lower = type_str.lower()
    if type_lower == "bool":
        return "bool"
    if type_lower == "int":
        return "int"
    if type_lower in ("float", "number"):
        return "float"

    for pattern, widget in _TYPE_PATTERNS:
        if pattern.search(type_str):
            return widget

    if re.search(r"list\[dict\]|List\[Dict\]|list\[Dict\]|List\[dict\]", type_str):
        return "dataframe"
    if re.search(r"\blist\b|\bList\b", type_str):
        for pattern, widget in _NAME_PATTERNS:
            if pattern.search(name) and widget in ("images", "audio", "video", "file"):
                return widget
        return "list"
    if re.search(r"\bdict\b|\bDict\b", type_str):
        return "dict"

    if type_lower in ("str", "any", ""):
        for pattern, widget in _NAME_PATTERNS:
            if pattern.search(name):
                return widget
        if any(kw in description for kw in ["图片", "图像", "image", "base64编码的图"]):
            return "image"
        if any(kw in description for kw in ["文件路径", "file path", "上传文件"]):
            return "file"
        if any(kw in description for kw in ["音频", "audio"]):
            return "audio"
        if any(kw in description for kw in ["视频", "video"]):
            return "video"
        return "str"

    return "str"


def infer_literal_options(type_str: str) -> list[str]:
    """从 Literal["a", "b", "c"] 注解中提取选项列表。"""

    match = re.search(r"Literal\[(.+)\]", type_str)
    if not match:
        return []
    inner = match.group(1)
    return re.findall(r"['\"]([^'\"]*)['\"]", inner)


def _is_base64_image(value: str) -> bool:
    """判断字符串是否像 base64 图片。"""

    text = "".join(str(value or "").split())
    if text.startswith("data:image/"):
        return True
    return len(text) > 100 and text.startswith(("/9j/", "iVBOR", "R0lGOD", "UklGR"))


def _is_html(value: str) -> bool:
    """判断字符串是否像 HTML。"""

    text = str(value or "").strip()
    return text.startswith("<") and re.search(r"</?[a-z][\s\S]*>", text, re.I) is not None


def _is_number_list(values: Iterable[Any]) -> bool:
    """判断列表元素是否全部为数字，bool 不作为图表数值。"""

    items = list(values)
    return bool(items) and all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in items)


def infer_output_widget(return_type: str, result_sample: Any = None) -> str:
    """根据返回类型注解和实际结果推断输出渲染方式。"""

    if result_sample is None or isinstance(result_sample, BaseException):
        return "error"

    type_text, _nullable = _unwrap_optional_union(str(return_type or "Any"))
    type_lower = type_text.lower()

    if isinstance(result_sample, str):
        if _is_base64_image(result_sample):
            return "image"
        if _is_html(result_sample):
            return "html"
        return "text"

    if isinstance(result_sample, list):
        if result_sample and all(isinstance(item, str) and _is_base64_image(item) for item in result_sample):
            return "images"
        if result_sample and all(isinstance(item, dict) for item in result_sample):
            return "table"
        if _is_number_list(result_sample):
            return "chart"
        return "json"

    if isinstance(result_sample, dict):
        keys = set(result_sample.keys())
        if "filename" in keys and ("content" in keys or "base64" in keys):
            return "file"
        if keys & {"x", "y", "labels", "values"}:
            return "chart"
        if result_sample.get("__output_type__") in {"table", "dataframe"}:
            return "table"
        if "dataframe" in type_lower or "pd.dataframe" in type_lower:
            return "table"
        return "json"

    if isinstance(result_sample, (int, float, bool)):
        return "text"

    return "mixed"


def enrich_params(
    params: list[dict[str, Any]],
    widget_overrides: dict[str, str] | None = None,
) -> list[dict[str, Any]]:
    """为参数列表中的每个参数附加 widget_hint / nullable 等前端提示字段。"""

    enriched: list[dict[str, Any]] = []
    overrides = widget_overrides or {}
    for param in params:
        param_copy = dict(param)
        _inner_type, nullable = _unwrap_optional_union(str(param_copy.get("type", "")))
        param_name = str(param_copy.get("name", "")).strip()
        override = str(overrides.get(param_name, "")).strip()
        widget = override or infer_param_widget(param_copy)
        param_copy["widget_hint"] = widget
        if nullable:
            param_copy["nullable"] = True
        if widget == "literal":
            param_copy["widget_options"] = infer_literal_options(str(param_copy.get("type", "")))
        enriched.append(param_copy)
    return enriched
