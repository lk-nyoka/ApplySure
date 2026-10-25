# Proposed database design

This is a plan, not executable SQL. Use UUID primary keys. Store timestamps as `timestamptz`, dates as `date`, and reference Supabase `auth.users(id)` for the applicant. Add `created_at` and `updated_at` where useful. Store only necessary personal data and define retention and deletion before production.

| Table | Key fields and relationships | Ownership |
| --- | --- | --- |
| `profiles` | `id` PK and FK to `auth.users.id`; name, contact, province, consent timestamps | User owns row with `id = auth.uid()` |
| `education_records` | `id` PK, `owner_id` FK to `profiles.id`; institution, level, results and dates | Owner is applicant |
| `household_members` | `id` PK, `owner_id` FK to `profiles.id`; relationship, relevant circumstances | Owner is applicant; member is a distinct subject person |
| `documents` | `id` PK, `owner_id` FK to `profiles.id`; `subject_profile_id` nullable FK, `subject_household_member_id` nullable FK; type, private `storage_path`, issue/expiry dates, processing status, extracted fact version | Owner is uploader; exactly one subject reference, with owner checked for household member |
| `bursaries` | `id` PK; title, funder, cycle, deadline, official source URL, application URL, source last checked | Curated shared reference data |
| `bursary_requirements` | `id` PK; `bursary_id` FK, `version` identifier, kind (`eligibility` or `document`), rule, conditions, alternatives, source URL, effective dates | Curated, versioned reference data |
| `applications` | `id` PK, `owner_id` FK to `profiles.id`, `bursary_id` FK; status (`preparing`, `ready`, `submitted`), submission date | Owner is applicant; unique applicant, bursary and cycle as appropriate |
| `application_documents` | `id` PK, `owner_id`, `application_id`, `document_id` FKs; requirement assignment | Composite owner FKs ensure application and document have same owner |
| `application_checks` | `id` PK, `owner_id`, `application_id` FKs; run time, engine version, requirement-set version, status | Composite owner FK to application |
| `check_results` | `id` PK, `check_id` FK, `requirement_id` FK, result enum, affected reference, explanation, suggested fix, source reference | Inherits check ownership; requirement belongs to checked bursary/version |

Use `(id, owner_id)` unique constraints on owned parent tables and composite foreign keys `(application_id, owner_id)` and `(document_id, owner_id)` in `application_documents`. Apply the same pattern for household subjects in `documents`, checks in `application_checks`, and any child with an owner. A document subject must be either the owning profile or a household member owned by that profile. Enforce the exclusive subject choice with a check constraint. Validate requirement membership in the selected bursary/version when writing check results. This prevents cross-user joins even if an application or document UUID is guessed.

## Requirements and facts

Publish requirement sets as immutable versions. Editing a rule creates a new version and new rows; checks retain the exact set version and requirement IDs used. Block updates/deletes of published requirements, especially after any check references them. Capture source URL, access date and a content/source revision. A later correction never rewrites old findings; recheck using a new run.

Document processing stores observations such as name text, dates, marks, confidence and provenance under the owner's document. A bursary check separately decides whether those observations satisfy a particular requirement, with alternatives and `needs_confirmation` when evidence is ambiguous. Extracted text is untrusted and never proves authenticity.

## RLS and private Storage requirements

Enable RLS on every app table before client access. Owners may select and modify only their own records. Reference bursary data may be readable by authenticated users; only trusted curator processes can write it. Check results are readable only through their owning application. Restrict Storage to private buckets and paths scoped by verified `auth.uid()`; never issue public document URLs. Signed URLs should be short lived and never logged. Database constraints enforce ownership regardless of RLS, which is an additional access boundary. Test cross-user joins and storage access before enabling writes.

## Future document pipeline

Private quarantine → file type/size validation and ownership checks → ClamAV scanning → bounded pypdf or Tesseract extraction → structured document facts → bursary-specific checks. If scanning is unavailable, keep the item quarantined and unavailable to checks. Bound pages, bytes, time and OCR resources. Treat extracted text as untrusted input; never let it issue instructions to application code.
