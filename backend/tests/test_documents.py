import io
import os
import socket
from pathlib import Path
import threading
from datetime import date
from uuid import uuid4

import pytest

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.auth import CurrentUser, require_user
from app.config import Settings, get_settings
from app.main import app
from app.ratelimit import RateLimit
from app.services.store import BursaryStore, get_store
from app.services.documents.extraction import extract
from app.services.documents.intake import RejectedFile, ScannerUnavailable, clamav_scan, sniff_type
from app.services.rules import ApplicantProfile

TODAY = date(2026, 10, 25)
PROFILE = ApplicantProfile("Thandi Nomvula Mokoena", "8001015009087", "12 Vilakazi Street Soweto 1804")
SAMPLE_ID = "b1a5c0de-0000-4000-8000-000000000002"


def make_jpeg(*lines: str) -> bytes:
    """A real JPEG photo of text lines (or a blank page), for the OCR path."""
    from PIL import Image, ImageDraw, ImageFont

    try:
        font = ImageFont.truetype("arial.ttf", 30)
    except OSError:
        font = ImageFont.load_default(size=30)
    image = Image.new("RGB", (900, 60 + 60 * len(lines)), "white")
    for i, line in enumerate(lines):
        ImageDraw.Draw(image).text((30, 20 + i * 60), line, fill="black", font=font)
    out = io.BytesIO()
    image.save(out, "JPEG", quality=85)
    return out.getvalue()


JPEG = make_jpeg()  # a blank photo: nothing to read
# Demo bursaries live in a test fixture so tests never depend on data ingested on this machine.
STORE = BursaryStore(seed_path=Path(__file__).parent / "fixtures" / "bursaries.json", ingested_path=Path("/nonexistent/ingested.json"))


def make_pdf(*lines: str) -> bytes:
    """A minimal one-page PDF with real text, so extraction is tested end to end."""
    escaped = [line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)") for line in lines]
    content = "BT /F1 11 Tf 50 760 Td 14 TL " + " ".join(f"({line}) '" for line in escaped) + " ET"
    objects = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
        f"<< /Length {len(content)} >>\nstream\n{content}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for number, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{number} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


ID_PDF = make_pdf(
    "REPUBLIC OF SOUTH AFRICA - IDENTITY DOCUMENT",
    "Identity Number: 800101 5009 087",
    "Surname: MOKOENA   Names: THANDI NOMVULA",
    "Date of birth: 1980-01-01",
    "Card valid until 15/03/2030",
    "Certified a true copy of the original. Date: 2026-09-15",
)


def test_sniff_type_trusts_content_not_names():
    assert sniff_type(ID_PDF, 10_000) == "application/pdf"
    assert sniff_type(JPEG, 10_000) == "image/jpeg"
    for data, message in ((b"", "empty"), (b"MZ\x90\x00 exe", "Only PDF"), (b"%PDF-" + b"x" * 200, "MB or smaller")):
        with pytest.raises(RejectedFile, match=message):
            sniff_type(data, 100)


def test_id_document_facts():
    document, notes = extract(ID_PDF, "application/pdf", "id_document", PROFILE, TODAY)
    assert document.get("id_number") == "8001015009087"
    assert document.get("holder_name") == "thandi nomvula mokoena"
    assert document.issue_date == date(2026, 9, 15)  # the certification date, not the birth date
    assert document.get("expiry_date") == date(2030, 3, 15)
    assert notes == []


def test_income_academic_and_unreadable_documents():
    payslip, notes = extract(make_pdf("PAYSLIP October 2026", "Statement date: 25 October 2026", "Gross pay R 12 500.00"),
                             "application/pdf", "proof_of_income", PROFILE, TODAY)
    assert payslip.get("household_income_annual") == 150_000 and payslip.issue_date == date(2026, 10, 25)
    assert "estimated" in notes[0]
    record, _ = extract(make_pdf("Statement of results", "Academic year 2026", "Overall average: 72 %"),
                        "application/pdf", "academic_record", PROFILE, TODAY)
    assert record.get("academic_year") == 2026 and record.get("average_percent") == 72
    photo, notes = extract(JPEG, "image/jpeg", "id_document", PROFILE, TODAY)
    assert photo.fields is None and notes
    with pytest.raises(RejectedFile, match="damaged"):
        extract(b"%PDF-1.4 garbage", "application/pdf", "id_document", PROFILE, TODAY)


def _clamd(reply: bytes) -> int:
    server = socket.socket()
    server.bind(("127.0.0.1", 0))
    server.listen(1)

    def serve():
        connection, _ = server.accept()
        with connection:
            data = b""
            while not data.endswith(b"\0\0\0\0"):
                data += connection.recv(65536)
            connection.sendall(reply)
        server.close()

    threading.Thread(target=serve, daemon=True).start()
    return server.getsockname()[1]


def test_clamav_scan_fails_closed():
    clamav_scan(ID_PDF, "127.0.0.1", _clamd(b"stream: OK\0"))
    with pytest.raises(RejectedFile):
        clamav_scan(ID_PDF, "127.0.0.1", _clamd(b"stream: Eicar-Test-Signature FOUND\0"))
    with pytest.raises(ScannerUnavailable):
        clamav_scan(ID_PDF, "127.0.0.1", _clamd(b"INSTREAM size limit exceeded. ERROR\0"))
    unused = socket.socket()
    unused.bind(("127.0.0.1", 0))
    port = unused.getsockname()[1]
    unused.close()
    with pytest.raises(ScannerUnavailable):
        clamav_scan(ID_PDF, "127.0.0.1", port, timeout=2)


def test_rate_limit_is_per_user():
    now = [0.0]
    limit = RateLimit(limit=2, window_seconds=60, clock=lambda: now[0])
    alice, bob = CurrentUser(id=uuid4()), CurrentUser(id=uuid4())
    limit(alice), limit(alice), limit(bob)
    with pytest.raises(HTTPException) as error:
        limit(alice)
    assert error.value.status_code == 429
    now[0] = 61
    limit(alice)


@pytest.fixture
def client():
    def use(**settings):
        app.dependency_overrides[get_settings] = lambda: Settings(supabase_url="https://example.supabase.co", **settings)
        app.dependency_overrides[require_user] = lambda: CurrentUser(id=uuid4())
        app.dependency_overrides[get_store] = lambda: STORE
        return TestClient(app)

    yield use
    app.dependency_overrides.clear()


def _check(client, files, **form):
    data = {"bursary_id": SAMPLE_ID, "full_name": PROFILE.full_name, "id_number": PROFILE.id_number,
            "document_types": [t for t, _ in files], **form}
    return client.post("/api/checks", data=data, files=[("files", (f"{t}.bin", body)) for t, body in files])


def test_check_endpoint_reads_real_documents(client):
    response = _check(client(allow_unscanned_uploads=True), [("id_document", ID_PDF), ("academic_record", JPEG)])
    assert response.status_code == 200
    body = response.json()
    assert body["demo_fixture"] is False and body["requirement_version"] == "sample-bursary-2026.1"
    results = [(f["affected"]["identifier"], f["result"]) for f in body["findings"]]
    id_results = {r for d, r in results if d == "id_document"}
    assert id_results == {"passed"}  # valid number, matches profile, name, certified within 90 days, not expired
    assert ("academic_record", "needs_confirmation") in results  # a photo cannot be read yet
    assert ("bank_confirmation", "failed") in results  # not uploaded
    assert response.headers["x-content-type-options"] == "nosniff"


def test_check_endpoint_fails_closed_and_validates(client):
    assert _check(client(), [("id_document", ID_PDF)]).status_code == 503  # no scanner configured
    c = client(allow_unscanned_uploads=True)
    rejected = _check(c, [("id_document", b"MZ not a document")])
    assert rejected.status_code == 422 and rejected.json()["detail"].startswith("Certified copy of ID:")
    assert _check(c, [("not_a_type", ID_PDF)]).status_code == 422
    assert _check(c, [("id_document", ID_PDF), ("id_document", ID_PDF)]).status_code == 422
    assert _check(c, [("id_document", ID_PDF)], bursary_id=str(uuid4())).status_code == 404


def test_oversized_request_is_refused_before_reading(client):
    c = client(allow_unscanned_uploads=True)
    response = c.post("/api/checks", content=b"x", headers={"content-length": str(10**9), "content-type": "multipart/form-data; boundary=x"})
    assert response.status_code == 413


def test_extract_endpoint_returns_facts_only(client):
    response = client(allow_unscanned_uploads=True).post(
        "/api/documents/extract", data={"document_type": "id_document", "full_name": PROFILE.full_name},
        files={"file": ("id.pdf", ID_PDF)})
    assert response.status_code == 200
    body = response.json()
    assert body["fields"]["id_number"] == "8001015009087" and body["issue_date"] == "2026-09-15"
    assert "result" not in body


def test_pdf_reading_is_time_limited(monkeypatch):
    from app.services.documents import extraction

    with pytest.raises(RejectedFile, match="too long"):
        extraction.pdf_text_bounded(ID_PDF, timeout=0)
    assert "800101 5009 087" in extraction.pdf_text_bounded(ID_PDF, timeout=30)


def test_production_refuses_unscanned_uploads_and_readiness_reflects_scanner(client):
    with pytest.raises(ValueError, match="ALLOW_UNSCANNED_UPLOADS"):
        Settings(supabase_url="https://example.supabase.co", environment="production", allow_unscanned_uploads=True)
    response = TestClient(app).get("/health/ready")
    assert response.status_code == 503 and "x-request-id" in response.headers


@pytest.mark.skipif(not __import__("app.services.documents.ocr", fromlist=["available"]).available(), reason="OCR not installed")
def test_photo_of_an_id_is_read_with_ocr():
    photo = make_jpeg("REPUBLIC OF SOUTH AFRICA", "Identity Number: 800101 5009 087",
                      "Surname: MOKOENA  Names: THANDI NOMVULA", "Certified a true copy. Date: 2026-09-15")
    document, notes = extract(photo, "image/jpeg", "id_document", PROFILE, TODAY)
    assert document.get("id_number") == "8001015009087"
    assert document.get("holder_name") == "thandi nomvula mokoena"
    assert document.issue_date == date(2026, 9, 15)
    assert "photo or scan" in notes[0]
    with pytest.raises(RejectedFile):
        extract(b"\xff\xd8\xff\xe0 not really a photo", "image/jpeg", "id_document", PROFILE, TODAY)


def test_demo_environment_allows_unscanned_but_hides_docs():
    from app.main import create_app

    demo = Settings(supabase_url="https://example.supabase.co", environment="demo", allow_unscanned_uploads=True)
    assert demo.allow_unscanned_uploads  # allowed outside production, e.g. a free judging host
    import app.main as main_module
    real = main_module.get_settings
    main_module.get_settings = lambda: demo
    try:
        client = TestClient(create_app())
        assert client.get("/docs").status_code == 404 and client.get("/openapi.json").status_code == 404
        assert client.get("/api/health").json() == {"status": "ok"}  # no sign-in needed to wake the host
    finally:
        main_module.get_settings = real


def test_supabase_url_accepts_the_rest_address_by_mistake():
    assert Settings(supabase_url="https://abcd.supabase.co/rest/v1/").supabase_url == "https://abcd.supabase.co"
    assert Settings(supabase_url=" https://abcd.supabase.co/ ").supabase_url == "https://abcd.supabase.co"
    with pytest.raises(ValueError):
        Settings(supabase_url="https://abcd.supabase.co/storage/v1/")


def _read(*lines, document_type="academic_record"):
    from app.services.documents.extraction import read_fields
    return read_fields("\n".join(lines), document_type, PROFILE, TODAY)


def test_two_different_averages_are_not_a_pass():
    document, notes = _read("Matric final results", "Overall average: 61%", "University first semester", "Average: 75%")
    assert document.get("average_percent") is None
    assert "more than one average (61%, 75%)" in notes[0]
    same, _ = _read("Average: 72%", "Your average this year: 72%")
    assert same.get("average_percent") == 72  # the same value twice is one average


def test_real_world_average_wordings():
    for line in ("Average for 2026: 72%", "Avg: 72%", "Average (%) 72", "AGGREGATE 72 %"):
        assert _read(line)[0].get("average_percent") == 72, line
    assert _read("Average mark 2026")[0].get("average_percent") is None  # a year is not an average


def test_real_world_income_wordings():
    payslip, notes = _read("Basic salary R12 500", document_type="proof_of_income")
    assert payslip.get("household_income_annual") == 150_000 and "12 times" in notes[0]
    grant, notes = _read("SASSA Child Support Grant: R560 per month", document_type="proof_of_income")
    assert grant.get("household_income_annual") == 6_720 and "grant" in notes[0]
    split, _ = _read("Annual household income: R 120 000", "2026", document_type="proof_of_income")
    assert split.get("household_income_annual") == 120_000  # the next line's number is not part of the amount


def test_real_world_year_wordings():
    assert _read("Grade 12 Final Results 2025")[0].get("academic_year") == 2025
    assert _read("Results of the November 2025 examinations")[0].get("academic_year") == 2025


def test_id_number_grouped_four_four_four_one():
    document, _ = _read("Identity number: 8001 0150 0908 7", document_type="id_document")
    assert document.get("id_number") == "8001015009087"
    document, _ = _read("ID: 800101-5009-08-7", document_type="id_document")
    assert document.get("id_number") == "8001015009087"
