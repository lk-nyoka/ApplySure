import type { Basics, CheckResult } from '../check/evaluate'
import { supabase } from './supabase'

// Saved applications and bookmarks in Supabase (see supabase/migrations/0001_applications_and_saved.sql).
// Row-level security limits every query to the signed-in student's own rows. Documents are never sent here.

export interface StoredCheck { id: string; basics: Basics; result: CheckResult; notes: string; updatedAt: string }

/** Thrown when the tables have not been created yet, so the app can fall back to this-tab-only memory. */
export class CloudUnavailable extends Error {}

const MISSING_TABLE = new Set(['PGRST205', '42P01', 'PGRST202'])

function fail(error: { code?: string; message: string } | null): asserts error is null {
  if (!error) return
  if (error.code && MISSING_TABLE.has(error.code)) throw new CloudUnavailable(error.message)
  throw new Error('We couldn\'t save your changes. Check your connection; they will be kept until you leave this page.')
}

function client() {
  if (!supabase) throw new CloudUnavailable('Supabase is not configured')
  return supabase
}

export async function loadWorkspace(): Promise<{ checks: StoredCheck[]; saved: string[] }> {
  const db = client()
  const [checks, saved] = await Promise.all([
    db.from('application_checks').select('id, basics, result, notes, updated_at').order('updated_at', { ascending: false }).limit(200),
    db.from('saved_bursaries').select('bursary_id').order('created_at', { ascending: false }).limit(500),
  ])
  fail(checks.error); fail(saved.error)
  return {
    checks: (checks.data ?? []).map(r => ({ id: r.id, basics: r.basics as Basics, result: r.result as CheckResult, notes: r.notes, updatedAt: r.updated_at })),
    saved: (saved.data ?? []).map(r => r.bursary_id as string),
  }
}

export async function insertCheck(check: StoredCheck) {
  const { error } = await client().from('application_checks').insert({
    id: check.id, bursary_id: check.result.bursary.id, bursary_title: check.result.bursary.title.slice(0, 300),
    basics: check.basics, result: check.result, notes: check.notes,
  })
  fail(error)
}

export async function updateCheckNotes(id: string, notes: string) {
  const { error } = await client().from('application_checks').update({ notes: notes.slice(0, 4000) }).eq('id', id)
  fail(error)
}

export async function deleteCheck(id: string) {
  const { error } = await client().from('application_checks').delete().eq('id', id)
  fail(error)
}

export async function setSaved(bursaryId: string, on: boolean) {
  const db = client()
  const { error } = on
    ? await db.from('saved_bursaries').upsert({ bursary_id: bursaryId }, { onConflict: 'user_id,bursary_id', ignoreDuplicates: true })
    : await db.from('saved_bursaries').delete().eq('bursary_id', bursaryId)
  fail(error)
}

/** Permanently deletes the account and, through cascades, every saved application and bookmark. */
export async function deleteMyAccount() {
  const { error } = await client().rpc('delete_my_account')
  fail(error)
}
