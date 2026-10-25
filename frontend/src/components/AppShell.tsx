import type { ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { APP_NAME } from '../lib/brand'
import { Icon, type IconName } from './icons'

const tabs: [string, string, IconName][] = [
  ['Home', '/dashboard', 'home'],
  ['Bursaries', '/bursaries', 'grad'],
  ['Applications', '/applications', 'clipboard'],
  ['Profile', '/profile', 'user'],
]

export function Brand({ to = '/', light }: { to?: string; light?: boolean }) {
  return <Link className={`brand${light ? ' brand-light' : ''}`} to={to}><span className="brand-mark"><Icon name="grad" size={20} /></span>{APP_NAME}</Link>
}

export function AppShell({ children }: { children: ReactNode }) {
  // The check is a focused task: like a checkout, it hides the tab bar so the only way on is forward or back.
  const focused = useLocation().pathname.startsWith('/check')
  return <div className={`app-shell${focused ? ' focused' : ''}`}>
    <a className="skip-link" href="#main">Skip to content</a>
    <nav aria-label="Main navigation" className="rail">
      <Brand to="/dashboard" />
      {tabs.map(([label, href, icon]) => <NavLink key={href} to={href}><Icon name={icon} />{label}</NavLink>)}
      <Link className="btn btn-primary rail-cta" to="/check"><Icon name="check" size={18} />Check eligibility</Link>
    </nav>
    <main className="content" id="main">{children}</main>
    <nav aria-label="Main navigation" className="tabbar">
      {tabs.map(([label, href, icon]) => <NavLink key={href} to={href}><span className="tab-icon"><Icon name={icon} /></span><span>{label}</span></NavLink>)}
    </nav>
  </div>
}
