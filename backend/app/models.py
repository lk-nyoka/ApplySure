from datetime import date
from enum import Enum
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class CheckResultStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    needs_confirmation = "needs_confirmation"
    not_applicable = "not_applicable"


class AffectedReference(BaseModel):
    kind: str = Field(pattern="^(field|document)$")
    identifier: str


class CheckFinding(BaseModel):
    requirement_id: UUID
    result: CheckResultStatus
    affected: AffectedReference | None = None
    explanation: str
    suggested_fix: str | None = None
    source_reference: str | None = None


class Bursary(BaseModel):
    id: UUID
    title: str
    funder: str
    deadline: date | None = None
    official_source_url: str
    # "draft" means read by AI and not yet reviewed by a person; the UI must say so.
    status: str = "draft"
    study_years: list[int] = []
    faculties: list[str] = []
    courses: list[str] = []
    application_url: str | None = None
    # What it pays for, e.g. tuition, accommodation, books (fixed keys; see ingest/extractor.py COVERS).
    covers: list[str] = []
    # Eligibility conditions no document check can test (citizenship, field of study, ...) and
    # anything the AI read that could not be turned into a check.
    unchecked_requirements: list[str] = []
    review_notes: list[str] = []


class RequirementSummary(BaseModel):
    requirement_id: UUID
    document_type: str
    label: str
    rule: str
    params: dict[str, Any] | None = None


class BursaryRequirements(BaseModel):
    bursary_id: UUID
    requirement_version: str
    requirements: list[RequirementSummary]


class DocumentFacts(BaseModel):
    """What was read from one document. Observations only: no pass or fail here."""

    document_type: str
    content_type: str
    issue_date: date | None = None
    fields: dict[str, Any]
    notes: list[str]


class ApplicationCheck(BaseModel):
    check_id: UUID
    application_id: UUID
    requirement_version: str
    findings: list[CheckFinding]
    demo_fixture: bool = False
