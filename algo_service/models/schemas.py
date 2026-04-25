"""Pydantic schemas for the algorithm service API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


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


class SnippetBase(BaseModel):
    """Shared fields for code snippet payloads."""

    name: str
    zh_name: str = ""
    body: str
    language: str = "python"
    tags: list[str] = Field(default_factory=list)
    scope: str = "private"
    version: str = "1.0"


class SnippetCreate(SnippetBase):
    """Request body for creating a code snippet."""


class SnippetUpdate(BaseModel):
    """Request body for updating a code snippet."""

    name: str | None = None
    zh_name: str | None = None
    body: str | None = None
    language: str | None = None
    tags: list[str] | None = None
    scope: str | None = None
    version: str | None = None


class SnippetResponse(SnippetBase):
    """Stored code snippet response model."""

    id: str
    created_at: str
    updated_at: str
