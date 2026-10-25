import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { displayName, useAuth, userDetails, type UserDetails } from '../auth/AuthProvider'
import { FACULTIES, FUNDING_YEARS } from '../components/bursary'
import type { User } from '@supabase/supabase-js'
import { PasswordField, SelectField, TextField } from '../components/fields'
import { Icon, type IconName } from '../components/icons'
import { AlertBanner } from '../components/ui'
import { formatDate, titleCase } from '../lib/format'
import { APP_NAME } from '../lib/brand'
import { CloudUnavailable, deleteMyAccount } from '../lib/cloud'
import { supabase } from '../lib/supabase'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { MIN_PASSWORD, PasswordStrengthHint } from './auth/SignupPage'

type Status = { tone: 'success' | 'danger'; text: string } | null

const YEARS: [string, string][] = [['1', '1st year'], ['2', '2nd year'], ['3', '3rd year'], ['4', '4th year'], ['5', '5th year or later']]
const FIELDS: [keyof UserDetails, string][] = [['full_name', 'Full name'], ['institution', 'Institution'], ['course', 'Course'], ['field_of_study', 'Field of study'], ['year_of_study', 'Year of study'], ['funding_year', 'Funding needed for']]

function show(key: keyof UserDetails, value?: string) {
  if (!value) return undefined
  if (key === 'field_of_study') return FACULTIES.find(f => f[0] === value)?.[1] ?? titleCase(value)
  if (key === 'year_of_study') return YEARS.find(y => y[0] === value)?.[1] ?? value
  return value
}

function DetailsCard() {
  const { session } = useAuth()
  const current = userDetails(session?.user)
  const [editing, setEditing] = useState(false)
  const [values, setValues] = useState<UserDetails>(current)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const set = (key: keyof UserDetails, value: string) => setValues(v => ({ ...v, [key]: value }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setStatus(null)
    const { error } = await supabase.auth.updateUser({ data: { ...current, ...Object.fromEntries(FIELDS.map(([k]) => [k, values[k]?.trim() ?? ''])) } })
    setBusy(false)
    if (error) return setStatus({ tone: 'danger', text: error.message })
    setStatus({ tone: 'success', text: 'Profile saved.' }); setEditing(false)
  }

  return <section className="soft-panel" aria-labelledby="details-title">
    <div className="review-head"><h3 id="details-title">Personal & study details</h3>
      {!editing && <button className="pill-btn" onClick={() => { setValues(current); setEditing(true); setStatus(null) }}><Icon name="edit" size={14} />Edit</button>}</div>
    {status && <AlertBanner tone={status.tone}>{status.text}</AlertBanner>}
    {editing
      ? <form onSubmit={save}>
        <TextField label="Full name" autoComplete="name" value={values.full_name ?? ''} onChange={e => set('full_name', e.target.value)} />
        <TextField label="Institution" autoComplete="organization" value={values.institution ?? ''} onChange={e => set('institution', e.target.value)} />
        <TextField label="Course" value={values.course ?? ''} onChange={e => set('course', e.target.value)} />
        <div className="form-grid">
          <SelectField label="Field of study" value={values.field_of_study ?? ''} options={FACULTIES} onChange={e => set('field_of_study', e.target.value)} />
          <SelectField label="Year of study" value={values.year_of_study ?? ''} options={YEARS} onChange={e => set('year_of_study', e.target.value)} />
          <SelectField label="Funding needed for" value={values.funding_year ?? ''} options={FUNDING_YEARS} onChange={e => set('funding_year', e.target.value)} />
        </div>
        <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
      : <dl className="kv">{FIELDS.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{show(key, current[key]) ?? <span className="muted">Not added</span>}</dd></div>)}</dl>}
    {!editing && <p className="small muted">These fill in your eligibility checks and the "For you" bursary list.</p>}
  </section>
}

function ChangePassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (password.length < MIN_PASSWORD) return setStatus({ tone: 'danger', text: `Use at least ${MIN_PASSWORD} characters.` })
    if (password !== confirm) return setStatus({ tone: 'danger', text: 'Passwords don\'t match.' })
    setBusy(true); setStatus(null)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setStatus({ tone: 'danger', text: error.message })
    setPassword(''); setConfirm(''); setStatus({ tone: 'success', text: 'Password changed.' })
  }
  return <form onSubmit={submit} className="menu-panel">
    <PasswordField label="New password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} />
    <PasswordStrengthHint password={password} />
    <PasswordField label="Confirm new password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} />
    {status && <AlertBanner tone={status.tone}>{status.text}</AlertBanner>}
    <button className="btn btn-primary btn-block" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
  </form>
}

function MenuRow({ icon, label, detail, to, onClick, danger, disabled }: { icon: IconName; label: string; detail?: string; to?: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  const inner = <><span className="menu-icon"><Icon name={icon} size={20} /></span><span className="menu-text"><strong>{label}</strong>{detail && <small>{detail}</small>}</span><Icon name="chevronRight" size={18} /></>
  const className = `menu-row${danger ? ' danger' : ''}`
  return <li>{to ? <Link className={className} to={to}>{inner}</Link> : <button className={className} onClick={onClick} disabled={disabled}>{inner}</button>}</li>
}

/** Everything the account holds, as a JSON file: POPIA right of access. Documents are never held, so none are included. */
function downloadMyData(user: User | undefined, checks: ReturnType<typeof useWorkspace>['checks'], saved: string[]) {
  const data = {
    exported_at: new Date().toISOString(),
    account: { email: user?.email, created_at: user?.created_at, profile: userDetails(user) },
    applications: checks.map(c => ({ id: c.id, bursary: c.result.bursary.title, your_answers: c.basics, result: c.result, notes: c.notes, updated_at: c.updatedAt })),
    saved_bursary_ids: saved,
    documents: 'Not held: your files stay on your device and are only read during a check.',
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: `${APP_NAME.toLowerCase()}-my-data.json` })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function DeleteAccount({ onCancel }: { onCancel: () => void }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function remove() {
    setBusy(true); setError('')
    try {
      await deleteMyAccount()
      await supabase?.auth.signOut()
    } catch (e) {
      setError(e instanceof CloudUnavailable
        ? 'Account deletion isn\'t switched on for this project yet. Contact support and we\'ll delete your account.'
        : 'We couldn\'t delete your account. Check your connection and try again.')
      setBusy(false)
    }
  }
  return <div className="menu-panel" role="group" aria-labelledby="delete-title">
    <h3 id="delete-title">Delete your account permanently?</h3>
    <p className="muted">This deletes your profile, saved applications and bookmarks. It can't be undone. Files on this device are cleared too.</p>
    <TextField label='Type "delete" to confirm' value={typed} autoComplete="off" onChange={e => setTyped(e.target.value)} />
    {error && <AlertBanner tone="danger">{error}</AlertBanner>}
    <div className="form-actions">
      <button className="btn btn-secondary" type="button" onClick={onCancel}>Cancel</button>
      <button className="btn btn-danger" type="button" disabled={busy || typed.trim().toLowerCase() !== 'delete'} onClick={() => void remove()}>{busy ? 'Deleting…' : 'Delete my account'}</button>
    </div>
  </div>
}

export function ProfilePage() {
  const { session } = useAuth()
  const { clear, checks, uploads, saved } = useWorkspace()
  const [panel, setPanel] = useState<'password' | 'delete' | null>(null)
  const [message, setMessage] = useState('')
  const user = session?.user
  const name = displayName(user)
  const toggle = (p: typeof panel) => setPanel(current => current === p ? null : p)

  async function signOutEverywhere() {
    const { error } = await supabase!.auth.signOut({ scope: 'global' })
    if (error) setMessage(error.message)
  }

  return <div className="tab-page">
    <header className="blue-header profile-head">
      <span className="avatar avatar-lg">{name.slice(0, 1).toUpperCase()}</span>
      <div><h1>{name}</h1><p>{user?.email}</p>{user?.created_at && <p className="small">Member since {formatDate(user.created_at)}</p>}</div>
    </header>
    <div className="page-body narrow">
      <DetailsCard />
      <ul className="menu-list" aria-label="Account">
        <MenuRow icon="folder" label="My documents" detail={`${uploads.filter(u => u.status === 'pending').length} on this device`} to="/documents" />
        <MenuRow icon="lock" label="Change password" onClick={() => toggle('password')} />
        {panel === 'password' && <li><ChangePassword /></li>}
        <MenuRow icon="shield" label="Sign out on all devices" detail="If you've lost a phone or used a shared computer" onClick={() => void signOutEverywhere()} />
        <MenuRow icon="trash" label="Clear data on this device" detail={`${checks.length} check${checks.length === 1 ? '' : 's'}, ${uploads.length} file${uploads.length === 1 ? '' : 's'}`} disabled={!checks.length && !uploads.length} onClick={() => { clear(); setMessage('Cleared your checks and files from this device.') }} />
        <MenuRow icon="download" label="Download my data" detail="Your profile and applications, as a file" onClick={() => downloadMyData(user, checks, saved)} />
        <MenuRow icon="help" label="Help & support" to="/support" />
      </ul>
      {message && <AlertBanner tone="success">{message}</AlertBanner>}
      <button className="btn btn-danger-outline btn-block" onClick={() => void supabase?.auth.signOut()}><Icon name="logout" size={18} />Sign out</button>
      <button className="text-link danger-link" onClick={() => toggle('delete')}>Delete my account</button>
      {panel === 'delete' && <DeleteAccount onCancel={() => setPanel(null)} />}
    </div>
  </div>
}
