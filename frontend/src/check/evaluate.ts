import type { ApplicationCheck, Bursary, BursaryRequirements, CheckFinding, RequirementSummary } from '../models'
import { formatRand } from '../lib/format'

// A self-reported pre-check: it compares what the applicant told us with a bursary's published
// requirements. It reads no documents, so it can never confirm authenticity or promise funding.

export type DocumentMark = 'available' | 'missing' | 'unsure'
export type ItemStatus = 'passed' | 'failed' | 'needs_review'
export type EligibilityStatus = 'eligible' | 'not_eligible' | 'needs_review'
export type CompletenessStatus = 'complete' | 'incomplete' | 'needs_review'

export interface Basics { fullName: string; studentNumber: string; institution: string; course: string; levelOfStudy: string; yearOfStudy: string }
export interface EligibilityAnswers {
  fundingYear: string
  faculty: string
  annualIncome: string
  averagePercent: string
  citizenship: string
  academicStanding: string
  institutionType: string
  specialCircumstances: string
}
export interface DocumentAnswer { mark?: DocumentMark; note: string; uploadId?: string }

export interface CheckFormState {
  bursaryId: string
  basics: Basics
  eligibility: EligibilityAnswers
  documents: Record<string, DocumentAnswer>
}

export interface ResultItem { id: string; label: string; status: ItemStatus; detail: string }
export interface DocumentItem extends ResultItem { documentType: string; conditions: string[]; note: string }

export interface CheckResult {
  createdAt: string
  bursary: Bursary
  requirementVersion: string
  eligibility: { status: EligibilityStatus; items: ResultItem[] }
  completeness: { status: CompletenessStatus; percent: number; items: DocumentItem[]; missingItems: string[] }
  nextStep: { title: string; detail: string }
}

export const emptyForm = (bursaryId = '', basics?: Partial<Basics>): CheckFormState => ({
  bursaryId,
  basics: { fullName: '', studentNumber: '', institution: '', course: '', levelOfStudy: '', yearOfStudy: '', ...basics },
  eligibility: { fundingYear: String(new Date().getFullYear() + 1), faculty: '', annualIncome: '', averagePercent: '', citizenship: '', academicStanding: '', institutionType: '', specialCircumstances: '' },
  documents: {},
})

// Rules that decide whether someone may apply at all. Everything else is about the documents.
const ELIGIBILITY_RULES = new Set(['min_number', 'max_number'])

export const isEligibilityRule = (rule: string) => ELIGIBILITY_RULES.has(rule)

const declaredFields: Record<string, { answer: keyof EligibilityAnswers; format: (n: number) => string }> = {
  average_percent: { answer: 'averagePercent', format: n => `${n}%` },
  household_income_annual: { answer: 'annualIncome', format: formatRand },
}

export function describeCondition(req: RequirementSummary): string | null {
  const p = req.params ?? {}
  switch (req.rule) {
    case 'max_age': return `Dated or certified within the last ${p.max_days} days`
    case 'not_expired': return 'Still valid (not expired)'
    case 'valid_id_number': return 'Shows a valid 13-digit South African ID number'
    case 'age_limit': return p.min_years && p.max_years ? `You must be ${p.min_years} to ${p.max_years} years old (checked from your ID number)`
      : p.max_years ? `You must be ${p.max_years} or younger (checked from your ID number)` : `You must be at least ${p.min_years} (checked from your ID number)`
    case 'id_matches_profile': return 'ID number matches the one you give the funder'
    case 'name_matches_profile': return 'In your own name, spelled as on your application'
    case 'address_matches_profile': return 'Address matches the one on your application'
    case 'field_equals': return `${String(p.label ?? 'Value')} must be ${String(p.expected)}`
    default: return null
  }
}

/** Unique document types in requirement order, each with its document-level conditions. */
export function documentChecklist(requirements: BursaryRequirements) {
  const docs = new Map<string, { documentType: string; label: string; conditions: string[] }>()
  for (const req of requirements.requirements) {
    const entry = docs.get(req.document_type) ?? { documentType: req.document_type, label: req.label, conditions: [] }
    docs.set(req.document_type, entry)
    const condition = isEligibilityRule(req.rule) ? null : describeCondition(req)
    if (condition) entry.conditions.push(condition)
  }
  return [...docs.values()]
}

function evaluateThreshold(req: RequirementSummary, answers: EligibilityAnswers): ResultItem {
  const p = req.params ?? {}
  const field = String(p.field ?? '')
  const label = String(p.label ?? field)
  const limit = Number(req.rule === 'min_number' ? p.minimum : p.maximum)
  const declared = declaredFields[field]
  const base = { id: req.requirement_id, label: `${req.rule === 'min_number' ? 'Minimum' : 'Maximum'} ${label}` }
  if (!declared) return { ...base, status: 'needs_review', detail: `The funder sets a limit of ${limit} on ${label}. We don't ask about this yet, so check it yourself.` }
  const raw = answers[declared.answer].trim()
  if (!raw) return { ...base, status: 'needs_review', detail: `You didn't give a value. The ${req.rule === 'min_number' ? 'minimum' : 'maximum'} is ${declared.format(limit)}.` }
  const value = Number(raw)
  const ok = req.rule === 'min_number' ? value >= limit : value <= limit
  const bound = req.rule === 'min_number' ? 'minimum' : 'maximum'
  return ok
    ? { ...base, status: 'passed', detail: `You told us ${declared.format(value)}; the ${bound} is ${declared.format(limit)}.` }
    : { ...base, status: 'failed', detail: `You told us ${declared.format(value)}, but the ${bound} is ${declared.format(limit)}.` }
}

export function evaluateCheck(form: CheckFormState, bursary: Bursary, requirements: BursaryRequirements): CheckResult {
  const eligibilityItems: ResultItem[] = []
  const { fundingYear, faculty } = form.eligibility

  if (bursary.study_years.length) {
    const ok = bursary.study_years.includes(Number(fundingYear))
    eligibilityItems.push({ id: 'study-year', label: 'Funding year', status: ok ? 'passed' : 'failed',
      detail: ok ? `Open for ${fundingYear}.` : `This bursary funds ${bursary.study_years.join(', ')}, not ${fundingYear}.` })
  }
  if (bursary.faculties.length) {
    const ok = !!faculty && bursary.faculties.includes(faculty)
    eligibilityItems.push({ id: 'faculty', label: 'Field of study', status: !faculty ? 'needs_review' : ok ? 'passed' : 'failed',
      detail: !faculty ? `You didn't choose a field. It funds: ${bursary.faculties.join(', ')}.` : ok ? `Funds ${faculty} students.` : `It funds ${bursary.faculties.join(', ')} only.` })
  }
  for (const req of requirements.requirements) {
    if (isEligibilityRule(req.rule)) eligibilityItems.push(evaluateThreshold(req, form.eligibility))
  }
  bursary.unchecked_requirements.forEach((text, i) => eligibilityItems.push({
    id: `unchecked-${i}`, label: text, status: 'needs_review', detail: 'We can\'t check this for you. Confirm it with the funder.',
  }))

  const items: DocumentItem[] = documentChecklist(requirements).map(doc => {
    const answer = form.documents[doc.documentType] ?? { note: '' }
    const status: ItemStatus = answer.mark === 'available' ? 'passed' : answer.mark === 'missing' ? 'failed' : 'needs_review'
    const detail = status === 'passed' ? 'You have this document ready.' : status === 'failed' ? 'You still need to get this document.' : 'You weren\'t sure whether you have this.'
    return { id: doc.documentType, label: doc.label, status, detail, documentType: doc.documentType, conditions: doc.conditions, note: answer.note }
  })

  const eligibility = { status: overall(eligibilityItems, 'eligible', 'not_eligible'), items: eligibilityItems }
  const ready = items.filter(i => i.status === 'passed').length
  const completeness = {
    status: overall(items, 'complete', 'incomplete'),
    percent: items.length ? Math.round((ready / items.length) * 100) : 100,
    items,
    missingItems: items.filter(i => i.status !== 'passed').map(i => i.label),
  }
  return { createdAt: new Date().toISOString(), bursary, requirementVersion: requirements.requirement_version, eligibility, completeness, nextStep: nextStep(eligibility.status, completeness) }
}

function overall<P extends string, F extends string>(items: { status: ItemStatus }[], pass: P, fail: F): P | F | 'needs_review' {
  if (items.some(i => i.status === 'failed')) return fail
  if (items.some(i => i.status === 'needs_review')) return 'needs_review'
  return pass
}

function nextStep(eligibility: EligibilityStatus, completeness: CheckResult['completeness']): CheckResult['nextStep'] {
  if (eligibility === 'not_eligible') return { title: 'Look at other bursaries', detail: 'Based on what you told us, you may not meet this funder\'s criteria. Your answers and documents can be reused for another bursary.' }
  const firstMissing = completeness.items.find(i => i.status === 'failed')
  if (firstMissing) return { title: `Get your ${firstMissing.label.toLowerCase()}`, detail: `${completeness.missingItems.length} document${completeness.missingItems.length === 1 ? '' : 's'} still outstanding. Start with this one.` }
  if (completeness.status === 'needs_review') return { title: 'Check the documents you weren\'t sure about', detail: 'Find them or ask for copies, then run your check again.' }
  if (eligibility === 'needs_review') return { title: 'Confirm the last criteria, then apply', detail: 'Read the criteria we couldn\'t check on the funder\'s site. If they fit you, you\'re ready to apply.' }
  return { title: 'Apply on the funder\'s site', detail: 'You told us you meet the criteria and have every document. Check each document\'s conditions once more, then apply.' }
}

/**
 * How a result should feel. Most real bursaries list criteria we can't check (citizenship and the like),
 * so "every document ready and nothing rules you out" is the realistic best outcome: 'ready_confirm'.
 */
export type ResultMood = 'ready' | 'ready_confirm' | 'almost' | 'review' | 'not_eligible'

export function resultMood({ eligibility, completeness }: Pick<CheckResult, 'eligibility' | 'completeness'>): ResultMood {
  if (eligibility.status === 'not_eligible') return 'not_eligible'
  if (completeness.status === 'complete') return eligibility.status === 'eligible' ? 'ready' : 'ready_confirm'
  return eligibility.status === 'eligible' ? 'almost' : 'review'
}

export const isCelebration = (mood: ResultMood) => mood === 'ready' || mood === 'ready_confirm'

/** Splits a server check's findings into eligibility and completeness, using each requirement's rule. */
export function splitFindings(check: ApplicationCheck, requirements: BursaryRequirements) {
  const ruleById = new Map(requirements.requirements.map(r => [r.requirement_id, r.rule]))
  const eligibility: CheckFinding[] = []
  const completeness: CheckFinding[] = []
  for (const finding of check.findings) {
    (isEligibilityRule(ruleById.get(finding.requirement_id) ?? '') ? eligibility : completeness).push(finding)
  }
  return { eligibility, completeness }
}
