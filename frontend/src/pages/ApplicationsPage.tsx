import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { DeadlineChip } from '../components/bursary'
import { TextareaField } from '../components/fields'
import { Icon } from '../components/icons'
import { ButtonLink, EmptyState, LogoTile, ProgressBar, Segmented, SessionOnlyNote, StatusChip, SubHeader } from '../components/ui'
import { formatDate, formatSize } from '../lib/format'
import { DOCUMENT_TYPES, useWorkspace, type CheckRecord } from '../workspace/WorkspaceProvider'
import { CompletenessResultCard, EligibilityResultCard, NextStepsCard, ResultHero } from './check/CheckResults'

type Filter = 'all' | 'attention' | 'ready' | 'not_eligible'

function matches(check: CheckRecord, filter: Filter) {
  const { eligibility, completeness } = check.result
  if (filter === 'ready') return eligibility.status === 'eligible' && completeness.status === 'complete'
  if (filter === 'not_eligible') return eligibility.status === 'not_eligible'
  if (filter === 'attention') return eligibility.status !== 'not_eligible' && (eligibility.status === 'needs_review' || completeness.status !== 'complete')
  return true
}

export function ApplicationCard({ check }: { check: CheckRecord }) {
  const { bursary, eligibility, completeness } = check.result
  return <article className="app-card">
    <div className="bursary-card-top">
      <LogoTile name={bursary.funder} />
      <div className="bursary-card-text"><h3>{bursary.title}</h3><p>Checked {formatDate(check.updatedAt)}</p></div>
    </div>
    <ul className="status-rows">
      <li><span>Eligibility</span><StatusChip solid status={eligibility.status} /></li>
      <li><span>Documents</span><StatusChip solid status={completeness.status} label={`${completeness.percent}% ready`} /></li>
    </ul>
    <ProgressBar value={completeness.percent} label="Documents ready" />
    <Link className="btn btn-secondary btn-block" to={`/applications/${check.id}`}>View status</Link>
  </article>
}

export function ApplicationsPage() {
  const { checks } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const filter = (['attention', 'ready', 'not_eligible'].includes(params.get('filter') ?? '') ? params.get('filter') : 'all') as Filter
  const count = (f: Filter) => checks.filter(c => matches(c, f)).length
  const tabs = [['all', 'All', count('all')], ['attention', 'To do', count('attention')], ['ready', 'Ready', count('ready')], ['not_eligible', 'Not eligible', count('not_eligible')]] as const
  const visible = checks.filter(c => matches(c, filter))

  return <div className="tab-page">
    <header className="page-title">
      <div className="title-row"><h1>My applications</h1><ButtonLink to="/check" icon="plus" className="btn-sm">New</ButtonLink></div>
      {checks.length > 0 && <Segmented label="Filter applications" options={tabs} value={filter} onChange={v => setParams(v === 'all' ? {} : { filter: v }, { replace: true })} />}
    </header>
    <div className="page-body">
      {checks.length === 0
        ? <div className="soft-panel"><EmptyState icon="clipboard" title="No applications yet" action={<ButtonLink to="/bursaries" icon="arrowRight">Find a bursary</ButtonLink>}>Check your eligibility for a bursary and save the result to track it here.</EmptyState></div>
        : visible.length ? <div className="card-grid">{visible.map(c => <ApplicationCard key={c.id} check={c} />)}</div>
        : <div className="soft-panel"><EmptyState icon="search" title="Nothing here">No applications match this filter.</EmptyState></div>}
      <SessionOnlyNote />
    </div>
  </div>
}

export function ApplicationDetailPage() {
  const { id } = useParams()
  const { checks, uploads, updateCheckNotes, removeCheck, persistence } = useWorkspace()
  const navigate = useNavigate()
  const check = checks.find(c => c.id === id)
  if (!check) return <div className="tab-page"><SubHeader title="Application" back="/applications" /><div className="page-body">
    <div className="soft-panel"><EmptyState icon="clipboard" title="Application not found" action={<ButtonLink to="/applications">My applications</ButtonLink>}>{persistence === 'local' ? 'Applications are kept for this visit only, so it may have been cleared.' : 'It may have been removed.'}</EmptyState></div>
  </div></div>

  const { bursary } = check.result
  const linked = uploads.filter(u => u.applicationId === check.id)
  return <div className="tab-page">
    <SubHeader title="Application status" back="/applications" />
    <div className="page-body narrow">
      <div className="bursary-strip"><LogoTile name={bursary.funder} size="sm" /><div><strong>{bursary.title}</strong><DeadlineChip deadline={bursary.deadline} /></div></div>
      <ResultHero result={check.result} />
      <NextStepsCard next={check.result.nextStep} cta={<a className="text-link" href={bursary.application_url ?? bursary.official_source_url} target="_blank" rel="noopener noreferrer">Funder's site <Icon name="external" size={14} /></a>} />
      <EligibilityResultCard result={check.result.eligibility} />
      <CompletenessResultCard result={check.result.completeness} />
      <section className="soft-panel" aria-labelledby="linked-title">
        <h3 id="linked-title"><Icon name="file" size={18} />Uploaded documents</h3>
        {linked.length
          ? <ul className="doc-mini">{linked.map(u => <li key={u.id}><Icon name="file" size={18} /><span><strong>{u.fileName}</strong><small>{DOCUMENT_TYPES[u.documentType]} · {formatSize(u.size)}</small></span></li>)}</ul>
          : <p className="muted">No files uploaded for this application.</p>}
      </section>
      <section className="soft-panel"><TextareaField label="Notes" optional value={check.notes} onChange={e => updateCheckNotes(check.id, e.target.value)} placeholder="e.g. Ask school for certified results" /></section>
      <ButtonLink to={`/check?bursary=${bursary.id}`} variant="secondary" className="btn-block">Check again</ButtonLink>
      <button className="text-link danger-link" onClick={() => { if (confirm(`Remove ${bursary.title} from your applications?`)) { removeCheck(check.id); navigate('/applications') } }}>Remove this application</button>
    </div>
  </div>
}
