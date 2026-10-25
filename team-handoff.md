# Team handoff

## Developer A — applicant experience

Own `frontend/src/pages`, navigation, profile forms, private document list, bursary discovery and application preparation. Connect pages to Supabase only after migrations and RLS review. Keep documents out of browser storage. Integrate the typed API client with token forwarding and show check findings with source links and clear uncertainty.

## Developer B — processing and checking

Own `backend/app/routes/documents.py`, `bursaries.py`, `applications.py`, `checks.py` and service modules added beneath `backend/app`. Implement curated, versioned requirements and the check engine. Add quarantined private uploads, validation, ClamAV scanning and bounded pypdf/Tesseract processing before any upload endpoint becomes available. Keep extraction facts distinct from acceptance decisions.

## Cybersecurity reviewer

Review authentication key configuration, issuer/audience/expiry checks, RLS, composite ownership constraints, private Storage policies, upload limits, malware fail-closed behavior, logging, error handling, CSP, retention and threat cases. Test cross-user links and token failures before enabling real data writes.

## Shared contracts and integration order

Coordinate changes to `frontend/src/models.ts`, `backend/app/models.py`, `docs/api-contract.md`, schema migrations and environment templates. Agree on requirement-set version IDs and error shapes before implementing endpoints.

1. Create migrations from `docs/database-design.md` and apply them in Supabase SQL Editor; commit the exact SQL to `supabase/migrations`.
2. Verify RLS, storage ownership and signing keys with two separate test users.
3. Implement profile and application persistence; add curated bursaries and immutable requirements.
4. Implement secure document ingestion and extraction; hold unscanned files in quarantine.
5. Connect check creation and retrieval with the shared models, then show results in the applicant UI.
6. Run end-to-end checks on distinct users, ambiguous evidence, changed requirements and expired documents. Verify that eligibility and completeness remain separate.
