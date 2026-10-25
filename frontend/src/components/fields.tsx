import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { Icon } from './icons'

interface FieldShellProps { label: string; hint?: ReactNode; error?: string; id: string; children: ReactNode; optional?: boolean }

function FieldShell({ label, hint, error, id, children, optional }: FieldShellProps) {
  return <div className={`field${error ? ' has-error' : ''}`}>
    <label htmlFor={id}>{label}{optional && <span className="optional"> (optional)</span>}</label>
    {children}
    {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="inline-error" id={`${id}-error`}><Icon name="alert" size={14} />{error}</p>}
  </div>
}

const describedBy = (id: string, hint?: ReactNode, error?: string) => error ? `${id}-error` : hint ? `${id}-hint` : undefined

type TextFieldProps = { label: string; hint?: ReactNode; error?: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>

export function TextField({ label, hint, error, optional, id: given, ...input }: TextFieldProps) {
  const auto = useId(), id = given ?? auto
  return <FieldShell {...{ label, hint, error, id, optional }}><input id={id} aria-invalid={!!error} aria-describedby={describedBy(id, hint, error)} {...input} /></FieldShell>
}

export function PasswordField({ label, hint, error, id: given, ...input }: TextFieldProps) {
  const auto = useId(), id = given ?? auto
  const [visible, setVisible] = useState(false)
  return <FieldShell {...{ label, hint, error, id }}>
    <div className="password-wrap">
      <input id={id} type={visible ? 'text' : 'password'} aria-invalid={!!error} aria-describedby={describedBy(id, hint, error)} {...input} />
      <button type="button" className="icon-btn" onClick={() => setVisible(v => !v)} aria-label={visible ? 'Hide password' : 'Show password'}><Icon name={visible ? 'eyeOff' : 'eye'} size={18} /></button>
    </div>
  </FieldShell>
}

type SelectFieldProps = { label: string; hint?: ReactNode; error?: string; optional?: boolean; options: [string, string][]; placeholder?: string } & SelectHTMLAttributes<HTMLSelectElement>

export function SelectField({ label, hint, error, optional, options, placeholder = 'Choose…', id: given, ...select }: SelectFieldProps) {
  const auto = useId(), id = given ?? auto
  return <FieldShell {...{ label, hint, error, id, optional }}>
    <select id={id} aria-invalid={!!error} aria-describedby={describedBy(id, hint, error)} {...select}>
      <option value="">{placeholder}</option>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </FieldShell>
}

type TextareaFieldProps = { label: string; hint?: ReactNode; optional?: boolean } & TextareaHTMLAttributes<HTMLTextAreaElement>

export function TextareaField({ label, hint, optional, id: given, ...area }: TextareaFieldProps) {
  const auto = useId(), id = given ?? auto
  return <FieldShell {...{ label, hint, id, optional }}><textarea id={id} rows={3} aria-describedby={describedBy(id, hint)} {...area} /></FieldShell>
}

export function RadioGroupField({ label, name, value, options, onChange, hint, error }: { label: string; name: string; value: string; options: [string, string][]; onChange: (value: string) => void; hint?: string; error?: string }) {
  const id = useId()
  return <fieldset className={`field radio-group${error ? ' has-error' : ''}`} aria-describedby={describedBy(id, hint, error)}>
    <legend>{label}</legend>
    <div className="radio-options">{options.map(([v, text]) => <label key={v} className={`radio-pill${value === v ? ' selected' : ''}`}>
      <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />{text}
    </label>)}</div>
    {hint && !error && <p className="hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="inline-error" id={`${id}-error`}><Icon name="alert" size={14} />{error}</p>}
  </fieldset>
}

export function CheckboxField({ label, error, ...input }: { label: ReactNode; error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return <div className={`checkbox-field${error ? ' has-error' : ''}`}>
    <input type="checkbox" id={id} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} {...input} />
    <label htmlFor={id}>{label}</label>
    {error && <p className="inline-error" id={`${id}-error`}><Icon name="alert" size={14} />{error}</p>}
  </div>
}

export function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return <div className="toggle-row">
    <div><label htmlFor={id}>{label}</label>{description && <p>{description}</p>}</div>
    <button id={id} type="button" role="switch" aria-checked={checked} className="toggle" disabled={disabled} onClick={() => onChange(!checked)}><span /></button>
  </div>
}

export function InfoTooltip({ text }: { text: string }) {
  return <span className="tooltip" tabIndex={0} aria-label={text}><Icon name="info" size={16} /><span role="tooltip">{text}</span></span>
}
