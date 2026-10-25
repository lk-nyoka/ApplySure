import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Basics, CheckFormState, CheckResult } from '../check/evaluate'
import * as cloud from '../lib/cloud'

// Applications and saved bursaries are kept in the student's Supabase account (row-level security:
// own rows only). If the tables don't exist yet they live in this tab only, and the UI says so.
// Uploaded files are never sent to storage: they stay in this tab and are read only during a check.

/** 'cloud' once loaded from the account; 'local' when this tab is the only copy. */
export type Persistence = 'loading' | 'cloud' | 'local'

export const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png']
export const ACCEPTED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
export const MAX_FILE_MB = 10

export const DOCUMENT_TYPES: Record<string, string> = {
  id_document: 'ID document',
  academic_record: 'Academic record',
  proof_of_income: 'Proof of income',
  proof_of_residence: 'Proof of residence',
  bank_confirmation: 'Bank confirmation',
  parent_id_document: 'Parent or guardian ID',
  registration_letter: 'Registration or acceptance letter',
  motivation_letter: 'Motivation letter',
  cv: 'CV',
  other: 'Other',
}

export type UploadStatus = 'pending' | 'failed'
export interface UploadItem {
  id: string
  file: File | null
  fileName: string
  fileType: string
  size: number
  status: UploadStatus
  error?: string
  documentType: string
  applicationId?: string
  expiresOn?: string
  note: string
  addedAt: string
}

export interface CheckRecord { id: string; basics: Basics; result: CheckResult; notes: string; updatedAt: string }

export interface ActivityItem { id: string; kind: 'check' | 'upload' | 'note'; text: string; at: string }

/** An unfinished check, so leaving by accident never means starting over. Memory only: never synced. */
export interface CheckDraft { form: CheckFormState; step: number }

interface Workspace {
  persistence: Persistence
  /** Set when the last save failed; the change is still shown and kept for this visit. */
  syncError?: string
  checks: CheckRecord[]
  uploads: UploadItem[]
  activity: ActivityItem[]
  saved: string[]
  draft?: CheckDraft
  setDraft: (draft: CheckDraft | undefined) => void
  toggleSaved: (bursaryId: string) => void
  saveCheck: (basics: Basics, result: CheckResult) => string
  updateCheckNotes: (id: string, notes: string) => void
  removeCheck: (id: string) => void
  addFiles: (files: File[]) => Promise<void>
  /** Validates one file for a known document type; returns the new item (status 'failed' if rejected). */
  addFile: (file: File, documentType: string) => Promise<UploadItem>
  updateUpload: (id: string, patch: Partial<Pick<UploadItem, 'documentType' | 'applicationId' | 'expiresOn' | 'note'>>) => void
  removeUpload: (id: string) => void
  clear: () => void
}

const WorkspaceContext = createContext<Workspace | null>(null)

const signatures: [string, number[]][] = [
  ['application/pdf', [0x25, 0x50, 0x44, 0x46]],
  ['image/png', [0x89, 0x50, 0x4e, 0x47]],
  ['image/jpeg', [0xff, 0xd8, 0xff]],
]

/** Rejects files whose size, extension or leading bytes don't match an accepted type. */
async function validate(file: File): Promise<string | null> {
  const name = file.name.toLowerCase()
  if (!ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext))) return 'Only PDF, JPG and PNG files are accepted.'
  if (file.size === 0) return 'This file is empty.'
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `Files must be ${MAX_FILE_MB} MB or smaller.`
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const detected = signatures.find(([, bytes]) => bytes.every((b, i) => head[i] === b))?.[0]
  if (!detected) return 'The file contents don\'t look like a PDF, JPG or PNG.'
  if (file.type && file.type !== detected) return 'The file type doesn\'t match its contents.'
  return null
}

function guessType(name: string) {
  const n = name.toLowerCase()
  if (/\bid\b|identity|passport/.test(n)) return 'id_document'
  if (/transcript|academic|results|record/.test(n)) return 'academic_record'
  if (/income|payslip|salary|sassa|affidavit/.test(n)) return 'proof_of_income'
  if (/residence|address|utility|municipal/.test(n)) return 'proof_of_residence'
  if (/bank/.test(n)) return 'bank_confirmation'
  return 'other'
}

const now = () => new Date().toISOString()

export function WorkspaceProvider({ userId, children }: { userId: string | undefined; children: ReactNode }) {
  const [checks, setChecks] = useState<CheckRecord[]>([])
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [draft, setDraft] = useState<CheckDraft>()
  const [persistence, setPersistence] = useState<Persistence>('loading')
  const [syncError, setSyncError] = useState<string>()
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const log = useCallback((kind: ActivityItem['kind'], text: string) =>
    setActivity(items => [{ id: crypto.randomUUID(), kind, text, at: now() }, ...items].slice(0, 30)), [])

  const clear = useCallback(() => { setChecks([]); setUploads([]); setActivity([]); setSaved([]); setDraft(undefined) }, [])

  // A different (or no) user must never see the previous user's workspace.
  useEffect(() => clear, [userId, clear])

  useEffect(() => {
    if (!userId) return
    let current = true
    setPersistence('loading')
    cloud.loadWorkspace().then(
      data => { if (current) { setChecks(data.checks); setSaved(data.saved); setPersistence('cloud') } },
      (e: unknown) => { if (current) { setPersistence('local'); if (!(e instanceof cloud.CloudUnavailable)) setSyncError((e as Error).message) } },
    )
    return () => { current = false }
  }, [userId])

  /** Runs a save when the account is the store of record; failures are shown, not thrown. */
  const sync = useCallback((save: () => Promise<void>) => {
    if (persistence !== 'cloud') return
    save().then(() => setSyncError(undefined), (e: unknown) => setSyncError(e instanceof Error ? e.message : 'Saving failed.'))
  }, [persistence])

  const toItem = useCallback(async (file: File, documentType: string): Promise<UploadItem> => {
    const error = await validate(file)
    return {
      id: crypto.randomUUID(), file: error ? null : file, fileName: file.name, fileType: file.type || 'unknown',
      size: file.size, status: error ? 'failed' : 'pending', error: error ?? undefined, documentType, note: '', addedAt: now(),
    }
  }, [])

  const value = useMemo<Workspace>(() => ({
    persistence, syncError, checks, uploads, activity, saved, clear, draft, setDraft,
    toggleSaved(bursaryId) {
      const on = !saved.includes(bursaryId)
      setSaved(ids => on ? [bursaryId, ...ids] : ids.filter(i => i !== bursaryId))
      sync(() => cloud.setSaved(bursaryId, on))
    },
    saveCheck(basics, result) {
      const record = { id: crypto.randomUUID(), basics, result, notes: '', updatedAt: result.createdAt }
      setChecks(items => [record, ...items])
      log('check', `Checked readiness for ${result.bursary.title}`)
      sync(() => cloud.insertCheck(record))
      return record.id
    },
    updateCheckNotes(id, notes) {
      setChecks(items => items.map(c => c.id === id ? { ...c, notes, updatedAt: now() } : c))
      // Notes are typed a character at a time: save once typing pauses.
      clearTimeout(noteTimers.current.get(id))
      noteTimers.current.set(id, setTimeout(() => sync(() => cloud.updateCheckNotes(id, notes)), 700))
    },
    removeCheck(id) {
      setChecks(items => items.filter(c => c.id !== id))
      setUploads(items => items.map(u => u.applicationId === id ? { ...u, applicationId: undefined } : u))
      sync(() => cloud.deleteCheck(id))
    },
    async addFiles(files) {
      const added = await Promise.all(files.map(file => toItem(file, guessType(file.name))))
      setUploads(items => [...added, ...items])
      const ok = added.filter(a => a.status === 'pending').length
      if (ok) log('upload', `Added ${ok} document${ok === 1 ? '' : 's'}`)
    },
    async addFile(file, documentType) {
      const item = await toItem(file, documentType)
      // A rejected file is reported to the caller only; it never joins the document list.
      if (item.status === 'pending') {
        setUploads(items => [item, ...items])
        log('upload', `Added ${DOCUMENT_TYPES[documentType] ?? 'a document'}`)
      }
      return item
    },
    updateUpload(id, patch) {
      setUploads(items => items.map(u => u.id === id ? { ...u, ...patch } : u))
    },
    removeUpload(id) {
      setUploads(items => items.filter(u => u.id !== id))
    },
  }), [persistence, syncError, checks, uploads, activity, saved, draft, clear, log, toItem, sync])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return value
}
