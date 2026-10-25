import { useState } from 'react'
import { Icon } from '../components/icons'
import { AlertBanner, SessionOnlyNote, Spinner, SubHeader } from '../components/ui'
import { formatDate, formatSize } from '../lib/format'
import { ACCEPTED_EXTENSIONS, DOCUMENT_TYPES, MAX_FILE_MB, useWorkspace, type UploadItem } from '../workspace/WorkspaceProvider'

// The documents most bursaries ask for come first; the rest sit under "More document types".
const COMMON = ['id_document', 'academic_record', 'proof_of_income', 'proof_of_residence', 'bank_confirmation']

function open(item: UploadItem) {
  if (!item.file) return
  const url = URL.createObjectURL(item.file)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function DocumentSlot({ type }: { type: string }) {
  const { uploads, addFile, removeUpload } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const files = uploads.filter(u => u.documentType === type && u.status === 'pending')
  const inputId = `doc-${type}`

  async function add(file: File) {
    setBusy(true)
    const item = await addFile(file, type)
    setBusy(false)
    setError(item.status === 'failed' ? item.error ?? 'This file was rejected.' : '')
  }

  return <li className={`upload-card${files.length ? ' done' : ''}${error ? ' has-error' : ''}`}>
    <div className="upload-card-head"><h3>{DOCUMENT_TYPES[type]}</h3>{files.length > 0 && <span className="pill pill-success"><Icon name="circleCheck" size={14} />Uploaded</span>}</div>
    {files.map(f => <div key={f.id} className="file-row"><Icon name="file" size={18} />
      <span><strong>{f.fileName}</strong><small>{formatSize(f.size)} · added {formatDate(f.addedAt)}</small></span>
      <button className="btn btn-ghost btn-sm" onClick={() => open(f)}>View</button>
      <button className="icon-btn" aria-label={`Remove ${f.fileName}`} onClick={() => removeUpload(f.id)}><Icon name="trash" size={18} /></button>
    </div>)}
    <div className="upload-actions">
      <label htmlFor={inputId} className={`btn btn-sm ${files.length ? 'btn-secondary' : 'btn-primary'}`}>
        {busy ? <><Spinner label="Checking file" />Checking…</> : <><Icon name="upload" size={16} />{files.length ? 'Add another' : 'Choose file'}</>}
      </label>
      <input id={inputId} type="file" className="sr-only" accept={ACCEPTED_EXTENSIONS.join(',')} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void add(f) }} />
      {!files.length && <span className="upload-hint">PDF, JPG or PNG under {MAX_FILE_MB} MB</span>}
    </div>
    {error && <p className="inline-error"><Icon name="alert" size={14} />{error}</p>}
  </li>
}

export function DocumentsPage() {
  const { uploads } = useWorkspace()
  const others = Object.keys(DOCUMENT_TYPES).filter(t => !COMMON.includes(t))
  const ready = COMMON.filter(t => uploads.some(u => u.documentType === t && u.status === 'pending')).length
  return <div className="tab-page">
    <SubHeader title="My documents" />
    <div className="page-body narrow">
      <div className="doc-progress"><div><strong>{ready} of {COMMON.length}</strong> common documents ready</div><div className="progress"><span style={{ width: `${(ready / COMMON.length) * 100}%` }} /></div></div>
      <AlertBanner tone="info">Your files stay on this device. When you run a document check, they're read once to check them and nothing is stored.</AlertBanner>
      <ul className="upload-cards">{COMMON.map(t => <DocumentSlot key={t} type={t} />)}</ul>
      <details className="more">
        <summary>More document types</summary>
        <ul className="upload-cards">{others.map(t => <DocumentSlot key={t} type={t} />)}</ul>
      </details>
      <SessionOnlyNote />
    </div>
  </div>
}
