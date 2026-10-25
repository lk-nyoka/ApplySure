import type { ReactNode } from 'react'
import { Brand } from '../../components/AppShell'
import { Icon } from '../../components/icons'

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <main className="auth-shell">
    <div className="auth-intro">
      <Brand light />
      <div className="auth-intro-copy">
        <h1>Make every application count.</h1>
        <p>Check you qualify and that your documents are complete, before the deadline.</p>
        <ul>
          <li><Icon name="circleCheck" size={18} />Open bursaries in one place</li>
          <li><Icon name="circleCheck" size={18} />Eligibility and documents checked separately</li>
          <li><Icon name="circleCheck" size={18} />Your files are never stored</li>
        </ul>
      </div>
    </div>
    <div className="auth-card">
      <h2>{title}</h2>
      <p className="auth-subtitle">{subtitle}</p>
      {children}
    </div>
  </main>
}

export function AuthNotice({ tone = 'info', children }: { tone?: 'info' | 'danger' | 'success'; children: ReactNode }) {
  return <p role={tone === 'danger' ? 'alert' : 'status'} className={`form-message form-message-${tone}`}>{children}</p>
}

export const authErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.'
