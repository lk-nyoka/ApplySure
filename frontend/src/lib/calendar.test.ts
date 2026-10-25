import { describe, expect, it } from 'vitest'
import type { Bursary } from '../models'
import { deadlineIcs } from './calendar'

const bursary = {
  id: 'b1', title: 'Acme, Bursary; 2027', funder: 'Acme', deadline: '2026-11-30', official_source_url: 'https://example.org/acme',
  application_url: null,
} as Bursary

describe('deadlineIcs', () => {
  it('makes an all-day event on the closing date with week and day reminders', () => {
    const ics = deadlineIcs(bursary, new Date('2026-10-25T10:00:00Z'))!
    expect(ics).toContain('DTSTART;VALUE=DATE:20261130')
    expect(ics).toContain('DTEND;VALUE=DATE:20261201')
    expect(ics).toContain(String.raw`SUMMARY:Acme\, Bursary\; 2027 closes`) // commas and semicolons escaped
    expect(ics.match(/BEGIN:VALARM/g)).toHaveLength(2)
    expect(ics).toContain('\r\n')
  })
  it('has nothing to add without a deadline', () => {
    expect(deadlineIcs({ ...bursary, deadline: null })).toBeNull()
  })
})
