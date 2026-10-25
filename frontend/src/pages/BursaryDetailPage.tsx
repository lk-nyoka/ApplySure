import { useParams } from 'react-router-dom'
import { useAuth, userDetails } from '../auth/AuthProvider'
import { documentChecklist, isEligibilityRule } from '../check/evaluate'
import { COVERS, DeadlineChip, MatchBadge, matchReasons, SaveButton } from '../components/bursary'
import { Icon } from '../components/icons'
import { AlertBanner, ButtonLink, Chip, EmptyState, LogoTile, SkeletonCard, SubHeader } from '../components/ui'
import { getBursaries, getRequirements } from '../lib/api'
import { downloadDeadline } from '../lib/calendar'
import { formatRand, titleCase } from '../lib/format'
import { useAsync } from '../lib/useAsync'
import type { RequirementSummary } from '../models'

function criterion(r: RequirementSummary) {
  const p = r.params ?? {}
  const value = Number(r.rule === 'min_number' ? p.minimum : p.maximum)
  const label = String(p.label ?? p.field ?? '')
  const shown = p.field === 'household_income_annual' ? formatRand(value) : p.field === 'average_percent' ? `${value}%` : value.toLocaleString('en-ZA')
  return `${r.rule === 'min_number' ? 'At least' : 'At most'} ${shown} ${label.replace(/\s*\(.*\)$/, '')}`
}

export function BursaryDetailPage() {
  const { id = '' } = useParams()
  const { session } = useAuth()
  const list = useAsync(() => getBursaries({ includeClosed: true }), [])
  const reqs = useAsync(() => getRequirements(id), [id])
  const bursary = list.data?.find(b => b.id === id)

  if (list.loading) return <div className="tab-page"><SubHeader title="Bursary" back="/bursaries" /><div className="page-body"><SkeletonCard lines={5} /></div></div>
  if (list.error) return <div className="tab-page"><SubHeader title="Bursary" back="/bursaries" /><div className="page-body"><AlertBanner tone="danger" action={<button className="btn btn-secondary btn-sm" onClick={list.reload}>Try again</button>}>{list.error}</AlertBanner></div></div>
  if (!bursary) return <div className="tab-page"><SubHeader title="Bursary" back="/bursaries" /><div className="page-body"><EmptyState icon="search" title="Bursary not found" action={<ButtonLink to="/bursaries">Browse bursaries</ButtonLink>}>It may have been removed.</EmptyState></div></div>

  const criteria = reqs.data?.requirements.filter(r => isEligibilityRule(r.rule)) ?? []
  const docs = reqs.data ? documentChecklist(reqs.data) : []

  return <div className="tab-page detail-page">
    <SubHeader title="Bursary details" back="/bursaries" action={<SaveButton bursary={bursary} />} />
    <div className="page-body">
      <section className="detail-hero">
        <LogoTile name={bursary.funder} size="lg" />
        <div><h2>{bursary.title}</h2><p>{bursary.funder}</p>
          <div className="chip-row"><DeadlineChip deadline={bursary.deadline} />{bursary.study_years.length > 0 && <Chip icon="clock">Funds {bursary.study_years.join(', ')}</Chip>}</div>
          {bursary.deadline && <button className="pill-btn calendar-btn" onClick={() => downloadDeadline(bursary)}><Icon name="calendar" size={14} />Add deadline to calendar</button>}
        </div>
      </section>
      <MatchBadge reasons={matchReasons(bursary, userDetails(session?.user))} />
      {(bursary.covers ?? []).length > 0 && <section className="soft-panel" aria-labelledby="covers-title">
        <h3 id="covers-title"><Icon name="coins" size={18} />What it pays for</h3>
        <ul className="cover-grid">{(bursary.covers ?? []).filter(c => COVERS[c]).map(c => <li key={c}><Icon name="tick" size={16} />{COVERS[c]}</li>)}</ul>
      </section>}
      {bursary.status === 'draft' && <AlertBanner tone="warning">These details haven't been confirmed with the funder yet. Check them on the funder's site before you apply.</AlertBanner>}

      <div className="detail-grid">
        <section className="soft-panel" aria-labelledby="who-title">
          <h3 id="who-title"><Icon name="user" size={18} />Who can apply</h3>
          <ul className="tick-list">
            {bursary.faculties.length > 0 && <li>Studying {bursary.faculties.map(titleCase).join(' or ')}</li>}
            {bursary.study_years.length > 0 && <li>Needs funding for {bursary.study_years.join(' or ')}</li>}
            {criteria.map(r => <li key={r.requirement_id}>{criterion(r)}</li>)}
            {bursary.unchecked_requirements.map(u => <li key={u}>{u}</li>)}
            {reqs.loading && <li className="muted">Loading criteria…</li>}
          </ul>
        </section>
        <section className="soft-panel" aria-labelledby="docs-title">
          <h3 id="docs-title"><Icon name="file" size={18} />Documents you'll need</h3>
          {reqs.error ? <p className="muted">Couldn't load the document list. <button className="text-link" onClick={reqs.reload}>Try again</button></p>
            : <ul className="doc-list">{docs.map(d => <li key={d.documentType}><strong>{d.label}</strong>
              {d.conditions.length > 0 && <span>{d.conditions.join(' · ')}</span>}</li>)}</ul>}
        </section>
      </div>

      <section className="soft-panel" aria-labelledby="how-title">
        <h3 id="how-title"><Icon name="rocket" size={18} />How to apply</h3>
        <ol className="steps-list">
          <li>Check your eligibility and documents here. It takes about two minutes.</li>
          <li>Get any missing documents ready.</li>
          <li>Apply on the funder's official site before the deadline.</li>
        </ol>
      </section>

      <div className="sticky-actions">
        <ButtonLink to={`/check?bursary=${bursary.id}`} className="btn-block">Check my eligibility</ButtonLink>
        <a className="btn btn-secondary btn-block" href={bursary.application_url ?? bursary.official_source_url} target="_blank" rel="noopener noreferrer">Funder's site<Icon name="external" size={16} /></a>
      </div>
    </div>
  </div>
}
