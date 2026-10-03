from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=3)


class ParsedQuery(BaseModel):
    intent: Literal["change_detection", "unsupported"]
    target: str
    date_range: list[str]
    relation: str
    anchor: str
    radius_m: int
    filters: list[str]
    confidence: float


class AnalyzeRequest(BaseModel):
    query: str
    radius_m: int = 1000


class BufferRequest(BaseModel):
    center: list[float]
    radius_m: int


class ChatRequest(BaseModel):
    message: str
    radius_m: int = 1000


class ReportRequest(BaseModel):
    query: str
    radius_m: int = 1000


class ApiResponse(BaseModel):
    data: dict[str, Any]
