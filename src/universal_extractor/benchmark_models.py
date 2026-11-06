"""Validated API and persistence models for Benchmark Lab v0.3."""
from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field, model_validator,field_validator
from datetime import datetime

from .categories import ContentCategory

RunStatus = Literal["QUEUED", "RUNNING", "AWAITING_EVALUATION", "COMPLETED", "FAILED", "CANCELLED"]
ResultState = Literal["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED", "CANCELLED"]
EvaluationState = Literal["PENDING", "PARTIAL", "VERIFIED", "PROVISIONAL", "INSUFFICIENT_EVIDENCE"]


class ReferenceInput(BaseModel):
    content: str = Field(min_length=1, max_length=500_000)
    metadata: dict[str, str] = Field(default_factory=dict)
    source: str = Field(default="manual", max_length=200)
    verified: bool = False
    notes: str | None = Field(default=None, max_length=2_000)
    verified_by: str | None = None
    verified_at: str | None = None


class BenchmarkRequest(BaseModel):
    url: str = Field(min_length=10, max_length=4096)
    engines: Literal["all_eligible"] | list[str] = "all_eligible"
    evaluation_mode: Literal["manual", "none", "openai"] = "manual"
    category: ContentCategory | None = None
    reference: ReferenceInput | None = None
    repetitions: int = Field(default=1, ge=1, le=5)
    dataset_version: str = Field(default="ad-hoc", min_length=1, max_length=100)
    tags: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_engine_list(self):
        if isinstance(self.engines, list) and not self.engines:
            raise ValueError("engines list cannot be empty")
        if self.evaluation_mode == "openai" and self.reference is None:
            raise ValueError("automated verified evaluation requires reference content")
        return self


class AIScoreInput(BaseModel):
    benchmark_id: str = Field(min_length=3, max_length=100)
    candidate_id: str = Field(pattern=r"^C-[a-f0-9]{12}$")
    fidelity: float | None = Field(default=None, ge=0, le=5,strict=True)
    completeness: float | None = Field(default=None, ge=0, le=5,strict=True)
    structure: float | None = Field(default=None, ge=0, le=5,strict=True)
    grounding: float | None = Field(default=None, ge=0, le=5,strict=True)
    total_ai_score: float | None = Field(default=None, ge=0, le=60,strict=True)
    missing_content: list[str] = Field(default_factory=list, max_length=100)
    unsupported_or_fabricated_claims: list[str] = Field(default_factory=list, max_length=100)
    evidence: list[str] = Field(default_factory=list, max_length=100)
    confidence: Literal["low", "medium", "high"]
    evaluation_status: Literal["VERIFIED", "PROVISIONAL", "INSUFFICIENT_EVIDENCE"]
    notes: str = Field(default="", max_length=5_000)
    evaluator_model: str | None = Field(default=None, max_length=200)
    evaluator_type: Literal['manual','api','unknown'] = 'manual'
    rubric_version: str = 'v0.3.0'
    review_session_id: str | None = Field(default=None,max_length=200)
    evaluated_at: str | None = None
    prompt_version: str = Field(default="chatgpt-v0.3", max_length=100)

    @field_validator('evaluated_at')
    @classmethod
    def validate_evaluated_at(cls,value):
        if value is not None and datetime.fromisoformat(value).tzinfo is None:
            raise ValueError('evaluated_at must be an ISO timestamp with timezone')
        return value

    @model_validator(mode="after")
    def validate_ratings(self):
        ratings = (self.fidelity, self.completeness, self.structure, self.grounding)
        if self.evaluation_status == "INSUFFICIENT_EVIDENCE":
            if any(value is not None for value in ratings) or self.total_ai_score is not None:
                raise ValueError("insufficient evidence must not contain numeric AI scores")
        elif any(value is None for value in ratings):
            raise ValueError("all four ratings are required for a scored evaluation")
        elif self.total_ai_score is None:
            raise ValueError("total_ai_score is required for a scored evaluation")
        elif not self.evidence:
            raise ValueError("at least one evidence statement is required for a scored evaluation")
        return self


class AIScoreImport(BaseModel):
    scores: list[AIScoreInput] = Field(min_length=1, max_length=1_000)


class DatasetEntry(BaseModel):
    url: str = Field(min_length=10, max_length=4096)
    category: ContentCategory
    reference_artifact: str | None = None
    expected_metadata: dict[str, str] = Field(default_factory=dict)
    permissions_notes: str | None = None
    expected_limitations: list[str] = Field(default_factory=list)
    tags: list[str] = Field(default_factory=list)
    reference_verified: bool = False
    reference_verifier: str | None = None
