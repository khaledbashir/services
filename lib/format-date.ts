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
