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


class PublishAsComponentRequest(BaseModel):
    """Request body for publishing a template as a component draft."""

    name: str
    zh_name: str = ""
    new_namespace: str
    version: str = "1.0.0"
    category: str = ""
    description: str = ""
    zh_tags: list[str] = Field(default_factory=list)
    input_example: str = ""
    code: str = ""  # if provided, use this code instead of template source


class AlgorithmCreateRequest(BaseModel):
    """Request body for creating a single-file component or template."""

    name: str
    category: str
    category_zh_name: str = ""
    zh_name: str = ""
    zh_description: str = ""
    zh_tags: list[str] = Field(default_factory=list)
    version: str = "1.0.0"
    code: str
    module_kind: str = "component"
    publish_status: str = "draft"
    input_example: str = ""


class AlgorithmMetadataUpdateRequest(BaseModel):
    """Request body for editing algorithm metadata without changing business code."""

    zh_name: str | None = None
    zh_description: str | None = None
    zh_tags: list[str] | None = None
    version: str | None = None
    namespace: str | None = None
    input_example: str | None = None


class AlgorithmSourceSaveRequest(BaseModel):
    """Request body for saving a single-file algorithm source."""

    content: str


class CategoryUpdateRequest(BaseModel):
    """Request body for editing an algorithm category."""

    zh_name: str | None = None
    new_namespace: str | None = None


class CategoryCreateRequest(BaseModel):
    """Request body for creating a child category."""

    name: str
    zh_name: str = ""
    module_kind: str = "component"


class SnippetBase(BaseModel):
    """Shared fields for code snippet payloads."""

    name: str
    zh_name: str = ""
    body: str
    language: str = "python"
    tags: list[str] = Field(default_factory=list)
    scope: str = "private"
    version: str = "1.0"
    publish_status: str = "draft"


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
    publish_status: str | None = None


class SnippetResponse(SnippetBase):
    """Stored code snippet response model."""

    id: str
    created_at: str
    updated_at: str
    owner_id: str = "system"
    publish_status: str = "draft"
