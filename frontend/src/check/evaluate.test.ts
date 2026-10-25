import { describe, expect, it } from 'vitest'
import type { Bursary, BursaryRequirements } from '../models'
import { documentChecklist, emptyForm, evaluateCheck, isCelebration, resultMood, splitFindings } from './evaluate'

const bursary: Bursary = {
  id: 'b1', title: 'Acme Bursary', funder: 'Acme', deadline: '2099-11-30', official_source_url: 'https://example.org',
  status: 'draft', study_years: [2027], faculties: ['engineering'], courses: [], application_url: null, covers: ['tuition'],
  unchecked_requirements: ['Must be a South African citizen'], review_notes: [],
}
const requirements: BursaryRequirements = {
  bursary_id: 'b1', requirement_version: 'v1', requirements: [
    { requirement_id: 'r1', document_type: 'id_document', label: 'Certified copy of ID', rule: 'present', params: null },
    { requirement_id: 'r2', document_type: 'id_document', label: 'Certified copy of ID', rule: 'max_age', params: { max_days: 90 } },
    { requirement_id: 'r3', document_type: 'proof_of_income', label: 'Proof of income', rule: 'present', params: null },
    { requirement_id: 'r4', document_type: 'proof_of_income', label: 'Proof of income', rule: 'max_number', params: { field: 'household_income_annual', maximum: 350000, label: 'annual household income (R)' } },
  ],
}

function form(income: string, marks: Record<string, 'available' | 'missing' | 'unsure'>) {
  const f = emptyForm('b1')
  f.eligibility = { ...f.eligibility, fundingYear: '2027', faculty: 'engineering', annualIncome: income, citizenship: 'citizen' }
  f.documents = Object.fromEntries(Object.entries(marks).map(([k, mark]) => [k, { mark, note: '' }]))
  return f
}

describe('evaluateCheck', () => {
  it('keeps eligibility and completeness separate', () => {
    const result = evaluateCheck(form('500000', { id_document: 'available', proof_of_income: 'available' }), bursary, requirements)
    expect(result.eligibility.status).toBe('not_eligible') // income above the limit
    expect(result.completeness.status).toBe('complete') // but every document is ready
    expect(result.nextStep.title).toBe('Look at other bursaries')
  })

  it('reports missing documents and the first one to get', () => {
    const result = evaluateCheck(form('120000', { id_document: 'available', proof_of_income: 'missing' }), bursary, requirements)
    expect(result.completeness).toMatchObject({ status: 'incomplete', percent: 50, missingItems: ['Proof of income'] })
    expect(result.nextStep.title).toBe('Get your proof of income')
  })

  it('never passes what it cannot check', () => {
    const result = evaluateCheck(form('120000', { id_document: 'available', proof_of_income: 'unsure' }), bursary, requirements)
    expect(result.eligibility.status).toBe('needs_review') // citizenship is an unchecked requirement
    expect(result.completeness.status).toBe('needs_review')
  })

  it('fails a funding year the bursary does not cover', () => {
    const f = form('120000', {})
    f.eligibility.fundingYear = '2026'
    expect(evaluateCheck(f, bursary, requirements).eligibility.items.find(i => i.id === 'study-year')?.status).toBe('failed')
  })
})

describe('documentChecklist and splitFindings', () => {
  it('lists each document once, with its conditions', () => {
    expect(documentChecklist(requirements)).toEqual([
      { documentType: 'id_document', label: 'Certified copy of ID', conditions: ['Dated or certified within the last 90 days'] },
      { documentType: 'proof_of_income', label: 'Proof of income', conditions: [] },
    ])
  })

  it('puts limits under eligibility and document rules under completeness', () => {
    const check = {
      check_id: 'c', application_id: 'a', requirement_version: 'v1', demo_fixture: false,
      findings: ['r1', 'r2', 'r4'].map(id => ({ requirement_id: id, result: 'passed' as const, affected: null, explanation: '', suggested_fix: null, source_reference: null })),
    }
    const groups = splitFindings(check, requirements)
    expect(groups.eligibility.map(f => f.requirement_id)).toEqual(['r4'])
    expect(groups.completeness.map(f => f.requirement_id)).toEqual(['r1', 'r2'])
  })
})

describe('resultMood', () => {
  it('celebrates every document ready when nothing rules the student out, even with criteria left to confirm', () => {
    const result = evaluateCheck(form('180000', { id_document: 'available', proof_of_income: 'available' }), bursary, requirements)
    expect(result.eligibility.status).toBe('needs_review') // citizenship can't be checked
    expect(resultMood(result)).toBe('ready_confirm')
    expect(isCelebration(resultMood(result))).toBe(true)
  })

  it('never celebrates a result that rules the student out', () => {
    const result = evaluateCheck(form('500000', { id_document: 'available', proof_of_income: 'available' }), bursary, requirements)
    expect(resultMood(result)).toBe('not_eligible')
    expect(isCelebration(resultMood(result))).toBe(false)
  })

  it('does not celebrate while documents are missing', () => {
    const result = evaluateCheck(form('180000', { id_document: 'available', proof_of_income: 'missing' }), bursary, requirements)
    expect(resultMood(result)).toBe('review')
    expect(isCelebration(resultMood(result))).toBe(false)
  })
})
