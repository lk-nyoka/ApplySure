import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { userDetails, useAuth } from '../../auth/AuthProvider'
import { documentChecklist, emptyForm, evaluateCheck, type CheckFormState, type CheckResult, type DocumentMark } from '../../check/evaluate'
import { DeadlineChip, FACULTIES, FUNDING_YEARS } from '../../components/bursary'
import { InfoTooltip, RadioGroupField, SelectField, TextareaField, TextField } from '../../components/fields'
import { Icon } from '../../components/icons'
import { AlertBanner, EmptyState, LogoTile, SkeletonCard, Spinner, StatusChip, SubHeader } from '../../components/ui'
import { getBursaries, getRequirements } from '../../lib/api'
import { formatRand, formatSize } from '../../lib/format'
import { useAsync, type AsyncState } from '../../lib/useAsync'
import type { Bursary, BursaryRequirements } from '../../models'
import { ACCEPTED_EXTENSIONS, MAX_FILE_MB, useWorkspace } from '../../workspace/WorkspaceProvider'
import { CheckResults } from './CheckResults'

const STEPS = ['Details', 'Eligibility', 'Documents', 'Review']
const RESULTS = STEPS.length

const LEVELS: [string, string][] = [['undergraduate', 'Undergraduate'], ['postgraduate', 'Postgraduate'], ['diploma', 'Diploma or certificate'], ['matric', 'Matric (applying for first year)']]
const YEARS: [string, string][] = [['1', '1st year'], ['2', '2nd year'], ['3', '3rd year'], ['4', '4th year'], ['5', '5th year or later']]
const CITIZENSHIP: [string, string][] = [['citizen', 'SA citizen'], ['permanent_resident', 'Permanent resident'], ['other', 'Other']]
const STANDING: [string, string][] = [['good', 'Passed all modules'], ['some_failed', 'Failed some modules'], ['first_year', 'Not yet studying']]
const INSTITUTIONS: [string, string][] = [['university', 'Public university'], ['uot', 'University of technology'], ['tvet', 'TVET college'], ['private', 'Private institution']]
const MARKS: [DocumentMark, string][] = [['available', 'I have it'], ['missing', 'I need to get it'], ['unsure', 'Not sure']]

type Errors = Record<string, string>

export function ProgressStepper({ step, onJump }: { step: number; onJump: (step: number) => void }) {
  return <ol className="stepper" aria-label="Check progress">
    {STEPS.map((label, i) => {
      const done = i < step
      return <li key={label} className={i === step ? 'current' : done ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
        <button type="button" disabled={!done || step === RESULTS} onClick={() => onJump(i)} aria-label={`${label}${done ? ' (done)' : ''}`}>
          <span className="step-dot">{done && <Icon name="tick" size={14} strokeWidth={3} />}</span><span className="step-label">{label}</span>
        </button>
      </li>
    })}
  </ol>
}

function thresholdFields(requirements?: BursaryRequirements) {
  const fields = new Set<string>()
  for (const r of requirements?.requirements ?? []) if (r.rule === 'min_number' || r.rule === 'max_number') fields.add(String(r.params?.field))
  return fields
}

function validateStep(step: number, form: CheckFormState, requirements?: BursaryRequirements): Errors {
  const e: Errors = {}
  const { basics: b, eligibility: el } = form
  if (step === 0) {
    if (!form.bursaryId) e.bursaryId = 'Choose the bursary to check against.'
    if (!b.fullName.trim()) e.fullName = 'Enter your full name.'
    if (!b.institution.trim()) e.institution = 'Enter your institution.'
    if (!b.course.trim()) e.course = 'Enter your course.'
    if (!b.levelOfStudy) e.levelOfStudy = 'Choose your level of study.'
    if (!b.yearOfStudy) e.yearOfStudy = 'Choose your year of study.'
  }
  if (step === 1) {
    const needs = thresholdFields(requirements)
    if (!el.fundingYear) e.fundingYear = 'Choose the year you need funding for.'
    if (!el.faculty) e.faculty = 'Choose your field of study.'
    if (!el.citizenship) e.citizenship = 'Choose your citizenship.'
    const income = el.annualIncome.trim(), average = el.averagePercent.trim()
    if (needs.has('household_income_annual') && !income) e.annualIncome = 'This bursary has an income limit, so we need this.'
    else if (income && (!/^\d+$/.test(income))) e.annualIncome = 'Enter a whole number of rand, with no spaces or symbols.'
    if (needs.has('average_percent') && !average) e.averagePercent = 'This bursary has a minimum average, so we need this.'
    else if (average && !(Number(average) >= 0 && Number(average) <= 100)) e.averagePercent = 'Enter a percentage between 0 and 100.'
  }
  if (step === 2 && requirements) {
    for (const doc of documentChecklist(requirements)) if (!form.documents[doc.documentType]?.mark) e[`doc-${doc.documentType}`] = 'Upload it, or tell us whether you have it.'
  }
  return e
}

export function RequirementCheckPage() {
  const { session } = useAuth()
  const workspace = useWorkspace()
  const [params] = useSearchParams()
  const profile = userDetails(session?.user)
  const requested = params.get('bursary') ?? ''
  const fresh = (bursaryId: string): CheckFormState => {
    const f = emptyForm(bursaryId, {
      fullName: profile.full_name ?? '', institution: profile.institution ?? '', course: profile.course ?? '', yearOfStudy: profile.year_of_study ?? '',
    })
    return { ...f, eligibility: { ...f.eligibility, faculty: profile.field_of_study ?? '' } }
  }
  // Coming back to an unfinished check (same bursary, or none chosen) picks up where the student left off.
  const { draft, setDraft } = workspace
  const resumable = draft && (!requested || requested === draft.form.bursaryId) ? draft : undefined
  const [resumed, setResumed] = useState(!!resumable)
  const [form, setForm] = useState<CheckFormState>(() => resumable?.form ?? fresh(requested))
  const [step, setStep] = useState(resumable?.step ?? 0)
  const initialForm = useRef(form)
  useEffect(() => {
    if (step < RESULTS && (step > 0 || form !== initialForm.current)) setDraft({ form, step })
  }, [form, step, setDraft])
  const [errors, setErrors] = useState<Errors>({})
  const [result, setResult] = useState<CheckResult>()
  const [savedId, setSavedId] = useState<string>()
  const headingRef = useRef<HTMLHeadingElement>(null)

  const bursaries = useAsync(() => getBursaries(), [])
  const requirements = useAsync(() => getRequirements(form.bursaryId), [form.bursaryId], !form.bursaryId)
  const bursary = bursaries.data?.find(b => b.id === form.bursaryId)
  const checklist = useMemo(() => requirements.data ? documentChecklist(requirements.data) : [], [requirements.data])
  // Files the applicant linked to this bursary's documents, as the server will check them.
  const linked = useMemo(() => checklist.flatMap(doc => {
    const file = workspace.uploads.find(u => u.id === form.documents[doc.documentType]?.uploadId && u.status === 'pending')?.file
    return file ? [{ documentType: doc.documentType, file }] : []
  }), [checklist, form.documents, workspace.uploads])

  useEffect(() => { headingRef.current?.focus(); window.scrollTo({ top: 0 }) }, [step])

  const setBasics = (key: keyof CheckFormState['basics'], value: string) => setForm(f => ({ ...f, basics: { ...f.basics, [key]: value } }))
  const setAnswer = (key: keyof CheckFormState['eligibility'], value: string) => setForm(f => ({ ...f, eligibility: { ...f.eligibility, [key]: value } }))
  const setDoc = (type: string, patch: Partial<CheckFormState['documents'][string]>) =>
    setForm(f => ({ ...f, documents: { ...f.documents, [type]: { ...f.documents[type], note: f.documents[type]?.note ?? '', ...patch } } }))

  function next() {
    const found = validateStep(step, form, requirements.data)
    setErrors(found)
    if (Object.keys(found).length) return
    setStep(s => s + 1)
  }
  const back = () => { setErrors({}); setStep(s => Math.max(0, s - 1)) }

  function submit() {
    if (!bursary || !requirements.data) return
    for (const s of [0, 1, 2]) {
      const found = validateStep(s, form, requirements.data)
      if (Object.keys(found).length) { setErrors(found); setStep(s); return }
    }
    setResult(evaluateCheck(form, bursary, requirements.data))
    setSavedId(undefined)
    setStep(RESULTS)
    setDraft(undefined)
    setResumed(false)
  }

  function startOver() {
    setDraft(undefined)
    const f = fresh(requested)
    initialForm.current = f
    setForm(f); setStep(0); setErrors({}); setResumed(false)
  }

  function save() {
    if (!result || savedId) return
    const id = workspace.saveCheck(form.basics, result)
    for (const answer of Object.values(form.documents)) if (answer.uploadId) workspace.updateUpload(answer.uploadId, { applicationId: id })
    setSavedId(id)
  }

  function restart() {
    setForm(f => ({ ...emptyForm('', f.basics), eligibility: f.eligibility }))
    setResult(undefined); setSavedId(undefined); setErrors({}); setStep(0)
  }

  const errorCount = Object.keys(errors).length
  const content = (() => {
    if (step === 0) return <BasicsStep form={form} errors={errors} bursaries={bursaries} onBursary={id => setForm(f => ({ ...f, bursaryId: id, documents: {} }))} setBasics={setBasics} />
    if (!bursary) return <EmptyState icon="award" title="No bursary chosen" action={<button className="btn btn-primary" onClick={() => setStep(0)}>Choose a bursary</button>}>Pick a bursary first so we know which requirements to check.</EmptyState>
    if (requirements.loading) return <SkeletonCard lines={4} />
    if (requirements.error) return <AlertBanner tone="danger" title="Couldn't load this bursary's requirements" action={<button className="btn btn-secondary btn-sm" onClick={requirements.reload}>Try again</button>}>{requirements.error}</AlertBanner>
    if (step === 1) return <EligibilityStep form={form} errors={errors} requirements={requirements.data} setAnswer={setAnswer} />
    if (step === 2) return <DocumentsStep form={form} errors={errors} checklist={checklist} setDoc={setDoc} />
    if (step === 3) return <ReviewStep form={form} bursary={bursary} checklist={checklist} onEdit={setStep} />
    return result && requirements.data && <CheckResults result={result} requirements={requirements.data} saved={!!savedId} savedId={savedId} onSave={save} onRestart={restart} fullName={form.basics.fullName} linked={linked} />
  })()

  const subtitles = ['Make sure these match your official documents.', 'We compare your answers with the bursary\'s published criteria.', 'Upload what you have, or tell us what\'s still missing.', 'Check everything before we run your check.']

  return <div className="tab-page check-page">
    <SubHeader title={step === RESULTS ? 'Your result' : 'Check eligibility'} back={bursary ? `/bursaries/${bursary.id}` : '/dashboard'} />
    <div className="page-body narrow">
      {bursary && <div className="bursary-strip"><LogoTile name={bursary.funder} size="sm" /><div><strong>{bursary.title}</strong><DeadlineChip deadline={bursary.deadline} /></div></div>}
      <div className="stepper-card"><ProgressStepper step={step} onJump={s => { setErrors({}); setStep(s) }} /></div>
      {step < RESULTS && <div className="step-head"><h2 ref={headingRef} tabIndex={-1}>{STEPS[step] === 'Details' ? 'Your details' : STEPS[step]}</h2><p>{subtitles[step]}</p></div>}
      {step === RESULTS && <h2 ref={headingRef} tabIndex={-1} className="sr-only">Your result</h2>}
      {resumed && step < RESULTS && <AlertBanner tone="info" action={<button className="btn btn-ghost btn-sm" onClick={startOver}>Start over</button>}>We kept your answers from before, so you can carry on where you left off.</AlertBanner>}
      {errorCount > 0 && <AlertBanner tone="danger" title={step === 2 ? 'A few documents need an answer' : 'A few details need attention'}>{errorCount === 1 ? Object.values(errors)[0] : `Fix the ${errorCount} highlighted items to continue.`}</AlertBanner>}
      {content}
      {step < RESULTS && <div className="step-actions">
        {step < 3 && <button className="btn btn-primary btn-block" onClick={next} disabled={step > 0 && !requirements.data}>Next</button>}
        {step === 3 && <button className="btn btn-primary btn-block" onClick={submit}>Run my check</button>}
        {step > 0 && <button className="btn btn-secondary btn-block" onClick={back}>Back</button>}
      </div>}
    </div>
  </div>
}

function BasicsStep({ form, errors, bursaries, onBursary, setBasics }: {
  form: CheckFormState; errors: Errors; bursaries: AsyncState<Bursary[]>
  onBursary: (id: string) => void; setBasics: (key: keyof CheckFormState['basics'], value: string) => void
}) {
  const b = form.basics
  return <div className="form-card">
    {bursaries.loading ? <p className="muted"><Spinner /> Loading bursaries…</p>
      : bursaries.error ? <AlertBanner tone="danger" title="Couldn't load bursaries" action={<button className="btn btn-secondary btn-sm" onClick={bursaries.reload}>Try again</button>}>{bursaries.error}</AlertBanner>
      : !bursaries.data?.length ? <AlertBanner tone="warning">No open bursaries are listed right now. <Link to="/bursaries">Browse bursaries</Link></AlertBanner>
      : <SelectField label="Bursary" value={form.bursaryId} error={errors.bursaryId} options={bursaries.data.map(x => [x.id, x.title])} onChange={e => onBursary(e.target.value)}
        hint={<>Not sure? <Link to="/bursaries">Browse bursaries</Link></>} />}
    <TextField label="Full name" autoComplete="name" value={b.fullName} error={errors.fullName} onChange={e => setBasics('fullName', e.target.value)} hint="As it appears on your ID" />
    <TextField label="Institution" placeholder="e.g. University of Johannesburg" value={b.institution} error={errors.institution} onChange={e => setBasics('institution', e.target.value)} />
    <TextField label="Course" placeholder="e.g. BEng Electrical" value={b.course} error={errors.course} onChange={e => setBasics('course', e.target.value)} />
    <div className="form-grid">
      <SelectField label="Level of study" value={b.levelOfStudy} options={LEVELS} error={errors.levelOfStudy} onChange={e => setBasics('levelOfStudy', e.target.value)} />
      <SelectField label="Year of study" value={b.yearOfStudy} options={YEARS} error={errors.yearOfStudy} onChange={e => setBasics('yearOfStudy', e.target.value)} />
    </div>
  </div>
}

function EligibilityStep({ form, errors, requirements, setAnswer }: {
  form: CheckFormState; errors: Errors; requirements?: BursaryRequirements; setAnswer: (key: keyof CheckFormState['eligibility'], value: string) => void
}) {
  const el = form.eligibility
  const needs = thresholdFields(requirements)
  return <div className="form-card">
    <div className="form-grid">
      <SelectField label="Funding needed for" value={el.fundingYear} options={FUNDING_YEARS} error={errors.fundingYear} onChange={e => setAnswer('fundingYear', e.target.value)} />
      <SelectField label="Field of study" value={el.faculty} options={FACULTIES} error={errors.faculty} onChange={e => setAnswer('faculty', e.target.value)} />
    </div>
    <TextField label="Yearly household income (R)" inputMode="numeric" placeholder="e.g. 180 000" optional={!needs.has('household_income_annual')} value={el.annualIncome} error={errors.annualIncome}
      hint={<>Everyone in your household, before tax <InfoTooltip text="Add up the yearly income of your parents or guardians and anyone else who supports the household. Include grants and pensions." /></>}
      onChange={e => setAnswer('annualIncome', e.target.value.replace(/[\s,R]/g, ''))} />
    <TextField label="Latest average (%)" inputMode="decimal" placeholder="e.g. 65" optional={!needs.has('average_percent')} value={el.averagePercent} error={errors.averagePercent}
      hint="Your most recent final average" onChange={e => setAnswer('averagePercent', e.target.value.replace('%', '').trim())} />
    <RadioGroupField label="Citizenship" name="citizenship" value={el.citizenship} options={CITIZENSHIP} error={errors.citizenship} onChange={v => setAnswer('citizenship', v)} />
    <details className="more">
      <summary>More about you <span className="muted">(optional)</span></summary>
      <RadioGroupField label="Academic standing" name="standing" value={el.academicStanding} options={STANDING} onChange={v => setAnswer('academicStanding', v)} />
      <RadioGroupField label="Type of institution" name="institutionType" value={el.institutionType} options={INSTITUTIONS} onChange={v => setAnswer('institutionType', v)} />
      <TextareaField label="Special circumstances" optional hint="e.g. disability or a child-headed household" value={el.specialCircumstances} onChange={e => setAnswer('specialCircumstances', e.target.value)} />
    </details>
  </div>
}

function DocumentsStep({ form, errors, checklist, setDoc }: {
  form: CheckFormState; errors: Errors; checklist: ReturnType<typeof documentChecklist>; setDoc: (type: string, patch: Partial<CheckFormState['documents'][string]>) => void
}) {
  const { uploads, addFile } = useWorkspace()
  const [busy, setBusy] = useState<string>()
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({})
  if (!checklist.length) return <EmptyState icon="file" title="No documents listed">This bursary hasn't published a document list. Check the funder's site.</EmptyState>

  async function upload(type: string, file: File) {
    setBusy(type)
    const item = await addFile(file, type)
    setBusy(undefined)
    if (item.status === 'failed') return setUploadErrors(e => ({ ...e, [type]: item.error ?? 'This file was rejected.' }))
    setUploadErrors(e => ({ ...e, [type]: '' }))
    setDoc(type, { uploadId: item.id, mark: 'available' })
  }

  return <ul className="upload-cards">{checklist.map(doc => {
    const answer = form.documents[doc.documentType] ?? { note: '' }
    const attached = uploads.find(u => u.id === answer.uploadId)
    const suggestion = !attached && uploads.find(u => u.documentType === doc.documentType && u.status === 'pending')
    const error = errors[`doc-${doc.documentType}`] || uploadErrors[doc.documentType]
    const inputId = `file-${doc.documentType}`
    return <li key={doc.documentType} className={`upload-card${error ? ' has-error' : ''}${attached ? ' done' : ''}`}>
      <div className="upload-card-head">
        <h3>{doc.label}</h3>
        {answer.mark && <StatusChip status={answer.mark === 'available' ? 'passed' : answer.mark === 'missing' ? 'failed' : 'needs_review'} label={attached ? 'Uploaded' : MARKS.find(m => m[0] === answer.mark)?.[1]} />}
      </div>
      {doc.conditions.length > 0 && <ul className="conditions">{doc.conditions.map(c => <li key={c}>{c}</li>)}</ul>}
      {attached
        ? <div className="file-row"><Icon name="file" size={18} /><span><strong>{attached.fileName}</strong><small>{formatSize(attached.size)}</small></span>
            <button className="btn btn-ghost btn-sm" onClick={() => setDoc(doc.documentType, { uploadId: undefined, mark: undefined })}>Remove</button></div>
        : <div className="upload-actions">
            <label htmlFor={inputId} className={`btn btn-primary btn-sm${busy === doc.documentType ? ' is-busy' : ''}`}>
              {busy === doc.documentType ? <><Spinner label="Checking file" />Checking…</> : <><Icon name="upload" size={16} />Choose file</>}
            </label>
            <input id={inputId} type="file" className="sr-only" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(doc.documentType, f) }} />
            {suggestion && <button className="btn btn-secondary btn-sm" onClick={() => setDoc(doc.documentType, { uploadId: suggestion.id, mark: 'available' })}>Use {suggestion.fileName}</button>}
          </div>}
      {!attached && <>
        <p className="upload-hint">PDF, JPG or PNG under {MAX_FILE_MB} MB. No file yet? Tell us instead:</p>
        <RadioGroupField label="Do you have this document?" name={`doc-${doc.documentType}`} value={answer.mark ?? ''} options={MARKS} onChange={v => setDoc(doc.documentType, { mark: v as DocumentMark })} />
      </>}
      {error && <p className="inline-error"><Icon name="alert" size={14} />{error}</p>}
    </li>
  })}</ul>
}

function ReviewStep({ form, bursary, checklist, onEdit }: { form: CheckFormState; bursary: Bursary; checklist: ReturnType<typeof documentChecklist>; onEdit: (step: number) => void }) {
  const { basics: b, eligibility: el } = form
  const label = (options: [string, string][], v: string) => options.find(o => o[0] === v)?.[1] ?? '—'
  const sections: [string, number, [string, string][]][] = [
    ['Your details', 0, [['Bursary', bursary.title], ['Name', b.fullName], ['Studying', `${b.course}, ${b.institution}`], ['Year', label(YEARS, b.yearOfStudy)]]],
    ['Eligibility', 1, [['Funding for', el.fundingYear], ['Field', label(FACULTIES, el.faculty)], ['Household income', el.annualIncome ? formatRand(Number(el.annualIncome)) : 'Not given'],
      ['Average', el.averagePercent ? `${el.averagePercent}%` : 'Not given'], ['Citizenship', label(CITIZENSHIP, el.citizenship)]]],
  ]
  return <div className="review">
    {sections.map(([title, s, rows]) => <section key={title} className="review-card">
      <div className="review-head"><h3>{title}</h3><button className="pill-btn" onClick={() => onEdit(s)}><Icon name="edit" size={14} />Edit</button></div>
      <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </section>)}
    <section className="review-card">
      <div className="review-head"><h3>Documents</h3><button className="pill-btn" onClick={() => onEdit(2)}><Icon name="edit" size={14} />Edit</button></div>
      <ul className="review-docs">{checklist.map(doc => {
        const answer = form.documents[doc.documentType]
        const mark = answer?.mark
        return <li key={doc.documentType}><span>{doc.label}</span><StatusChip status={mark === 'available' ? 'passed' : mark === 'missing' ? 'failed' : 'needs_review'} label={answer?.uploadId ? 'Uploaded' : MARKS.find(m => m[0] === mark)?.[1] ?? 'Not answered'} /></li>
      })}</ul>
    </section>
  </div>
}
