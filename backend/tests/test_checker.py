from datetime import date
from pathlib import Path
from uuid import UUID, uuid4

from app.models import CheckResultStatus as S
from app.services.checker import run_check
from app.services.requirements import requirement_set_from_spec
from app.services.store import BursaryStore, get_store
from app.services.rules import ApplicantProfile, ExtractedDocument, valid_sa_id

TODAY = date(2026, 10, 24)
SAMPLE_ID = UUID("b1a5c0de-0000-4000-8000-000000000002")
ISFAP_ID = UUID("b1a5c0de-0000-4000-8000-000000000001")
# Seed data only: tests must not depend on bursaries ingested on this machine.
FIXTURE = Path(__file__).parent / "fixtures" / "bursaries.json"
STORE = BursaryStore(seed_path=FIXTURE, ingested_path=Path("/nonexistent/ingested.json"))
SAMPLE_BURSARY = STORE.get_requirements(SAMPLE_ID)
PROFILE = ApplicantProfile("Thandi Nomvula Mokoena", "8001015009087", "12 Vilakazi Street Soweto 1804")


def _run(documents):
    check = run_check(SAMPLE_BURSARY, documents, PROFILE, uuid4(), TODAY)
    keys = {r.id: (r.document_type, r.rule_key) for r in SAMPLE_BURSARY.requirements}
    return {keys[f.requirement_id]: f.result for f in check.findings}


def _doc(doc_type, issue=None, **fields):
    return ExtractedDocument(doc_type, issue, fields)


def test_missing_documents_fail_once_each():
    results = _run([])
    assert set(results.values()) == {S.failed}
    assert len(results) == 5  # only the "present" requirement per document


def test_issue_date_rules():
    def residence(issue):
        return _run([_doc("proof_of_residence", issue, holder_name="Thandi Mokoena", address=PROFILE.address)])[
            ("proof_of_residence", "max_age")
        ]

    assert residence(date(2026, 6, 1)) == S.failed
    assert residence(date(2026, 10, 1)) == S.passed
    assert residence(None) == S.needs_confirmation
    assert residence(date(2026, 12, 1)) == S.needs_confirmation


def test_id_number_validation():
    assert valid_sa_id("8001015009087") is None
    assert "check digit" in valid_sa_id("8001015009080")
    assert "not 13 digits" in valid_sa_id("12345")
    assert "date of birth" in valid_sa_id("8013015009087")


def test_id_document_rules():
    ok = _run([_doc("id_document", date(2026, 9, 1), id_number="8001015009087", holder_name=PROFILE.full_name, expiry_date=date(2030, 1, 1))])
    assert {ok[("id_document", k)] for k in ("valid_id_number", "id_matches_profile", "name_matches_profile", "max_age", "not_expired")} == {S.passed}
    bad = _run([_doc("id_document", date(2026, 9, 1), id_number="8001015009080", holder_name="Someone Else", expiry_date=date(2025, 1, 1))])
    assert bad[("id_document", "valid_id_number")] == S.failed
    assert bad[("id_document", "id_matches_profile")] == S.failed
    assert bad[("id_document", "name_matches_profile")] == S.failed
    assert bad[("id_document", "not_expired")] == S.failed


def test_name_and_address_partial_matches_need_confirmation():
    r = _run([_doc("proof_of_residence", date(2026, 10, 1), holder_name="T Mokoena", address="12 Vilakazi St Soweto")])
    assert r[("proof_of_residence", "name_matches_profile")] == S.needs_confirmation
    assert r[("proof_of_residence", "address_matches_profile")] == S.needs_confirmation


def test_marks_year_and_income_limits():
    r = _run([
        _doc("academic_record", None, holder_name=PROFILE.full_name, academic_year=2025, average_percent=54),
        _doc("proof_of_income", date(2026, 10, 1), household_income_annual=400_000),
    ])
    assert r[("academic_record", "min_number")] == S.failed
    assert r[("academic_record", "field_equals")] == S.failed
    assert r[("proof_of_income", "max_number")] == S.failed
    r = _run([
        _doc("academic_record", None, holder_name=PROFILE.full_name, academic_year=2026, average_percent=72),
        _doc("proof_of_income", date(2026, 10, 1), household_income_annual=120_000),
    ])
    assert r[("academic_record", "min_number")] == S.passed
    assert r[("proof_of_income", "max_number")] == S.passed


def test_unreadable_fields_need_confirmation_and_ids_are_stable():
    r = _run([_doc("proof_of_income", date(2026, 10, 1))])
    assert r[("proof_of_income", "max_number")] == S.needs_confirmation
    check = run_check(SAMPLE_BURSARY, [], PROFILE, uuid4(), TODAY)
    assert check.requirement_version == "sample-bursary-2026.1"
    assert check.demo_fixture is False


def test_sample_endpoint_requires_login_and_is_labelled_demo():
    import os
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    from fastapi.testclient import TestClient

    from app.auth import CurrentUser, require_user
    from app.main import app

    client = TestClient(app)
    app.dependency_overrides[get_store] = lambda: STORE
    assert client.get(f"/api/checks/sample?bursary_id={SAMPLE_ID}").status_code == 401
    app.dependency_overrides[require_user] = lambda: CurrentUser(id=uuid4())
    try:
        body = client.get(f"/api/checks/sample?bursary_id={SAMPLE_ID}").json()
    finally:
        app.dependency_overrides.clear()
    assert body["demo_fixture"] is True
    results = {f["result"] for f in body["findings"]}
    assert results == {"passed", "failed", "needs_confirmation"}


def test_store_lists_bursaries_and_unknown_bursary_has_no_requirements():
    assert {b.title for b in STORE.list_bursaries()} == {"ISFAP Bursary", "Sample Provincial Bursary"}
    assert STORE.get_requirements(uuid4()) is None


def test_requirements_come_from_stored_data_per_bursary():
    isfap = STORE.get_requirements(ISFAP_ID)
    assert isfap.version == "isfap-draft-1"
    assert {r.document_type for r in isfap.requirements} == {"id_document", "academic_record", "proof_of_income"}
    check = run_check(isfap, [], PROFILE, uuid4(), TODAY)
    assert len(check.findings) == 3 and {f.result for f in check.findings} == {S.failed}


def test_unknown_rule_type_is_rejected():
    import pytest

    spec = {"version": "v", "documents": [{"document_type": "x", "label": "X", "rules": [{"type": "nope"}]}]}
    with pytest.raises(ValueError):
        requirement_set_from_spec(spec, None)


def test_bursary_endpoints():
    import os
    os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
    from fastapi.testclient import TestClient

    from app.auth import CurrentUser, require_user
    from app.main import app

    client = TestClient(app)
    assert client.get("/api/bursaries").status_code == 401
    app.dependency_overrides[require_user] = lambda: CurrentUser(id=uuid4())
    app.dependency_overrides[get_store] = lambda: STORE
    try:
        assert len(client.get("/api/bursaries").json()) == 2
        body = client.get(f"/api/bursaries/{ISFAP_ID}/requirements").json()
        assert body["requirement_version"] == "isfap-draft-1"
        assert client.get(f"/api/bursaries/{uuid4()}/requirements").status_code == 404
        assert client.get(f"/api/checks/sample?bursary_id={ISFAP_ID}").status_code == 200
        assert client.get(f"/api/checks/sample?bursary_id={uuid4()}").status_code == 404
    finally:
        app.dependency_overrides.clear()


def test_age_limit_is_checked_from_the_id_number():
    from app.services.rules import AgeLimit, age_from_id_number

    today = date(2026, 10, 26)
    assert age_from_id_number("8001015009087", today) == 46
    assert age_from_id_number("0501015009084", today) == 21  # 2005, not 1905
    doc = lambda n: ExtractedDocument("id_document", None, {"id_number": n})
    assert AgeLimit(18, 35).evaluate(doc("0501015009084"), PROFILE, today).result == S.passed
    assert AgeLimit(max_years=35).evaluate(doc("8001015009087"), PROFILE, today).result == S.failed
    assert AgeLimit(18, 35).evaluate(ExtractedDocument("id_document"), PROFILE, today).result == S.needs_confirmation
    spec = {"version": "v", "documents": [{"document_type": "id_document", "label": "ID", "rules": [{"type": "age_limit", "params": {"min_years": 18, "max_years": 35}}]}]}
    assert requirement_set_from_spec(spec, None).requirements[1].rule_key == "age_limit"
