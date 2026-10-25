from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import CurrentUser
from ..config import Settings, get_settings
from ..models import DocumentFacts
from ..ratelimit import upload_limit
from ..services.documents.extraction import extract
from ..services.documents.intake import RejectedFile, ScannerUnavailable, check_upload
from ..services.ingest.extractor import ALLOWED_DOCUMENTS
from ..services.rules import ApplicantProfile, ExtractedDocument

# Uploads are processed in memory and discarded. Nothing is written to storage until private
# Storage, ownership constraints and retention rules exist (see database-design.md).
router = APIRouter(prefix="/api/documents", tags=["documents"])


def read_upload(upload: UploadFile, settings: Settings) -> bytes:
    # One byte over the limit is enough to reject it; never read an unbounded file into memory.
    with upload.file as handle:
        return handle.read(settings.max_upload_mb * 1024 * 1024 + 1)


def process(upload: UploadFile, document_type: str, profile: ApplicantProfile, settings: Settings, today: date) -> tuple[ExtractedDocument, list[str], str]:
    """Validate, scan and read one upload. Raises HTTPException with a message safe for the applicant."""
    label = ALLOWED_DOCUMENTS.get(document_type)
    if label is None:
        raise HTTPException(status_code=422, detail="Unknown document type")
    data = read_upload(upload, settings)
    try:
        content_type = check_upload(data, settings)
        document, notes = extract(data, content_type, document_type, profile, today, settings.pdf_timeout_seconds, settings.ocr_timeout_seconds)
    except RejectedFile as exc:
        raise HTTPException(status_code=422, detail=f"{label}: {exc}") from exc
    except ScannerUnavailable as exc:
        raise HTTPException(status_code=503, detail="Document checking is unavailable right now. Please try again later.") from exc
    return document, notes, content_type


@router.post("/extract", response_model=DocumentFacts)
def extract_document(
    _user: Annotated[CurrentUser, Depends(upload_limit)],
    settings: Annotated[Settings, Depends(get_settings)],
    file: Annotated[UploadFile, File()],
    document_type: Annotated[str, Form(max_length=40)],
    full_name: Annotated[str, Form(max_length=200)] = "",
    address: Annotated[str, Form(max_length=300)] = "",
) -> DocumentFacts:
    """Show what we could read from one document, without deciding anything about it."""
    profile = ApplicantProfile(full_name=full_name, id_number="", address=address)
    document, notes, content_type = process(file, document_type, profile, settings, date.today())
    return DocumentFacts(document_type=document_type, content_type=content_type, issue_date=document.issue_date,
                         fields=document.fields or {}, notes=notes)
