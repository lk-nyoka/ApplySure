import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { displayName, useAuth, userDetails } from '../auth/AuthProvider'
import { byDeadline, byMatch, DeadlineCard, fitsProfile, isOpen, matchReasons } from '../components/bursary'
import { QuickSetup } from '../components/QuickSetup'
import { Icon, type IconName } from '../components/icons'
import { ButtonLink, EmptyState, SectionHead, SessionOnlyNote, StatusChip } from '../components/ui'
import { getBursaries } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { useWorkspace } from '../workspace/WorkspaceProvider'

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening' }

const quickActions: [string, string, IconName][] = [
  ['Check eligibility', '/check', 'check'],
  ['Upload documents', '/documents', 'upload'],
  ['Track applications', '/applications', 'clipboard'],
  ['Update profile', '/profile', 'user'],
]

export function HomeHeader() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const name = displayName(session?.user)
  const search = (e: FormEvent) => { e.preventDefault(); navigate(`/bursaries${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`) }
  return <header className="blue-header">
    <div className="greeting">
      <Link to="/profile" className="avatar" aria-label="Your profile">{name.slice(0, 1).toUpperCase()}</Link>
      <div><h1>{greeting()}, {name.split(' ')[0]}</h1><p>Let's find your next bursary.</p></div>
    </div>
    <form className="search-row" role="search" onSubmit={search}>
      <label className="search-pill"><span className="sr-only">Search bursaries</span>
        <input type="search" placeholder="Search bursaries or funders" value={query} onChange={e => setQuery(e.target.value)} />
        <button type="submit" className="icon-btn" aria-label="Search"><Icon name="search" /></button>
      </label>
      <Link to="/bursaries" className="filter-btn" aria-label="Browse with filters"><Icon name="sliders" /></Link>
    </form>
  </header>
}

export function DashboardPage() {
  const { checks } = useWorkspace()
  const { session } = useAuth()
  const profile = userDetails(session?.user)
  const bursaries = useAsync(() => getBursaries(), [])
  const open = (bursaries.data ?? []).filter(isOpen).sort(byDeadline)
  const matches = profile.field_of_study ? open.filter(b => fitsProfile(b, profile) && matchReasons(b, profile).length).sort(byMatch(profile)) : []
  const latest = checks[0]

  return <div className="home">
    <HomeHeader />
    <div className="page-body">
      <QuickSetup />
      <section className="hero-card" aria-labelledby="hero-title">
        <div>
          <h2 id="hero-title">{bursaries.loading ? 'Finding bursaries…' : matches.length ? `${matches.length} open bursar${matches.length === 1 ? 'y matches' : 'ies match'} you` : open.length ? `${open.length} bursar${open.length === 1 ? 'y is' : 'ies are'} open now` : 'Find your bursary'}</h2>
          <p>Check if you qualify and what documents you need, in about two minutes.</p>
          <ButtonLink to="/bursaries" variant="white">View bursaries</ButtonLink>
        </div>
        <span className="hero-art" aria-hidden="true"><Icon name="grad" size={64} /></span>
      </section>

      {matches.length > 0 && <section aria-label="Top matches for you">
        <SectionHead title="Top matches for you" action={<Link className="text-link" to="/bursaries?tab=for_you">See all {matches.length}</Link>} />
        <div className="carousel">{matches.slice(0, 6).map(b => <DeadlineCard key={b.id} bursary={b} reasons={matchReasons(b, profile)} />)}</div>
      </section>}

      <section aria-label="Quick actions">
        <SectionHead title="Quick actions" />
        <div className="quick-grid">{quickActions.map(([label, to, icon]) => <Link key={to} to={to} className="quick-tile"><Icon name={icon} /><span>{label}</span></Link>)}</div>
      </section>

      <section aria-label="Upcoming deadlines">
        <SectionHead title="Upcoming deadlines" action={<Link className="text-link" to="/bursaries">See all</Link>} />
        {bursaries.error ? <p className="muted">Couldn't load bursaries. <button className="text-link" onClick={bursaries.reload}>Try again</button></p>
          : bursaries.loading ? <div className="carousel"><div className="deadline-card skeleton-block" /><div className="deadline-card skeleton-block" /></div>
          : open.length ? <div className="carousel">{open.slice(0, 6).map(b => <DeadlineCard key={b.id} bursary={b} />)}</div>
          : <p className="muted">No open bursaries right now. Check back soon.</p>}
      </section>

      <section aria-label="Application status">
        <SectionHead title="Application status" action={checks.length > 1 && <Link className="text-link" to="/applications">See all</Link>} />
        {latest ? <div className="status-card">
          <div className="status-card-head"><div><h3>{latest.result.bursary.title}</h3><p>{latest.result.bursary.funder}</p></div></div>
          <ul className="status-rows">
            <li><span>Eligibility</span><StatusChip solid status={latest.result.eligibility.status} /></li>
            <li><span>Documents</span><StatusChip solid status={latest.result.completeness.status} label={`${latest.result.completeness.percent}% ready`} /></li>
          </ul>
          <p className="next-step"><Icon name="arrowRight" size={16} /><span><strong>Next:</strong> {latest.result.nextStep.title}</span></p>
          <ButtonLink to={`/applications/${latest.id}`} variant="secondary" className="btn-block">View status</ButtonLink>
        </div>
          : <div className="status-card"><EmptyState icon="clipboard" title="No applications yet" action={<ButtonLink to="/check">Check my eligibility</ButtonLink>}>Pick a bursary and we'll show whether you qualify and which documents you still need.</EmptyState></div>}
      </section>
      <SessionOnlyNote />
    </div>
  </div>
}
