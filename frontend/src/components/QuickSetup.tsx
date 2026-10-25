import { useState } from 'react'
import { useAuth, userDetails } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import { FACULTIES, FUNDING_YEARS } from './bursary'
import { Icon } from './icons'

function Choices({ label, options, value, onChange }: { label: string; options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return <fieldset className="choice-group">
    <legend>{label}</legend>
    <div className="choice-chips">{options.map(([key, text]) =>
      <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(value === key ? '' : key)}>
        {value === key && <Icon name="tick" size={14} />}{text}
      </button>)}</div>
  </fieldset>
}

/** Three taps that personalise matches. Shown once on the home screen until finished or skipped. */
export function QuickSetup() {
  const { session } = useAuth()
  const current = userDetails(session?.user)
  const [field, setField] = useState(current.field_of_study ?? '')
  const [year, setYear] = useState(current.funding_year ?? String(new Date().getFullYear() + 1))
  const [course, setCourse] = useState(current.course ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (current.onboarded || !supabase) return null

  async function save(skip: boolean) {
    setBusy(true); setError(undefined)
    const picked = skip ? {} : { field_of_study: field, funding_year: year, course: course.trim() }
    // Send the whole profile so no existing detail can be lost, whatever the server's merge rules.
    const { error } = await supabase!.auth.updateUser({ data: { ...current, ...picked, onboarded: '1' } })
    setBusy(false)
    if (error) setError('We couldn\'t save that. Check your connection and try again.')
  }

  return <section className="setup-card" aria-labelledby="setup-title">
    <div className="setup-head">
      <span className="setup-icon"><Icon name="sparkle" /></span>
      <div><h2 id="setup-title">Find your matches</h2><p>Three quick taps and we'll put the bursaries that fit you first.</p></div>
    </div>
    <Choices label="What do you study?" options={FACULTIES} value={field} onChange={setField} />
    <Choices label="Funding needed for" options={FUNDING_YEARS} value={year} onChange={setYear} />
    <label className="setup-course"><span>Course <span className="optional">(optional)</span></span>
      <input placeholder="e.g. Electrical engineering" maxLength={80} value={course} onChange={e => setCourse(e.target.value)} /></label>
    {error && <p className="inline-error" role="alert"><Icon name="alert" size={14} />{error}</p>}
    <div className="setup-actions">
      <button className="btn btn-primary" disabled={busy || !field} onClick={() => void save(false)}>{busy ? 'Saving…' : 'Show my matches'}</button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => void save(true)}>Skip for now</button>
    </div>
  </section>
}
