"""Dynamic Python type stub generation for the alg proxy object."""

from __future__ import annotations

import keyword
import re
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse

from .algorithms import get_registry
from ..sdk.auth_utils import get_current_user
from ..sdk.registry import AlgorithmEntry, AlgorithmRegistry

router = APIRouter(prefix="/api/v1", tags=["stubs"])


def _ident(value: str, fallback: str = "value") -> str:
    cleaned = re.sub(r"\W+", "_", value or "").strip("_")
    if not cleaned:
        cleaned = fallback
    if cleaned[0].isdigit():
        cleaned = f"_{cleaned}"
    if keyword.iskeyword(cleaned):
        cleaned = f"{cleaned}_"
    return cleaned


def _type_name(value: str | None) -> str:
    text = (value or "Any").strip()
    if not text or text == "...":
        return "Any"
    return text


def _default_value(value: str | None) -> str:
    if value is None or value == "":
        return ""
    text = str(value).strip()
    if text == "...":
        return " = None"
    return f" = {text}"


def _format_params(entry: AlgorithmEntry) -> str:
    params = []
    for param in entry.params:
        name = _ident(str(param.get("name") or "param"), "param")
        annotation = _type_name(param.get("type"))
        default = _default_value(param.get("default"))
        params.append(f"{name}: {annotation}{default}")
    return ", ".join(params)


def _docstring(entry: AlgorithmEntry) -> list[str]:
    tags = "、".join(entry.zh_tags)
    lines = [
        f'        """{entry.zh_name}',
        "",
        f"        {entry.zh_description or entry.en_description}",
    ]
    if tags:
        lines.extend(["", f"        标签: {tags}"])
    if entry.params:
        lines.extend(["", "        参数:"])
        for param in entry.params:
            pname = param.get("name", "param")
            ptype = param.get("type", "Any")
            pdesc = param.get("description", "")
            lines.append(f"        - {pname} ({ptype}): {pdesc}")
    lines.append('        """')
    return lines


def _generate_stub(registry: AlgorithmRegistry) -> str:
    grouped: dict[str, list[AlgorithmEntry]] = defaultdict(list)
    for entry in registry.get_all():
        grouped[entry.namespace].append(entry)

    lines = [
        "from collections.abc import Iterable",
        "from typing import Any",
        "",
        "",
    ]

    class_names: dict[str, str] = {}
    for namespace in sorted(grouped):
        class_name = f"_{_ident(namespace, 'namespace')}"
        class_names[namespace] = class_name
        lines.append(f"class {class_name}:")
        for entry in sorted(grouped[namespace], key=lambda item: item.func_name):
            func_name = _ident(entry.func_name, "algorithm")
            params = _format_params(entry)
            return_type = _type_name(entry.return_type)
            signature = f"    def {func_name}({params}) -> {return_type}:"
            lines.append("    @staticmethod")
            lines.append(signature)
            lines.extend(_docstring(entry))
            lines.append("        ...")
            lines.append("")
        if not grouped[namespace]:
            lines.append("    pass")
        lines.append("")

    lines.append("class _AlgProxy:")
    if class_names:
        for namespace, class_name in sorted(class_names.items()):
            lines.append(f"    {_ident(namespace, 'namespace')}: {class_name}")
    else:
        lines.append("    pass")
    lines.extend(["", "", "alg: _AlgProxy"])
    return "\n".join(lines) + "\n"


@router.get("/stubs/alg.pyi", response_class=PlainTextResponse)
async def get_alg_stub(registry: AlgorithmRegistry = Depends(get_registry)) -> PlainTextResponse:
    return PlainTextResponse(_generate_stub(registry), media_type="text/plain; charset=utf-8")


def _visible_completion_entries(entries: list[AlgorithmEntry], request: Request) -> list[AlgorithmEntry]:
    """Return public algorithms plus the current user's private algorithms."""

    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return [entry for entry in entries if entry.owner_id == "system"]
    try:
        user = get_current_user(request)
    except HTTPException:
        return [entry for entry in entries if entry.owner_id == "system"]
    if user.get("role") == "admin":
        return entries
    user_id = str(user.get("id", ""))
    return [entry for entry in entries if entry.owner_id == "system" or entry.owner_id == user_id]


@router.get("/stubs/completions")
async def get_completions(
    request: Request,
    registry: AlgorithmRegistry = Depends(get_registry),
) -> dict:
    """Return all algorithm entries as a JSON completion list for Monaco editor.

    Each item matches the shape expected by the frontend ``injectAlgCompletions``
    function: ``{ id, callPrefix, callSnippet, snippetBody, type, zhName,
    zhDescription, zhTags, enDescription, params, namespace, version,
    funcName, packageId, returnType }``.
    """
    entries = _visible_completion_entries(registry.get_all(), request)
    items = [
        {
            "id": entry.id if entry.owner_id == "system" else f"{entry.id}@@{entry.owner_id}",
            "registryId": entry.id,
            "callPrefix": entry.call_prefix,
            "callSnippet": entry.call_snippet,
            "snippetBody": entry.snippet_body,
            "type": entry.type,
            "moduleKind": entry.type,
            "zhName": entry.zh_name,
            "zhDescription": entry.zh_description,
            "zhTags": entry.zh_tags,
            "enDescription": entry.en_description,
            "params": entry.params,
            "namespace": entry.namespace,
            "version": entry.version,
            "ownerId": entry.owner_id,
            "owner_id": entry.owner_id,
            "visibility": "public" if entry.owner_id == "system" else "private",
            "privacyLabel": "公有" if entry.owner_id == "system" else "私有",
            "funcName": entry.func_name,
            "packageId": entry.package_id,
            "returnType": entry.return_type,
        }
        for entry in entries
    ]
    return {
        "success": True,
        "count": len(items),
        "items": items,
    }
