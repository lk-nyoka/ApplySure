import { describe, expect, it } from 'vitest'
import type { Bursary } from '../models'
import { byMatch, closingSoon, fitsProfile, isOpen, matchReasons, sourceLink } from './bursary'

const make = (over: Partial<Bursary>): Bursary => ({
  id: 'x', title: 'X', funder: 'F', deadline: null, official_source_url: 'https://example.org', status: 'draft',
  study_years: [], faculties: [], courses: [], application_url: null, covers: [], unchecked_requirements: [], review_notes: [], ...over,
})
const student = { field_of_study: 'engineering', funding_year: '2027', course: 'BEng Electrical Engineering' }

describe('matching', () => {
  it('explains why a bursary fits', () => {
    const b = make({ faculties: ['engineering'], study_years: [2027], courses: ['electronics / electrical engineering'] })
    expect(matchReasons(b, student)).toEqual(['Funds Engineering', 'Funds 2027', 'Mentions electrical'])
  })

  it('ignores filler words in the course', () => {
    expect(matchReasons(make({ courses: ['bachelor of arts'] }), { course: 'Bachelor degree' })).toEqual([])
  })

  it('rules out only a named field or year that is not the student\'s', () => {
    expect(fitsProfile(make({ faculties: ['law'] }), student)).toBe(false)
    expect(fitsProfile(make({ study_years: [2026] }), student)).toBe(false)
    expect(fitsProfile(make({}), student)).toBe(true) // open to any field and year
  })

  it('sorts strongest matches first, then soonest deadline', () => {
    const weak = make({ id: 'weak', faculties: ['engineering'], deadline: '2099-01-01' })
    const strong = make({ id: 'strong', faculties: ['engineering'], study_years: [2027], deadline: '2099-12-01' })
    const weakSooner = make({ id: 'weak-sooner', faculties: ['engineering'], deadline: '2098-01-01' })
    expect([weak, strong, weakSooner].sort(byMatch(student)).map(b => b.id)).toEqual(['strong', 'weak-sooner', 'weak'])
  })
})

describe('deadlines', () => {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)
  it('treats an unknown deadline as open and a past one as closed', () => {
    expect(isOpen(make({}))).toBe(true)
    expect(isOpen(make({ deadline: inDays(-2) }))).toBe(false)
  })
  it('flags bursaries closing within 30 days', () => {
    expect(closingSoon(make({ deadline: inDays(10) }))).toBe(true)
    expect(closingSoon(make({ deadline: inDays(60) }))).toBe(false)
  })
})

describe('match wording', () => {
  it('does not repeat the field as a course mention', () => {
    const b = make({ faculties: ['engineering'], courses: ['engineering'] })
    expect(matchReasons(b, { field_of_study: 'engineering', course: 'BEng Engineering' })).toEqual(['Funds Engineering'])
  })
})

describe('open bursaries', () => {
  it('says so when a bursary funds every field', () => {
    expect(matchReasons(make({ study_years: [2027] }), student)).toEqual(['Open to every field', 'Funds 2027'])
  })
})

describe('sourceLink', () => {
  it('calls an application page "Apply", a listing-site link a source, and a funder link the funder\'s site', () => {
    expect(sourceLink(make({ official_source_url: 'https://www.zabursaries.co.za/a/b/' })).label).toBe('Source')
    expect(sourceLink(make({ official_source_url: 'https://www.zabursaries.co.za/a/', application_url: 'https://my.nsfas.org.za' }))).toEqual({ href: 'https://my.nsfas.org.za', label: 'Apply' })
    expect(sourceLink(make({ official_source_url: 'https://www.nsfas.org.za' }))).toEqual({ href: 'https://www.nsfas.org.za', label: "Funder's site" })
  })
})
