export type CheckResultStatus = 'passed' | 'failed' | 'needs_confirmation' | 'not_applicable'
export interface AffectedReference { kind: 'field' | 'document'; identifier: string }
export interface CheckFinding {
  requirement_id: string
  result: CheckResultStatus
  affected: AffectedReference | null
  explanation: string
  suggested_fix: string | null
  source_reference: string | null
}
export interface ApplicationCheck {
  check_id: string
  application_id: string
  requirement_version: string
  findings: CheckFinding[]
  demo_fixture: boolean
}
export interface Profile { id: string; display_name: string | null; province: string | null }
export interface DocumentRecord { id: string; type: string; subject_id: string; processing_status: 'pending' | 'ready' | 'failed' }
export interface Bursary {
  id: string
  title: string
  funder: string
  deadline: string | null
  official_source_url: string
  // 'draft' means read by AI and not yet reviewed by a person; the UI must say so.
  status: string
  study_years: number[]
  faculties: string[]
  courses: string[]
  application_url: string | null
  // What it pays for: tuition, accommodation, books, meals, living_allowance, laptop, transport, vacation_work, employment
  covers: string[]
  unchecked_requirements: string[]
  review_notes: string[]
}
export interface RequirementSummary {
  requirement_id: string
  document_type: string
  label: string
  // 'present' means the document itself must be supplied; other keys are rules on that document.
  rule: string
  params: Record<string, unknown> | null
}
export interface BursaryRequirements { bursary_id: string; requirement_version: string; requirements: RequirementSummary[] }
export interface Application { id: string; bursary_id: string; status: 'preparing' | 'ready' | 'submitted' }
