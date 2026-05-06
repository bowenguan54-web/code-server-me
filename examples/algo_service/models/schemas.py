"""
algo_service.models.schemas — 统一响应模型
"""

from typing import Any, Optional
from pydantic import BaseModel, Field


class AlgoResponse(BaseModel):
    success: bool
    algo_id: str
    result: Any
    meta: dict = Field(default_factory=dict)
    error: Optional[str] = None


class AlgorithmInfo(BaseModel):
    name: str
    category: str
    description: str
    version: str
    inputs: dict[str, str]
    outputs: dict[str, str]
    source: str = "builtin"  # "builtin" | "custom"
    path: Optional[str] = None
