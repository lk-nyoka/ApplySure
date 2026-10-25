import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthState { session: Session | null; loading: boolean }
const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: !!supabase })
  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(({ data, error }) => {
      if (active) setState({ session: error ? null : data.session, loading: false })
    }).catch(() => { if (active) setState({ session: null, loading: false }) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setState({ session, loading: false })
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** Profile details kept in Supabase user metadata until a profiles table exists. */
export interface UserDetails {
  full_name?: string; institution?: string; course?: string; year_of_study?: string; field_of_study?: string
  /** Academic year the student needs funding for, e.g. "2027". */
  funding_year?: string
  /** Set once the student finishes or skips the quick setup, so it isn't shown again. */
  onboarded?: string
}

export const userDetails = (user: User | undefined): UserDetails => (user?.user_metadata ?? {}) as UserDetails

export function displayName(user: User | undefined) {
  return userDetails(user).full_name?.trim() || user?.email?.split('@')[0] || 'there'
}
