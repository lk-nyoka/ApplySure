import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Icon, type IconName } from './icons'

export function Card({ children, className = '', as: Tag = 'section', ...rest }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' | 'aside'; 'aria-labelledby'?: string }) {
  return <Tag className={`card ${className}`} {...rest}>{children}</Tag>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p className="lead">{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'info'

export function Chip({ tone = 'neutral', icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{icon && <Icon name={icon} size={14} />}{children}</span>
}

const statusLabels: Record<string, [string, Tone, IconName]> = {
  eligible: ['Eligible', 'success', 'circleCheck'],
  not_eligible: ['Not eligible', 'danger', 'circleX'],
  complete: ['Complete', 'success', 'circleCheck'],
  incomplete: ['Incomplete', 'danger', 'circleX'],
  needs_review: ['Needs review', 'warning', 'help'],
  passed: ['Met', 'success', 'circleCheck'],
  failed: ['Not met', 'danger', 'circleX'],
  needs_confirmation: ['Needs confirmation', 'warning', 'help'],
  not_applicable: ['Not applicable', 'neutral', 'info'],
  pending: ['On this device', 'info', 'file'],
  draft: ['Not yet reviewed by a person', 'warning', 'alert'],
}

/** Status is always shown as icon + words, never colour alone. `solid` is the filled pill used in status rows. */
export function StatusChip({ status, label, solid }: { status: string; label?: string; solid?: boolean }) {
  const [text, tone, icon] = statusLabels[status] ?? [status, 'neutral', 'info']
  if (solid) return <span className={`pill pill-${tone}`}><Icon name={icon} size={14} />{label ?? text}</span>
  return <Chip tone={tone} icon={icon}>{label ?? text}</Chip>
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  return <div className="progress" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${value}%` }} /></div>
}

export function ProgressRing({ value, size = 128, label }: { value: number; size?: number; label: string }) {
  const r = 52, c = 2 * Math.PI * r
  return <div className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${value}%`}>
    <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r={r} className="ring-track" /><circle cx="60" cy="60" r={r} className="ring-value" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} /></svg>
    <strong>{value}%</strong>
  </div>
}

export function AlertBanner({ tone = 'info', title, children, action }: { tone?: Tone; title?: string; children: ReactNode; action?: ReactNode }) {
  const icon: IconName = tone === 'danger' ? 'alert' : tone === 'warning' ? 'alert' : tone === 'success' ? 'circleCheck' : 'info'
  return <div className={`alert alert-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
    <Icon name={icon} /><div>{title && <strong>{title}</strong>}<div>{children}</div></div>{action}
  </div>
}

export function EmptyState({ icon = 'sparkle', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon"><Icon name={icon} size={24} /></div><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status"><span className="sr-only">{label}</span></span>
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return <div className="card skeleton" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${90 - i * 18}%` }} />)}</div>
}

export function ButtonLink({ to, children, variant = 'primary', icon, className = '' }: { to: string; children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'white'; icon?: IconName; className?: string }) {
  return <Link to={to} className={`btn btn-${variant} ${className}`}>{children}{icon && <Icon name={icon} size={18} />}</Link>
}

/** Says where the student's work is kept, and surfaces a failed save. Documents always stay on the device. */
export function SessionOnlyNote() {
  const { persistence, syncError } = useWorkspace()
  if (syncError) return <p className="session-note error" role="alert"><Icon name="alert" size={16} />{syncError}</p>
  if (persistence === 'cloud') return <p className="session-note"><Icon name="lock" size={16} />Your applications are saved to your account. Your documents stay on this device.</p>
  if (persistence === 'loading') return null
  return <p className="session-note"><Icon name="lock" size={16} />Saved on this device for this visit only. Signing out or closing the tab clears it.</p>
}

/** Title bar for screens below a tab: back arrow, centred title, optional action. */
export function SubHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  const navigate = useNavigate()
  return <header className="sub-header">
    <button className="icon-btn round" aria-label="Go back" onClick={() => back ? navigate(back) : navigate(-1)}><Icon name="arrowLeft" /></button>
    <h1>{title}</h1>
    <span className="sub-header-action">{action}</span>
  </header>
}

export function SectionHead({ title, action }: { title: string; action?: ReactNode }) {
  return <div className="section-head"><h2>{title}</h2>{action}</div>
}

export function Segmented<T extends string>({ options, value, onChange, label }: { options: readonly (readonly [T, string, number?])[]; value: T; onChange: (v: T) => void; label: string }) {
  return <div className="segmented" role="tablist" aria-label={label}>
    {options.map(([v, text, count]) => <button key={v} role="tab" aria-selected={value === v} className={value === v ? 'active' : ''} onClick={() => onChange(v)}>
      {text}{count !== undefined && <span className="count">{count}</span>}
    </button>)}
  </div>
}

/** Funder "logo": initials on a white tile, so cards scan like the funder list they represent. */
export function LogoTile({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.replace(/\(.*?\)/g, '').split(/\s+/).filter(w => /^[A-Za-z]/.test(w) && !/^(of|the|and|for)$/i.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  return <span className={`logo-tile logo-${size}`} aria-hidden="true">{initials || '★'}</span>
}
