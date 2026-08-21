/**
 * The trail of what already happened on a ticket, for the bottom of a
 * notification email (Jireh, 2026-08-21: "Does it make sense on the ticket
 * notification emails to have the history of the updates included below the
 * current update?").
 *
 * It does. These emails go to the venue's distribution list — on the Capital
 * One Arena ticket that prompted the question, four people at Monumental are
 * on the To line — and each one lands with a single line of new information
 * and no memory of the last three. The reader has to go hunting through their
 * own inbox to find out what "new → in progress" follows.
 *
 * WHAT GOES IN IS THE POINT. Only two kinds of entry qualify:
 *
 *   - a comment that is NOT internal (`ticket_comments.is_internal = false`)
 *   - a status change
 *
 * Both are things that already sent their own email to this same distribution
 * list, so the history repeats what these recipients were told rather than
 * revealing anything new. Internal notes, priority juggling and category
 * changes never emailed the client and never appear here. That rule is the
 * safety of this feature: widen it and an internal aside reaches the venue.
 */
/**
 * Self-contained on purpose: every module under test in tests/ is, because the
 * suites import the TypeScript source directly and Node will not follow a
 * path alias. The stamp below must read exactly like the one the update
 * heading uses — ticket-update-byline.ts owns that one, and
 * tests/ticket-history.test.mjs asserts the two never drift apart.
 */
const TIMEZONE = 'America/New_York'

export function formatHistoryTimestamp(occurredAt?: Date | string | null): string {
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

/** How many earlier entries an email carries before it starts to be noise. */
export const HISTORY_LIMIT = 5
/** A comment is summarised, not reprinted — the original email had it in full. */
export const HISTORY_BODY_CHARS = 240

export type TicketHistoryEntry = {
  at: Date | string | null
  who: string | null
  what: string
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** "in_progress" reads as a database value; the client should see English. */
export function humanizeTicketStatus(value?: string | null): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function describeStatusChange(from?: string | null, to?: string | null): string {
  const before = humanizeTicketStatus(from)
  const after = humanizeTicketStatus(to)
  if (!after) return ''
  return before ? `Status updated: ${before} → ${after}` : `Status updated: ${after}`
}

/** One line of a comment: no markup, no line breaks, no wall of text. */
export function summarizeComment(body?: string | null): string {
  const text = String(body ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length <= HISTORY_BODY_CHARS) return text
  const cut = text.slice(0, HISTORY_BODY_CHARS)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 60 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '')}…`
}

export type CommentRow = {
  body: string | null
  author_name?: string | null
  created_at: Date | string | null
}

export type ActivityRow = {
  action: string
  details?: Record<string, unknown> | string | null
  author_name?: string | null
  created_at: Date | string | null
}

function parseDetails(details: ActivityRow['details']): Record<string, unknown> {
  if (!details) return {}
  if (typeof details === 'string') {
    try {
      return JSON.parse(details) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return details
}

const time = (value: Date | string | null | undefined): number => {
  if (!value) return 0
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

/**
 * Merges the two sources into one newest-first trail.
 *
 * `exclude` is the text of the update the email is announcing: the comment or
 * the activity row is usually already written when the email goes out, and
 * repeating it directly above itself reads as a bug.
 */
export function buildTicketHistory(
  comments: CommentRow[],
  activity: ActivityRow[],
  opts: { limit?: number; exclude?: string | null } = {},
): TicketHistoryEntry[] {
  const limit = opts.limit ?? HISTORY_LIMIT
  const exclude = String(opts.exclude ?? '').trim()

  const entries: TicketHistoryEntry[] = []

  for (const comment of comments || []) {
    const what = summarizeComment(comment.body)
    if (what) entries.push({ at: comment.created_at, who: comment.author_name || null, what })
  }

  for (const row of activity || []) {
    if (row.action !== 'ticket_status_change') continue
    const details = parseDetails(row.details)
    const what = describeStatusChange(
      details.old_status as string | null,
      details.new_status as string | null,
    )
    if (what) entries.push({ at: row.created_at, who: row.author_name || null, what })
  }

  return entries
    .filter((entry) => !exclude || summarizeComment(entry.what) !== summarizeComment(exclude))
    .sort((a, b) => time(b.at) - time(a.at))
    .slice(0, limit)
}

/**
 * The block that goes under the current update. Empty string when there is no
 * history — a heading over nothing is worse than no heading.
 */
export function ticketHistoryHtml(
  entries: TicketHistoryEntry[],
  opts: { more?: number } = {},
): string {
  if (!entries || entries.length === 0) return ''

  const rows = entries
    .map((entry) => {
      const stamp = formatHistoryTimestamp(entry.at)
      const who = entry.who ? escapeHtml(String(entry.who).trim()) : ''
      const meta = [stamp, who].filter(Boolean).join(' · ')
      return `<p style="margin:0 0 10px;font-size:13px;color:#475569;line-height:1.5">
        ${meta ? `<span style="color:#94a3b8">${meta}</span><br>` : ''}${escapeHtml(entry.what)}
      </p>`
    })
    .join('')

  const more =
    opts.more && opts.more > 0
      ? `<p style="margin:0;font-size:12px;color:#94a3b8">and ${opts.more} earlier update${opts.more === 1 ? '' : 's'}.</p>`
      : ''

  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 12px">
    <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.04em;text-transform:uppercase">Earlier on this ticket</p>
    ${rows}${more}`
}
