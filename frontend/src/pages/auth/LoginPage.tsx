import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { CheckboxField, PasswordField, TextField } from '../../components/fields'
import { setRememberSession, supabase } from '../../lib/supabase'
import { AuthNotice, AuthShell, authErrorMessage } from './AuthShell'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/dashboard'

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      setRememberSession(rememberMe)
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate(from, { replace: true })
    } catch (e) {
      setError(authErrorMessage(e))
    } finally { setBusy(false) }
  }

  return <AuthShell title="Welcome back" subtitle="Sign in to continue your applications.">
    <form onSubmit={submit} noValidate={false}>
      <TextField label="Email address" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
      <PasswordField label="Password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
      <div className="auth-row">
        <CheckboxField label="Remember me" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} />
        <Link to="/forgot-password">Forgot password?</Link>
      </div>
      {error && <AuthNotice tone="danger">{error}</AuthNotice>}
      <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <p className="switch">New here? <Link to="/signup">Create an account</Link></p>
  </AuthShell>
}
