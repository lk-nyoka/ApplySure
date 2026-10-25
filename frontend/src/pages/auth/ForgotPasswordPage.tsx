import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { PasswordField, TextField } from '../../components/fields'
import { supabase } from '../../lib/supabase'
import { AuthNotice, AuthShell, authErrorMessage } from './AuthShell'
import { MIN_PASSWORD, PasswordStrengthHint } from './SignupPage'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [confirmationSent, setConfirmationSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` })
      if (error) throw error
      setConfirmationSent(true)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally { setBusy(false) }
  }

  return <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password.">
    {confirmationSent
      ? <AuthNotice tone="success">If an account exists for {email}, a reset link is on its way. The link expires, so use it soon.</AuthNotice>
      : <form onSubmit={submit}>
        <TextField label="Email address" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>}
    <p className="switch"><Link to="/login">Back to sign in</Link></p>
  </AuthShell>
}

export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    if (password.length < MIN_PASSWORD) return setError(`Use at least ${MIN_PASSWORD} characters.`)
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      navigate('/dashboard', { replace: true })
    } catch (e) {
      setError(authErrorMessage(e))
    } finally { setBusy(false) }
  }

  if (loading) return <main className="center" role="status">Checking your reset link…</main>
  if (!session) return <AuthShell title="Link expired" subtitle="This reset link is invalid or has already been used.">
    <Link className="btn btn-primary btn-block" to="/forgot-password">Request a new link</Link>
  </AuthShell>

  return <AuthShell title="Choose a new password" subtitle="You'll stay signed in after saving it.">
    <form onSubmit={submit}>
      <PasswordField label="New password" autoComplete="new-password" required value={password} error={error || undefined} onChange={e => setPassword(e.target.value)} />
      <PasswordStrengthHint password={password} />
      <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save password'}</button>
    </form>
  </AuthShell>
}
