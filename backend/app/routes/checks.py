from datetime import date, timedelta
from typing import Annotated
from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import CurrentUser, require_user
from ..config import Settings, get_settings
from ..models import ApplicationCheck
from ..ratelimit import upload_limit
from ..services.checker import run_check
from ..services.rules import ApplicantProfile, ExtractedDocument
from ..services.store import BursaryStore, get_store
from .documents import process

router = APIRouter(prefix="/api/checks", tags=["checks"])

_DEMO_APPLICATION_ID = UUID("00000000-0000-4000-8000-000000000001")
_RUN_NAMESPACE = UUID("3f0d8a52-6c1e-4b7a-9e2d-1a5c7b9e0f44")
_DEMO_PROFILE = ApplicantProfile(
    full_name="Thandi Nomvula Mokoena",
    id_number="8001015009087",
    address="12 Vilakazi Street Soweto 1804",
)


@router.get("/sample", response_model=ApplicationCheck)
def sample_check(
    bursary_id: UUID,
    _user: Annotated[CurrentUser, Depends(require_user)],
    store: Annotated[BursaryStore, Depends(get_store)],
) -> ApplicationCheck:
    """Demo only: checks a fixed fake submission against the stored requirements of any bursary."""
    requirement_set = store.get_requirements(bursary_id)
    if requirement_set is None:
        raise HTTPException(status_code=404, detail="Bursary not found")
    today = date.today()
    documents = [
        ExtractedDocument("id_document", today - timedelta(days=200), {
            "id_number": "8001015009087", "holder_name": "Thandi Nomvula Mokoena",
            "expiry_date": today + timedelta(days=900),
        }),
        ExtractedDocument("proof_of_residence", today - timedelta(days=30), {
            "holder_name": "T Mokoena", "address": "12 Vilakazi St Soweto",
        }),
        ExtractedDocument("academic_record", today - timedelta(days=60), {
            "holder_name": "Thandi Nomvula Mokoena", "academic_year": 2026, "average_percent": 54,
        }),
        ExtractedDocument("proof_of_income", today - timedelta(days=20), {"household_income_annual": 180_000}),
        # bank_confirmation is deliberately missing.
    ]
    return run_check(requirement_set, documents, _DEMO_PROFILE, _DEMO_APPLICATION_ID, today, demo_fixture=True)


@router.post("", response_model=ApplicationCheck)
def check_documents(
    user: Annotated[CurrentUser, Depends(upload_limit)],
    settings: Annotated[Settings, Depends(get_settings)],
    store: Annotated[BursaryStore, Depends(get_store)],
    bursary_id: Annotated[UUID, Form()],
    full_name: Annotated[str, Form(min_length=1, max_length=200)],
    document_types: Annotated[list[str], Form()],
    files: Annotated[list[UploadFile], File()],
    id_number: Annotated[str, Form(max_length=20)] = "",
    address: Annotated[str, Form(max_length=300)] = "",
) -> ApplicationCheck:
    """Read the applicant's documents and check them against a bursary's stored requirements.

    `document_types[i]` names what `files[i]` is. Files are read in memory and discarded; nothing is
    stored, so the returned application_id identifies this run only until applications are persisted.
    """
    requirement_set = store.get_requirements(bursary_id)
    if requirement_set is None:
        raise HTTPException(status_code=404, detail="Bursary not found")
    if len(files) != len(document_types) or not 0 < len(files) <= settings.max_files_per_check:
        raise HTTPException(status_code=422, detail=f"Send between 1 and {settings.max_files_per_check} files, each with a document type")
    if len(set(document_types)) != len(document_types):
        raise HTTPException(status_code=422, detail="Send one file per document type")
    today = date.today()
    profile = ApplicantProfile(full_name=full_name, id_number=id_number, address=address)
    documents = [process(f, t, profile, settings, today)[0] for f, t in zip(files, document_types)]
    application_id = uuid5(_RUN_NAMESPACE, f"{user.id}:{bursary_id}")
    return run_check(requirement_set, documents, profile, application_id, today)
