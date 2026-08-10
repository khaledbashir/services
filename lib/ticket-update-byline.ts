/**
 * Distribution emails used to say only "New Comment:" — recipients could not
 * tell who wrote it or when without opening the ticket (Charlie 2026-08-10).
 * Every comment/update heading now carries the author and an ET timestamp.
 *
 * Returns an HTML fragment appended directly after the heading, or an empty
 * string when there is nothing to say. ANC operates on Eastern time, so the
 * stamp is rendered in America/New_York regardless of where the host runs.
 */

const TIMEZONE = 'America/New_York'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatTicketUpdateTimestamp(occurredAt?: Date | string | null): string {
  const value = occurredAt ? new Date(occurredAt) : new Date()
  if (Number.isNaN(value.getTime())) return ''

  const date = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(value)
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value)

  return `${date} at ${time} ET`
}

export function ticketUpdateByline(
  authorName?: string | null,
  occurredAt?: Date | string | null,
): string {
  const name = typeof authorName === 'string' ? authorName.trim() : ''
  const stamp = formatTicketUpdateTimestamp(occurredAt)
  const parts = [name ? escapeHtml(name) : '', stamp].filter(Boolean)
  if (parts.length === 0) return ''

  return ` <span style="font-weight:400;color:#64748b">— ${parts.join(' · ')}</span>`
}
