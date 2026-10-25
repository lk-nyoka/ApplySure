import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckboxField, PasswordField, TextField } from '../../components/fields'
import { supabase } from '../../lib/supabase'
import { AuthNotice, AuthShell, authErrorMessage } from './AuthShell'

export const MIN_PASSWORD = 8

export function PasswordStrengthHint({ password }: { password: string }) {
  const checks = [
    [password.length >= MIN_PASSWORD, `${MIN_PASSWORD}+ characters`],
    [/[A-Za-z]/.test(password) && /\d/.test(password), 'Letters and numbers'],
    [password.length >= 12, '12+ characters is stronger'],
  ] as const
  return <ul className="strength" aria-label="Password guidance">{checks.map(([ok, text]) => <li key={text} className={ok ? 'ok' : ''}>{ok ? '✓' : '•'} {text}</li>)}</ul>
}

interface Values { fullName: string; email: string; password: string; confirmPassword: string; acceptTerms: boolean }

function validate(v: Values) {
  const errors: Partial<Record<keyof Values, string>> = {}
  if (!v.fullName.trim()) errors.fullName = 'Enter your full name.'
  if (!/^\S+@\S+\.\S+$/.test(v.email)) errors.email = 'Enter a valid email address.'
  if (v.password.length < MIN_PASSWORD) errors.password = `Use at least ${MIN_PASSWORD} characters.`
  if (v.confirmPassword !== v.password) errors.confirmPassword = 'Passwords don\'t match.'
  if (!v.acceptTerms) errors.acceptTerms = 'You need to accept the terms to continue.'
  return errors
}

export function SignupPage() {
  const [values, setValues] = useState<Values>({ fullName: '', email: '', password: '', confirmPassword: '', acceptTerms: false })
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof Values, string>>>({})
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues(v => ({ ...v, [key]: value }))

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!supabase) return
    const errors = validate(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length) return
    setBusy(true)
    setError('')
    try {
      const { data, error } = await supabase.auth.signUp({
        email: values.email, password: values.password,
        options: { data: { full_name: values.fullName.trim() }, emailRedirectTo: `${location.origin}/dashboard` },
      })
      if (error) throw error
      if (data.session) navigate('/dashboard')
      else setSuccessMessage(`We sent a confirmation link to ${values.email}. Open it to activate your account, then sign in. If you already have an account, sign in instead.`)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally { setBusy(false) }
  }

  if (successMessage) return <AuthShell title="Check your email" subtitle="One more step to finish creating your account.">
    <AuthNotice tone="success">{successMessage}</AuthNotice>
    <Link className="btn btn-primary btn-block" to="/login">Back to sign in</Link>
  </AuthShell>

  return <AuthShell title="Create your account" subtitle="Start preparing your bursary applications.">
    <form onSubmit={submit} noValidate>
      <TextField label="Full name" autoComplete="name" value={values.fullName} error={fieldErrors.fullName} onChange={e => set('fullName', e.target.value)} />
      <TextField label="Email address" type="email" autoComplete="email" value={values.email} error={fieldErrors.email} onChange={e => set('email', e.target.value)} />
      <PasswordField label="Password" autoComplete="new-password" value={values.password} error={fieldErrors.password} onChange={e => set('password', e.target.value)} />
      <PasswordStrengthHint password={values.password} />
      <PasswordField label="Confirm password" autoComplete="new-password" value={values.confirmPassword} error={fieldErrors.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
      <CheckboxField label={<>I accept the <Link to="/terms">terms</Link> and <Link to="/privacy">privacy notice</Link>. If I'm under 18, my parent or guardian agrees.</>} checked={values.acceptTerms} error={fieldErrors.acceptTerms} onChange={e => set('acceptTerms', e.target.checked)} />
      {error && <AuthNotice tone="danger">{error}</AuthNotice>}
      <button className="btn btn-primary btn-block" disabled={busy} type="submit">{busy ? 'Creating account…' : 'Create account'}</button>
    </form>
    <p className="switch">Already registered? <Link to="/login">Sign in</Link></p>
  </AuthShell>
}
