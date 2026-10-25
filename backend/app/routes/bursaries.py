from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import CurrentUser, require_user
from ..models import Bursary, BursaryRequirements, RequirementSummary
from ..services.store import BursaryStore, get_store

router = APIRouter(prefix="/api/bursaries", tags=["bursaries"])


@router.get("", response_model=list[Bursary])
def list_bursaries(
    _user: Annotated[CurrentUser, Depends(require_user)],
    store: Annotated[BursaryStore, Depends(get_store)],
    year: Annotated[int | None, Query(ge=2024, le=2035)] = None,
    faculty: Annotated[str | None, Query(max_length=60)] = None,
    course: Annotated[str | None, Query(max_length=80)] = None,
    include_closed: bool = False,
) -> list[Bursary]:
    """Open or upcoming bursaries for the chosen study year, faculty and course."""
    return store.search(year=year, faculty=faculty, course=course, include_closed=include_closed)


@router.get("/{bursary_id}/requirements", response_model=BursaryRequirements)
def bursary_requirements(
    bursary_id: UUID,
    _user: Annotated[CurrentUser, Depends(require_user)],
    store: Annotated[BursaryStore, Depends(get_store)],
) -> BursaryRequirements:
    """What a bursary asks for, so the UI can show a checklist before any upload."""
    requirement_set = store.get_requirements(bursary_id)
    if requirement_set is None:
        raise HTTPException(status_code=404, detail="Bursary not found")
    return BursaryRequirements(
        bursary_id=bursary_id,
        requirement_version=requirement_set.version,
        requirements=[
            RequirementSummary(
                requirement_id=r.id, document_type=r.document_type, label=r.label, rule=r.rule_key, params=r.rule_params
            )
            for r in requirement_set.requirements
        ],
    )
