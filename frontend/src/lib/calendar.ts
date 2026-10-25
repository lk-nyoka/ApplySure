import type { Bursary } from '../models'
import { APP_NAME } from './brand'

const escape = (text: string) => text.replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, '\\n')
const day = (iso: string) => iso.replaceAll('-', '')

/** An all-day calendar event on the closing date, with reminders a week and a day before. */
export function deadlineIcs(bursary: Bursary, now = new Date()): string | null {
  if (!bursary.deadline) return null
  const next = new Date(`${bursary.deadline}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const link = bursary.application_url ?? bursary.official_source_url
  const alarm = (trigger: string, text: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${escape(text)}`, 'END:VALARM']
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${APP_NAME}//Bursary deadlines//EN`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${bursary.id}-deadline@${APP_NAME.toLowerCase()}`,
    `DTSTAMP:${now.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${day(bursary.deadline)}`,
    `DTEND;VALUE=DATE:${day(next.toISOString().slice(0, 10))}`,
    `SUMMARY:${escape(`${bursary.title} closes`)}`,
    `DESCRIPTION:${escape(`Last day to apply for ${bursary.title} (${bursary.funder}). Confirm the deadline and apply here: ${link}`)}`,
    `URL:${link}`,
    ...alarm('-P7D', `${bursary.title} closes in a week`),
    ...alarm('-P1D', `${bursary.title} closes tomorrow`),
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}

export function downloadDeadline(bursary: Bursary) {
  const ics = deadlineIcs(bursary)
  if (!ics) return
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${bursary.title.replace(/[^\w]+/g, '-').toLowerCase()}-deadline.ics` })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
