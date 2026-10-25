import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const configurationError = !url || !key || url.includes('your-project') || key.includes('your-')
  ? 'Add your Supabase project URL and publishable key to frontend/.env, then restart Vite.'
  : null

// "Remember me" decides whether the session survives closing the browser: localStorage when
// remembered, sessionStorage otherwise. The flag itself is the only thing kept regardless.
const REMEMBER_KEY = 'aos.remember'

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}

export function setRememberSession(remember: boolean) {
  safe(() => localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0'), undefined)
}

const remembered = () => safe(() => localStorage.getItem(REMEMBER_KEY) !== '0', true)

const sessionStore = {
  getItem: (k: string) => safe(() => localStorage.getItem(k) ?? sessionStorage.getItem(k), null),
  setItem: (k: string, v: string) => safe(() => {
    const [keep, drop] = remembered() ? [localStorage, sessionStorage] : [sessionStorage, localStorage]
    keep.setItem(k, v)
    drop.removeItem(k)
  }, undefined),
  removeItem: (k: string) => safe(() => { localStorage.removeItem(k); sessionStorage.removeItem(k) }, undefined),
}

export const supabase: SupabaseClient | null = configurationError
  ? null
  : createClient(url, key, { auth: { storage: sessionStore } })
