/**
 * Format a date input (ISO timestamp, date string, Date) as "Mon DD, YYYY".
 * Returns a dash when the input is missing or unparseable so we never surface
 * raw ISO strings to the UI.
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return '—'
  const iso = typeof input === 'string' ? input : input.toISOString()
  // `2022-10-27` (date-only) — parse locally to avoid UTC-midnight shift
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a wall-clock time like "15:30" or "3:30 PM" or a timestamptz ISO
 * into "3:30 PM". Returns empty string when nothing parseable is supplied.
 */
export function formatTime(input: string | Date | null | undefined): string {
  if (!input) return ''
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return ''
    return input.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  const raw = input.trim()
  if (!raw) return ''
  // Bare HH:MM[:SS] — format without timezone math so "18:00" doesn't drift.
  const wall = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw)
  if (wall) {
    const h = Number(wall[1])
    const m = Number(wall[2])
    if (h > 23 || m > 59) return raw
    const suffix = h >= 12 ? 'PM' : 'AM'
    const hour12 = ((h + 11) % 12) + 1
    return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`
  }
  const d = new Date(raw)
  if (isNaN(d.getTime())) return raw
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/**
 * Combine a date and optional time into "Mon DD, YYYY · 3:30 PM".
 * Either field may be null; the separator is dropped when one side is empty.
 */
export function formatDateTime(
  dateInput: string | Date | null | undefined,
  timeInput?: string | Date | null | undefined
): string {
  const d = formatDate(dateInput)
  const t = formatTime(timeInput)
  if (d === '—' && !t) return '—'
  if (!t) return d
  if (d === '—') return t
  return `${d} · ${t}`
}
