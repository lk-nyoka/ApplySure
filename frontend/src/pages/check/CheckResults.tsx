import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { isCelebration, resultMood, splitFindings, type CheckResult, type ResultItem, type ResultMood } from '../../check/evaluate'
import { Confetti } from '../../components/Confetti'
import { Icon } from '../../components/icons'
import { AlertBanner, Card, ProgressRing, Spinner, StatusChip } from '../../components/ui'
import { TextField } from '../../components/fields'
import { getSampleCheck, runDocumentCheck } from '../../lib/api'
import { formatDate } from '../../lib/format'
import type { ApplicationCheck, BursaryRequirements, CheckFinding } from '../../models'

const eligibilityCopy = {
  eligible: 'From what you told us, you meet every criterion we could compare.',
  not_eligible: 'From what you told us, you don\'t meet at least one criterion.',
  needs_review: 'Some criteria need you to confirm them yourself.',
}
const completenessCopy = {
  complete: 'You told us every required document is ready.',
  incomplete: 'Some required documents are still missing.',
  needs_review: 'You weren\'t sure about some documents.',
}

export function ReasonList({ items }: { items: (ResultItem & { conditions?: string[] })[] }) {
  return <ul className="reason-list">{items.map(item => <li key={item.id}>
    <StatusChip status={item.status} />
    <div><strong>{item.label}</strong><p>{item.detail}</p>
      {item.status === 'passed' && !!item.conditions?.length &&
        <div className="small muted">Before you submit, check it is:<ul className="conditions">{item.conditions.map(c => <li key={c}>{c}</li>)}</ul></div>}
    </div>
  </li>)}</ul>
}

export function EligibilityResultCard({ result }: { result: CheckResult['eligibility'] }) {
  return <Card className={`result-card result-${result.status}`} aria-labelledby="eligibility-title">
    <div className="result-head"><div><span className="eyebrow">ELIGIBILITY</span><h2 id="eligibility-title">Can you apply?</h2></div><StatusChip status={result.status} /></div>
    <p className="result-summary">{eligibilityCopy[result.status]}</p>
    {result.items.length ? <details className="more"><summary>Show all {result.items.length} criteria</summary><ReasonList items={result.items} /></details> : <p className="muted">This bursary hasn't published criteria we can compare.</p>}
  </Card>
}

export function CompletenessResultCard({ result }: { result: CheckResult['completeness'] }) {
  return <Card className={`result-card result-${result.status}`} aria-labelledby="completeness-title">
    <div className="result-head"><div><span className="eyebrow">COMPLETENESS</span><h2 id="completeness-title">Is your application ready?</h2></div><StatusChip status={result.status} /></div>
    <div className="completeness-summary"><ProgressRing value={result.percent} size={96} label="Documents ready" /><p className="result-summary">{completenessCopy[result.status]}</p></div>
    {result.missingItems.length > 0 && <div className="missing-box"><strong>Still to sort out</strong><ul>{result.missingItems.map(m => <li key={m}>{m}</li>)}</ul></div>}
    <details className="more"><summary>Show each document</summary><ReasonList items={result.items} /></details>
  </Card>
}

export function NextStepsCard({ next, cta }: { next: CheckResult['nextStep']; cta?: ReactNode }) {
  return <Card className="next-card"><span className="feature-icon"><Icon name="arrowRight" /></span><div><span className="eyebrow">RECOMMENDED NEXT STEP</span><h2>{next.title}</h2><p>{next.detail}</p>{cta}</div></Card>
}

function summaryText(result: CheckResult) {
  const lines = [
    `Readiness check: ${result.bursary.title} (${result.bursary.funder})`,
    `Checked ${formatDate(result.createdAt)} against requirement version ${result.requirementVersion}`,
    '', `ELIGIBILITY: ${result.eligibility.status.replace('_', ' ')}`,
    ...result.eligibility.items.map(i => `- [${i.status}] ${i.label}: ${i.detail}`),
    '', `COMPLETENESS: ${result.completeness.status.replace('_', ' ')} (${result.completeness.percent}% ready)`,
    ...result.completeness.items.map(i => `- [${i.status}] ${i.label}`),
    '', `Next step: ${result.nextStep.title}`,
    '', 'Based on your own answers. This is not a funding decision and does not verify documents.',
  ]
  return lines.join('\n')
}

export function ResultActions({ result, saved, savedId, onSave, onRestart }: { result: CheckResult; saved: boolean; savedId?: string; onSave: () => void; onRestart: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(summaryText(result)); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { setCopied(false) }
  }
  return <div className="result-actions no-print">
    {saved
      ? <Link className="btn btn-primary btn-block" to={savedId ? `/applications/${savedId}` : '/applications'}><Icon name="circleCheck" size={18} />Saved · view application</Link>
      : <button className="btn btn-primary btn-block" onClick={onSave}><Icon name="plus" size={18} />Save to my applications</button>}
    <div className="link-row">
      <button className="text-link" onClick={() => window.print()}><Icon name="print" size={16} />Print or PDF</button>
      <button className="text-link" onClick={() => void copy()}><Icon name="copy" size={16} />{copied ? 'Copied' : 'Copy summary'}</button>
      <button className="text-link" onClick={onRestart}><Icon name="search" size={16} />Check another</button>
    </div>
  </div>
}

function FindingList({ findings }: { findings: CheckFinding[] }) {
  if (!findings.length) return <p className="muted small">No findings in this group.</p>
  return <ul className="reason-list">{findings.map(f => <li key={f.requirement_id}><StatusChip status={f.result} /><div><p>{f.explanation}</p>{f.suggested_fix && <p className="small muted">{f.suggested_fix}</p>}</div></li>)}</ul>
}

export interface LinkedFile { documentType: string; file: File }

type CheckState = { loading?: boolean; error?: string; check?: ApplicationCheck }

async function settle(run: () => Promise<ApplicationCheck>, set: (s: CheckState) => void) {
  set({ loading: true })
  try { set({ check: await run() }) } catch (e) { set({ error: e instanceof Error ? e.message : 'The check could not be completed.' }) }
}

function FindingGroups({ check, requirements }: { check: ApplicationCheck; requirements: BursaryRequirements }) {
  const groups = splitFindings(check, requirements)
  const summary = (f: CheckFinding[]) => `${f.filter(x => x.result === 'passed').length} of ${f.length} met`
  return <div className="demo-groups">
    {groups.eligibility.length > 0 && <details className="more" open={groups.eligibility.some(f => f.result !== 'passed')}><summary>Eligibility findings · {summary(groups.eligibility)}</summary><FindingList findings={groups.eligibility} /></details>}
    {groups.completeness.length > 0 && <details className="more" open={groups.completeness.some(f => f.result !== 'passed')}><summary>Completeness findings · {summary(groups.completeness)}</summary><FindingList findings={groups.completeness} /></details>}
  </div>
}

function DocumentCheck({ bursaryId, requirements, fullName, linked }: { bursaryId: string; requirements: BursaryRequirements; fullName: string; linked: LinkedFile[] }) {
  const [idNumber, setIdNumber] = useState('')
  const [address, setAddress] = useState('')
  const [real, setReal] = useState<CheckState>({})
  const [demo, setDemo] = useState<CheckState>({})
  // Ask only for what this bursary's rules use: an ID number for ID-number checks, an address for address checks.
  const rules = new Set(requirements.requirements.map(r => r.rule))
  const needsId = rules.has('id_matches_profile'), needsAddress = rules.has('address_matches_profile')
  const idError = needsId && idNumber && !/^\d{13}$/.test(idNumber) ? 'Enter the 13 digits of your ID number.' : undefined
  const run = () => settle(() => runDocumentCheck({ bursaryId, fullName, idNumber: needsId ? idNumber : '', address: needsAddress ? address : '', documents: linked }), setReal)

  return <Card className="demo-card no-print">
    <div className="result-head"><div><span className="eyebrow">DOCUMENT CHECK</span><h2>Check your documents against each rule</h2></div>
      {real.check && <StatusChip status="draft" label="Automated reading" />}</div>
    {linked.length === 0 ? <>
      <p className="muted">Link your files in the Documents step and we'll read them and check dates, ID numbers, names and limits for you. Until then you can see how it works with a made-up applicant.</p>
      {!demo.check && <button className="btn btn-secondary" onClick={() => void settle(() => getSampleCheck(bursaryId), setDemo)} disabled={demo.loading}>{demo.loading ? <><Spinner />Loading demo…</> : 'Show demo document check'}</button>}
      {demo.error && <AlertBanner tone="danger">{demo.error}</AlertBanner>}
      {demo.check && <><span className="chip chip-warning"><Icon name="alert" size={14} />Demo data, not yours</span><FindingGroups check={demo.check} requirements={requirements} /></>}
    </> : <>
      <p className="muted">We'll read {linked.length} linked file{linked.length === 1 ? '' : 's'} and compare them with your details. Files are read once and not stored. Photos can take up to a minute and can be misread, so a clear, flat photo in good light works best.</p>
      {(needsId || needsAddress) && <div className="form-grid">
        {needsId && <TextField label="ID number" optional inputMode="numeric" autoComplete="off" value={idNumber} error={idError} onChange={e => setIdNumber(e.target.value.replace(/\s/g, ''))} hint="Used only to check your ID document matches you. Not saved." />}
        {needsAddress && <TextField label="Home address" optional autoComplete="street-address" value={address} onChange={e => setAddress(e.target.value)} hint="Used only to check your proof of residence. Not saved." />}
      </div>}
      <button className="btn btn-primary" onClick={() => void run()} disabled={real.loading || !!idError}>{real.loading ? <><Spinner />Reading your documents…</> : real.check ? 'Check again' : 'Check my documents'}</button>
      {real.error && <AlertBanner tone="danger" action={<button className="btn btn-ghost" onClick={() => void run()}>Retry</button>}>{real.error}</AlertBanner>}
      {real.check && <>
        <AlertBanner tone="info">These results come from reading your files automatically. They can be wrong, they don't prove a document is genuine, and only the funder decides.</AlertBanner>
        <FindingGroups check={real.check} requirements={requirements} />
      </>}
    </>}
  </Card>
}

function heroCopy(mood: ResultMood, toConfirm: number): [string, string] {
  switch (mood) {
    case 'ready': return ['You look ready to apply', 'You meet the criteria we could check and have every document.']
    case 'ready_confirm': return ['Your documents are ready', `Nothing you told us rules you out. Confirm the ${toConfirm === 1 ? 'one criterion' : `${toConfirm} criteria`} we can't check, then apply.`]
    case 'not_eligible': return ['This one may not be for you', "Your answers don't meet at least one criterion. Your details carry over to other bursaries."]
    case 'almost': return ["You're nearly there", 'You qualify on what we could check. A few documents still need sorting out.']
    default: return ['A few things to sort out', 'Some documents are still missing, and some criteria need you to confirm them yourself.']
  }
}

/** The headline moment: one sentence, two tiles. Eligibility and completeness stay side by side, never merged. */
export function ResultHero({ result, celebrate }: { result: CheckResult; celebrate?: boolean }) {
  const { eligibility: e, completeness: c } = result
  const mood = resultMood(result)
  const [title, text] = heroCopy(mood, e.items.filter(i => i.status === 'needs_review').length)
  return <section className={`result-hero result-hero-${mood}`}>
    {/* Only a fresh result celebrates; reopening a saved application stays calm. */}
    {celebrate && isCelebration(mood) && <Confetti key={result.createdAt} />}
    <span className="result-hero-icon"><Icon name={isCelebration(mood) ? 'circleCheck' : mood === 'not_eligible' ? 'circleX' : 'help'} size={30} /></span>
    <h2>{title}</h2><p>{text}</p>
    <div className="result-tiles">
      <div><span>Eligibility</span><StatusChip solid status={e.status} /></div>
      <div><span>Documents</span><StatusChip solid status={c.status} label={`${c.percent}% ready`} /></div>
    </div>
  </section>
}

export function CheckResults({ result, requirements, saved, savedId, onSave, onRestart, fullName, linked = [] }: {
  result: CheckResult; requirements: BursaryRequirements; saved: boolean; savedId?: string; onSave: () => void; onRestart: () => void; fullName: string; linked?: LinkedFile[]
}) {
  return <div className="results">
    <ResultHero result={result} celebrate />
    <NextStepsCard next={result.nextStep} cta={<a className="text-link" href={result.bursary.application_url ?? result.bursary.official_source_url} target="_blank" rel="noopener noreferrer">Funder's site <Icon name="external" size={14} /></a>} />
    <ResultActions result={result} saved={saved} savedId={savedId} onSave={onSave} onRestart={onRestart} />
    {result.bursary.status === 'draft' && <AlertBanner tone="warning">This bursary's requirements haven't been confirmed with the funder yet. Check them on the official source before you apply.</AlertBanner>}
    <div className="result-grid">
      <EligibilityResultCard result={result.eligibility} />
      <CompletenessResultCard result={result.completeness} />
    </div>
    <p className="muted small center-text">Based on your own answers. It doesn't prove documents are genuine or guarantee funding. Only the funder decides.<br />Checked {formatDate(result.createdAt)} · rules version {result.requirementVersion}</p>
    <DocumentCheck bursaryId={result.bursary.id} requirements={requirements} fullName={fullName} linked={linked} />
  </div>
}
