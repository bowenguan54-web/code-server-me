"""param_inferrer.py — 自动推断参数输入控件类型，无需用户配置。"""
from __future__ import annotations

import re
from typing import Any

# 参数名关键词 → 控件类型
_NAME_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'image|img|photo|picture|pic|frame|thumbnail|avatar|icon', re.I), 'image'),
    (re.compile(r'images|imgs|photos|pictures|pics|frames|thumbnails', re.I), 'images'),
    (re.compile(r'audio|sound|wav|mp3|voice|speech', re.I), 'audio'),
    (re.compile(r'video|mp4|avi|clip|movie', re.I), 'video'),
    (re.compile(r'file|filepath|file_path|csv|excel|xlsx|xls|pdf|document|attachment', re.I), 'file'),
    (re.compile(r'^url$|^link$|^href$|^endpoint$', re.I), 'url'),
    (re.compile(r'^colou?r$|^bg_colou?r$|^fg_colou?r$', re.I), 'color'),
    (re.compile(r'date|time|datetime|timestamp', re.I), 'datetime'),
    (re.compile(r'password|secret|token|api_key|apikey', re.I), 'password'),
]

# 类型注解 → 控件类型
_TYPE_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'Image\.Image|PIL\.Image|ndarray|np\.ndarray', re.I), 'image'),
    (re.compile(r'\bbytes\b', re.I), 'file'),
    (re.compile(r'DataFrame|pd\.DataFrame', re.I), 'dataframe'),
    (re.compile(r'Literal\[', re.I), 'literal'),
    (re.compile(r'datetime|date', re.I), 'datetime'),
]


def infer_param_widget(param: dict[str, Any]) -> str:
    """根据参数的 name、type、default、description 自动推断前端控件类型。

    返回值：'int' | 'float' | 'str' | 'bool' | 'list' | 'dict' | 'dataframe' |
            'image' | 'images' | 'file' | 'audio' | 'video' | 'url' |
            'literal' | 'datetime' | 'color' | 'password' | 'json'
    """
    name = str(param.get("name", "")).strip()
    type_str = str(param.get("type", "Any")).strip()
    description = str(param.get("description", "")).strip().lower()

    # 1. 精确基础类型
    type_lower = type_str.lower()
    if type_lower == 'bool':
        return 'bool'
    if type_lower == 'int':
        return 'int'
    if type_lower in ('float', 'number'):
        return 'float'

    # 2. 类型注解中的复杂类型
    for pattern, widget in _TYPE_PATTERNS:
        if pattern.search(type_str):
            if widget == 'literal':
                return 'literal'
            return widget

    # 3. 基础结构类型
    if re.search(r'list\[dict\]|List\[Dict\]|list\[Dict\]|List\[dict\]', type_str):
        return 'dataframe'
    if re.search(r'\blist\b|\bList\b', type_str):
        for pattern, widget in _NAME_PATTERNS:
            if pattern.search(name) and widget in ('images', 'audio', 'video', 'file'):
                return widget
        return 'list'
    if re.search(r'\bdict\b|\bDict\b', type_str):
        return 'dict'

    # 4. str 或 Any 类型时，看参数名和描述
    if type_lower in ('str', 'any', ''):
        for pattern, widget in _NAME_PATTERNS:
            if pattern.search(name):
                return widget
        if any(kw in description for kw in ['图片', '图像', 'image', 'base64编码的图']):
            return 'image'
        if any(kw in description for kw in ['文件路径', 'file path', '上传文件']):
            return 'file'
        if any(kw in description for kw in ['音频', 'audio']):
            return 'audio'
        if any(kw in description for kw in ['视频', 'video']):
            return 'video'
        return 'str'

    # 5. 默认
    return 'str'


def infer_literal_options(type_str: str) -> list[str]:
    """从 Literal["a", "b", "c"] 注解中提取选项列表。"""
    match = re.search(r'Literal\[(.+)\]', type_str)
    if not match:
        return []
    inner = match.group(1)
    return re.findall(r'["\']([^"\']*)["\']', inner)


def enrich_params(params: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """为参数列表中每个参数附加 widget_hint 字段。"""
    enriched = []
    for param in params:
        param_copy = dict(param)
        widget = infer_param_widget(param_copy)
        param_copy["widget_hint"] = widget
        if widget == "literal":
            param_copy["widget_options"] = infer_literal_options(param_copy.get("type", ""))
        enriched.append(param_copy)
    return enriched
