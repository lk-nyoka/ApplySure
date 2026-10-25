import type { ApplicationCheck, Bursary, BursaryRequirements } from '../models'
import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

// Each message says what happened and what to do next, in plain words, without blaming the applicant.
const SERVER_TROUBLE = 'Something went wrong on our side. Your answers are still here, so try again in a minute.'
const statusMessages: Record<number, string> = {
  401: 'You were signed out to keep your account safe. Sign in again to carry on.',
  403: "This isn't available on your account. Go back and try another option.",
  404: "We couldn't find that. It may have been removed, so go back and pick another.",
  409: "This bursary's requirements aren't published yet. Check back soon or try another bursary.",
  413: 'Those files are too big to send together. Remove one or two and try again.',
  422: "Some details couldn't be read. Check the highlighted fields and try again.",
  429: 'Lots of checks are running right now. Wait a minute, then try again.',
  500: SERVER_TROUBLE,
  502: SERVER_TROUBLE,
  503: 'Document checking is busy right now. Your files are still here, so try again in a few minutes.',
  504: 'This took too long to answer. Your answers are still here, so try again.',
}

export const OFFLINE_MESSAGE = "You're offline. We'll load this again as soon as you reconnect."

// For these statuses the server sends a message written for the applicant (e.g. why a file was rejected).
const SERVER_MESSAGE_STATUSES = new Set([413, 422, 429, 503])

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw new ApiError('Please sign in again', 401)
  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${session.access_token}` } })
  } catch {
    throw new ApiError(navigator.onLine ? "We couldn't reach ApplySure. Check your connection, then try again." : OFFLINE_MESSAGE, 0)
  }
  if (!response.ok) {
    let message = statusMessages[response.status] ?? SERVER_TROUBLE
    if (SERVER_MESSAGE_STATUSES.has(response.status)) {
      const body = await response.json().catch(() => null) as { detail?: unknown } | null
      if (typeof body?.detail === 'string' && body.detail !== 'Invalid request') message = body.detail
    }
    throw new ApiError(message, response.status)
  }
  // A misrouted /api (e.g. served by the web host instead of the API) returns HTML, not JSON.
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new ApiError("We couldn't reach the ApplySure service. Try again in a minute.", 502)
  }
  return response.json() as Promise<T>
}

export const apiGet = <T>(path: string) => request<T>(path)

export interface BursaryFilters { year?: number; faculty?: string; course?: string; includeClosed?: boolean }

export function getBursaries(filters: BursaryFilters = {}) {
  const query = new URLSearchParams()
  if (filters.year) query.set('year', String(filters.year))
  if (filters.faculty) query.set('faculty', filters.faculty)
  if (filters.course) query.set('course', filters.course)
  if (filters.includeClosed) query.set('include_closed', 'true')
  const suffix = query.size ? `?${query}` : ''
  return apiGet<Bursary[]>(`/api/bursaries${suffix}`)
}

export const getRequirements = (bursaryId: string) =>
  apiGet<BursaryRequirements>(`/api/bursaries/${encodeURIComponent(bursaryId)}/requirements`)

export const getSampleCheck = (bursaryId: string) =>
  apiGet<ApplicationCheck>(`/api/checks/sample?bursary_id=${encodeURIComponent(bursaryId)}`)

export interface DocumentCheckInput {
  bursaryId: string
  fullName: string
  idNumber?: string
  address?: string
  documents: { documentType: string; file: File }[]
}

/** Sends the applicant's files to be read and checked. The server reads them in memory and keeps nothing. */
export function runDocumentCheck(input: DocumentCheckInput) {
  const form = new FormData()
  form.set('bursary_id', input.bursaryId)
  form.set('full_name', input.fullName)
  if (input.idNumber) form.set('id_number', input.idNumber)
  if (input.address) form.set('address', input.address)
  for (const { documentType, file } of input.documents) {
    form.append('document_types', documentType)
    form.append('files', file, file.name)
  }
  return request<ApplicationCheck>('/api/checks', { method: 'POST', body: form })
}
