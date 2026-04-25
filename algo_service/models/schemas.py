"""Pydantic schemas for the algorithm service API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class AlgorithmParam(BaseModel):
    name: str
    type: str = "Any"
    default: str | None = None
    description: str = ""


class AlgorithmResponse(BaseModel):
    id: str
    callPrefix: str
    callSnippet: str
    snippetBody: str
    type: str
    zhName: str
    zhDescription: str
    zhTags: list[str]
    enDescription: str
    params: list[dict]
    namespace: str
    version: str


class AlgorithmsListResponse(BaseModel):
    success: bool
    count: int
    algorithms: list[AlgorithmResponse]


class ExecuteRequest(BaseModel):
    args: list[Any] = []
    kwargs: dict[str, Any] = {}


class ExecuteResponse(BaseModel):
    success: bool
    result: Any = None
    error: str = ""

    model_config = {"arbitrary_types_allowed": True}
