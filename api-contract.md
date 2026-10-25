# Application-check API contract (proposed)

`backend/app/models.py` and `frontend/src/models.ts` define matching response shapes. There is no production check endpoint in this scaffold.

Future authenticated operations:

| Method and path | Meaning |
| --- | --- |
| `POST /api/applications/{application_id}/checks` | Start a check for an application owned by the token's user. Server chooses the published requirement version. |
| `GET /api/applications/{application_id}/checks/{check_id}` | Return an owned run and findings. |

Implemented now (authenticated, backed by `backend/data/bursaries.json` until Supabase replaces it):

| Method and path | Meaning |
| --- | --- |
| `GET /api/bursaries?year=2027&faculty=engineering&course=electrical` | Open or upcoming `Bursary` records; all filters optional, `include_closed=true` adds past deadlines. New `Bursary` fields: `status` (`draft` = read by AI, not reviewed by a person; the UI must say so), `study_years`, `faculties`, `courses`, `application_url`, `unchecked_requirements` (eligibility no document check can test) and `review_notes`. |
| `GET /api/bursaries/{bursary_id}/requirements` | `BursaryRequirements`: version plus each requirement (`requirement_id`, `document_type`, `label`, `rule`, `params`), so the UI can show a checklist before any upload. `404` if unknown. |
| `GET /api/checks/sample?bursary_id=...` | Demo check of a fixed fake submission against that bursary's stored requirements; always `demo_fixture: true`. |
| `POST /api/checks` (multipart) | Real document check. Fields: `bursary_id`, `full_name`, optional `id_number` and `address`, then repeated `document_types` and `files` in the same order (one file per type, at most 8). Returns `ApplicationCheck` with `demo_fixture: false`; files are read in memory and discarded. `404` unknown bursary, `413` too large, `422` with an applicant-safe `detail` for a rejected file, `429` rate limited, `503` no malware scanner available. |
| `POST /api/documents/extract` (multipart) | `file`, `document_type`, optional `full_name` and `address`. Returns `DocumentFacts`: what was read (`issue_date`, `fields`, `notes`), with no pass or fail. Same errors as above. |

Successful response `ApplicationCheck`: `check_id` UUID, `application_id` UUID, `requirement_version` immutable version string, `findings` array, and `demo_fixture` boolean. Each finding has `requirement_id` UUID; `result` in `passed`, `failed`, `needs_confirmation`, `not_applicable`; optional `affected` with `kind` (`field` or `document`) and identifier; plain-language `explanation`; optional `suggested_fix`; optional `source_reference` (official URL or citation). A real endpoint must set `demo_fixture: false`; any sample response must set it to `true` and be visibly labeled as a demo.

Operational: `GET /health` (process up) and `GET /health/ready` (`503` while no malware scanner is reachable). Every response carries `X-Request-ID`; a `500` includes it as a reference. Every `/api` route is limited to 240 requests per user per minute (`429`). Sign-in key outages return `503`, not `401`.

Saved applications and bookmarks are not API routes: the browser reads and writes them directly in Supabase (`application_checks`, `saved_bursaries`) under row-level security; see `supabase/migrations/0001_applications_and_saved.sql`.

Return `401` for missing/invalid authentication, `403` for access denied where revealing existence is acceptable (otherwise `404`), `404` for absent owned resources, `409` when requirements have no published version, and `422` for invalid requests. Errors should use a stable safe message and never include tokens, IDs from documents, private document text or signed URLs. The server derives owner identity from the verified JWT. Revalidate all document assignments and requirement versions inside the check transaction.

Eligibility findings must be presented separately from application completeness findings. `passed` means the supplied evidence satisfied a modeled rule, not that the funder accepted it. `needs_confirmation` covers ambiguous or missing evidence requiring human review. Neither a check nor OCR verifies authenticity or guarantees funding.
