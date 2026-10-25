export const formatDate = (value: string | Date) =>
  new Date(value).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })

export const formatTime = (value: string | Date) =>
  new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })

export const formatRand = (value: number) =>
  new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(value)

export const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`

export const titleCase = (value: string) =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

export function daysUntil(value: string) {
  const ms = new Date(value).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)
  return Math.round(ms / 86_400_000)
}
