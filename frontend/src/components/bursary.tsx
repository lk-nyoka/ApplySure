import { Link } from 'react-router-dom'
import { daysUntil, formatDate, titleCase } from '../lib/format'
import type { Bursary } from '../models'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Icon } from './icons'
import { Chip, LogoTile } from './ui'

export const FACULTIES: [string, string][] = [
  ['engineering', 'Engineering'], ['science', 'Science'], ['commerce', 'Commerce'], ['health_sciences', 'Health sciences'],
  ['humanities', 'Humanities'], ['law', 'Law'], ['education', 'Education'], ['information_technology', 'Information technology'],
]
const thisYear = new Date().getFullYear()
export const FUNDING_YEARS: [string, string][] = [thisYear, thisYear + 1, thisYear + 2].map(y => [String(y), String(y)])

export const CLOSING_SOON_DAYS = 30

/** Where to send the student, and an honest name for it: an application page is "Apply" (it may be the
 *  funder's own portal or an application platform), and a listing site is a "Source", not the funder. */
export function sourceLink(b: Bursary): { href: string; label: string } {
  if (b.application_url) return { href: b.application_url, label: 'Apply' }
  const href = b.official_source_url
  let host = ''
  try { host = new URL(href).hostname } catch { /* keep the generic label */ }
  return { href, label: host.endsWith('zabursaries.co.za') ? 'Source' : "Funder's site" }
}

// What a bursary pays for. Keys must match COVERS in backend/app/services/ingest/extractor.py.
export const COVERS: Record<string, string> = {
  tuition: 'Tuition', accommodation: 'Accommodation', books: 'Books', meals: 'Meals', living_allowance: 'Allowance',
  laptop: 'Laptop', transport: 'Transport', vacation_work: 'Vacation work', employment: 'Job after studies',
}

/** Up to `max` cover chips, then "+n more", so cards stay one line on a phone. */
export function CoverChips({ covers, max = 3 }: { covers: string[]; max?: number }) {
  const known = covers.filter(c => COVERS[c])
  if (!known.length) return null
  const extra = known.length - max
  return <ul className="cover-chips" aria-label="What it pays for">
    {known.slice(0, extra > 0 ? max : known.length).map(c => <li key={c}><Icon name="tick" size={14} />{COVERS[c]}</li>)}
    {extra > 0 && <li className="more">+{extra} more</li>}
  </ul>
}

export interface MatchProfile { field_of_study?: string; funding_year?: string; course?: string }

/** Plain reasons a bursary fits this student, strongest first. Empty when nothing is known to match. */
export function matchReasons(b: Bursary, p: MatchProfile): string[] {
  const reasons: string[] = []
  if (p.field_of_study && !b.faculties.length) reasons.push('Open to every field')
  else if (p.field_of_study && b.faculties.includes(p.field_of_study)) reasons.push(`Funds ${FACULTIES.find(f => f[0] === p.field_of_study)?.[1] ?? titleCase(p.field_of_study)}`)
  const year = Number(p.funding_year)
  if (year && b.study_years.includes(year)) reasons.push(`Funds ${year}`)
  // Course words that only repeat the field ("engineering" for Engineering) add nothing new.
  const fieldWords = (FACULTIES.find(f => f[0] === p.field_of_study)?.[1] ?? '').toLowerCase().split(/\s+/)
  const words = (p.course ?? '').toLowerCase().split(/[^a-z]+/)
    .filter(w => w.length > 3 && !['bachelor', 'degree', 'diploma', 'honours', 'beng', 'bsc', 'bcom', ...fieldWords].includes(w))
  const hit = words.find(w => b.courses.some(c => c.includes(w)))
  if (hit) reasons.push(`Mentions ${hit}`)
  return reasons
}

/** A bursary rules itself out only when it names fields or years and none of them are the student's. */
export function fitsProfile(b: Bursary, p: MatchProfile) {
  const year = Number(p.funding_year)
  const fieldOk = !p.field_of_study || !b.faculties.length || b.faculties.includes(p.field_of_study)
  const yearOk = !year || !b.study_years.length || b.study_years.includes(year)
  return fieldOk && yearOk
}

/** Best matches first, then soonest deadline. */
export const byMatch = (p: MatchProfile) => (a: Bursary, b: Bursary) =>
  matchReasons(b, p).length - matchReasons(a, p).length || byDeadline(a, b)

export function MatchBadge({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null
  return <p className="match-badge"><Icon name="sparkle" size={14} /><strong>{reasons.length > 1 ? 'Strong match' : 'Good match'}</strong><span>{reasons.join(' · ')}</span></p>
}

export function isOpen(b: Bursary) { return !b.deadline || daysUntil(b.deadline) >= 0 }

export function closingSoon(b: Bursary) {
  if (!b.deadline) return false
  const days = daysUntil(b.deadline)
  return days >= 0 && days <= CLOSING_SOON_DAYS
}

/** Bursaries with a known deadline first (soonest first), then the rest. */
export function byDeadline(a: Bursary, b: Bursary) {
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  return a.deadline ? -1 : b.deadline ? 1 : a.title.localeCompare(b.title)
}

export function deadlineText(deadline: string | null) {
  if (!deadline) return 'Deadline not published yet'
  const days = daysUntil(deadline)
  if (days < 0) return `Closed on ${formatDate(deadline)}`
  if (days === 0) return 'Closes today'
  if (days <= CLOSING_SOON_DAYS) return `Closes in ${days} day${days === 1 ? '' : 's'}`
  return `Apply before ${formatDate(deadline)}`
}

export function DeadlineChip({ deadline }: { deadline: string | null }) {
  if (!deadline) return <Chip icon="calendar">Deadline not published</Chip>
  const days = daysUntil(deadline)
  if (days < 0) return <Chip tone="neutral" icon="calendar">Closed {formatDate(deadline)}</Chip>
  return <Chip tone={days <= 14 ? 'warning' : 'info'} icon="calendar">Closes {formatDate(deadline)}{days <= 14 ? ` · ${days} day${days === 1 ? '' : 's'} left` : ''}</Chip>
}

export function SaveButton({ bursary, onBlue }: { bursary: Bursary; onBlue?: boolean }) {
  const { saved, toggleSaved } = useWorkspace()
  const on = saved.includes(bursary.id)
  return <button className={`icon-btn save-btn${onBlue ? ' on-blue' : ''}`} aria-pressed={on} aria-label={on ? `Remove ${bursary.title} from saved` : `Save ${bursary.title}`} onClick={() => toggleSaved(bursary.id)}>
    <Icon name="bookmark" fill={on ? 'currentColor' : 'none'} />
  </button>
}

const fields = (b: Bursary) => b.faculties.length ? b.faculties.map(titleCase).join(', ') : 'All fields'

/** List card: who funds it, the facts that decide whether to bother, one primary action. */
export function BursaryCard({ bursary, reasons = [] }: { bursary: Bursary; reasons?: string[] }) {
  return <article className="bursary-card">
    <div className="bursary-card-top">
      <LogoTile name={bursary.funder} />
      <div className="bursary-card-text">
        <h3><Link to={`/bursaries/${bursary.id}`}>{bursary.title}</Link></h3>
        <p>{bursary.funder}</p>
      </div>
      <SaveButton bursary={bursary} />
    </div>
    <MatchBadge reasons={reasons} />
    <CoverChips covers={bursary.covers ?? []} />
    <dl className="facts">
      <div><dt><Icon name="calendar" size={16} />Deadline</dt><dd>{deadlineText(bursary.deadline)}</dd></div>
      {bursary.study_years.length > 0 && <div><dt><Icon name="clock" size={16} />Funds</dt><dd>{bursary.study_years.join(', ')}</dd></div>}
      <div><dt><Icon name="grad" size={16} />Fields</dt><dd>{fields(bursary)}</dd></div>
    </dl>
    {bursary.status === 'draft' && <p className="draft-note"><Icon name="alert" size={14} />Not yet confirmed with the funder</p>}
    <Link className="btn btn-primary btn-block" to={`/bursaries/${bursary.id}`}>View & check eligibility</Link>
  </article>
}

/** Compact card for the home deadline carousel. */
export function DeadlineCard({ bursary, reasons = [] }: { bursary: Bursary; reasons?: string[] }) {
  return <article className="deadline-card">
    <div className="deadline-card-top"><div><h3>{bursary.title}</h3><p>{deadlineText(bursary.deadline)}</p></div><SaveButton bursary={bursary} /></div>
    {reasons.length > 0 ? <MatchBadge reasons={reasons} /> : <p className="deadline-meta"><Icon name="grad" size={16} />{fields(bursary)}</p>}
    <CoverChips covers={bursary.covers ?? []} max={2} />
    <div className="deadline-bar">
      <span><Icon name="calendar" size={16} />{bursary.deadline ? `Ends ${formatDate(bursary.deadline)}` : 'Date to be confirmed'}</span>
      <Link className="btn btn-white btn-sm" to={`/bursaries/${bursary.id}`}>View</Link>
    </div>
  </article>
}
