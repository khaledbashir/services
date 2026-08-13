/**
 * Pure formatting + ranking for the ticket digests.
 *
 * Joe Occhipinti, 2026-08-13: "Can I get an email or slack each morning at 8am
 * New York time with a recap of all tickets that are still open ... I'd like to
 * see - Venue - assignee - days since last update - Latest update with date
 * included."  Charlie Dinh, same thread: the Salesforce-era report emails —
 * new tickets, tickets closed in the last 24 hours, escalated tickets.
 *
 * Nothing in this file touches the database, the network, or `@/` aliases, so
 * `node --test` can import it directly and assert the exact wording and order
 * that lands in Joe's inbox.
 */

export type DigestReport = 'open-review' | 'new-24h' | 'closed-24h' | 'escalated'

export interface DigestTicket {
  id: string
  ticketNumber: number
  title: string
  status: string
  priority: string
  venue: string
  assignee: string
  /** ISO timestamp of the newest note, or of ticket creation when there is none. */
  lastUpdateAt: string | null
  /** "Aug 12, 2026" in New York time. */
  lastUpdateDate: string
  daysSinceUpdate: number
  latestUpdate: string
  latestUpdateAuthor: string
  /** Where `latestUpdate` came from — a real note, the opening description, or nothing. */
  latestUpdateSource: 'note' | 'opened' | 'none'
  createdDate: string
  closedDate?: string
  url: string
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'New',
  on_hold: 'On Hold',
  in_progress: 'In Progress',
  escalated: 'Escalated',
  closed: 'Closed',
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

/** Stalest first — that is the entire point of a review list. */
const STATUS_TIEBREAK: Record<string, number> = {
  escalated: 0,
  new: 1,
  in_progress: 2,
  on_hold: 3,
  closed: 4,
}

export const UNASSIGNED_ASSIGNEE = 'Unassigned'
export const UNKNOWN_VENUE = 'No venue set'
export const NO_UPDATE_TEXT = 'No update logged since the ticket was opened.'

/**
 * Whole days between two instants, floored. Used for "days since last update",
 * which reads better as 0/1/2 than as a fractional age.
 */
export function daysSince(fromIso: string | Date | null | undefined, now: Date): number {
  if (!fromIso) return 0
  const from = fromIso instanceof Date ? fromIso : new Date(fromIso)
  if (Number.isNaN(from.getTime())) return 0
  const ms = now.getTime() - from.getTime()
  if (ms <= 0) return 0
  return Math.floor(ms / 86_400_000)
}

export function daysLabel(days: number): string {
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day'
  return `${days} days`
}

/**
 * Collapse a note down to something readable inside a table cell.
 *
 * Email-sourced comments arrive with the quoted thread stapled underneath, so
 * the reply history is cut at the first quote marker before truncating —
 * otherwise every row would show the same signature block instead of the
 * update Joe actually wants to read.
 */
export function summariseUpdate(body: string | null | undefined, maxChars = 700): string {
  if (!body) return ''
  let text = String(body).replace(/\r\n/g, '\n')

  // Cut the tail an email client staples on: the quoted thread, the signature
  // block, and the mailing-list boilerplate. ANC tickets are opened straight
  // from venue email, so without this the "latest update" column fills up with
  // unsubscribe links instead of what the tech actually said.
  const tailMarkers = [
    /\n-{2,}\s*Original Message\s*-{2,}/i,
    /\nOn .{5,120} wrote:/,
    /\nFrom:.*\nSent:/i,
    /\n_{10,}/,
    /\n--\s*\n/,
    /\nTo unsubscribe from this group/i,
    /\nTo view this discussion visit/i,
    /\nYou received this message because you are subscribed/i,
    /\nThis (e-?mail|message) and any (files|attachments)/i,
  ]
  for (const marker of tailMarkers) {
    const m = text.match(marker)
    if (m && m.index !== undefined && m.index > 0) text = text.slice(0, m.index)
  }

  text = text
    // Drop quoted lines.
    .split('\n')
    .filter((line) => !/^\s*>/.test(line))
    .join(' ')
    // Outlook inline-image placeholders carry no meaning in a text digest.
    .replace(/\[cid:[^\]]*\]/gi, ' ')
    // Outlook repeats every link as "text<url>" — the bracketed copy is noise.
    .replace(/<((?:https?|mailto):[^>\s]*)>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (text.length <= maxChars) return text
  // Prefer a word boundary so the cut does not land mid-word.
  const cut = text.slice(0, maxChars)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Review order: longest-untouched first, then by status urgency, then by ticket
 * number so the list is stable between runs when nothing has changed.
 */
export function sortForReview(rows: DigestTicket[]): DigestTicket[] {
  return [...rows].sort((a, b) => {
    if (b.daysSinceUpdate !== a.daysSinceUpdate) return b.daysSinceUpdate - a.daysSinceUpdate
    const sa = STATUS_TIEBREAK[a.status] ?? 9
    const sb = STATUS_TIEBREAK[b.status] ?? 9
    if (sa !== sb) return sa - sb
    return a.ticketNumber - b.ticketNumber
  })
}

export interface ReviewSummary {
  total: number
  stale7: number
  stale14: number
  unassigned: number
  escalated: number
  untouchedToday: number
}

export function summariseReview(rows: DigestTicket[]): ReviewSummary {
  return {
    total: rows.length,
    stale7: rows.filter((r) => r.daysSinceUpdate >= 7).length,
    stale14: rows.filter((r) => r.daysSinceUpdate >= 14).length,
    unassigned: rows.filter((r) => r.assignee === UNASSIGNED_ASSIGNEE).length,
    escalated: rows.filter((r) => r.status === 'escalated').length,
    untouchedToday: rows.filter((r) => r.daysSinceUpdate === 0).length,
  }
}

/**
 * The shared SELECT. `latest_*` comes from the newest surviving note on the
 * ticket; the roster line keeps the primary owner first so "assignee" means
 * the same thing here as it does on the ticket itself.
 */
export const TICKET_DIGEST_SELECT = `
  SELECT t.id,
         t.ticket_number,
         t.title,
         t.status,
         t.priority,
         t.description,
         t.created_at,
         t.resolved_at,
         t.updated_at,
         v.name                                        AS venue_name,
         s.full_name                                   AS primary_assignee,
         roster.names                                  AS roster_names,
         c.body                                        AS latest_body,
         c.created_at                                  AS latest_at,
         COALESCE(NULLIF(TRIM(c.author_name), ''), ca.full_name) AS latest_author,
         TO_CHAR(t.created_at   AT TIME ZONE 'America/New_York', 'Mon DD, YYYY') AS created_date_et,
         TO_CHAR(t.resolved_at  AT TIME ZONE 'America/New_York', 'Mon DD, YYYY') AS closed_date_et,
         TO_CHAR(c.created_at   AT TIME ZONE 'America/New_York', 'Mon DD, YYYY') AS latest_date_et
    FROM tickets t
    LEFT JOIN venues v ON v.id = t.venue_id
    LEFT JOIN staff  s ON s.id = t.assigned_to
    LEFT JOIN LATERAL (
      SELECT c2.body, c2.created_at, c2.author_name, c2.author_id
        FROM ticket_comments c2
       WHERE c2.ticket_id = t.id AND c2.deleted_at IS NULL
       ORDER BY c2.created_at DESC
       LIMIT 1
    ) c ON true
    LEFT JOIN staff ca ON ca.id = c.author_id
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(s2.full_name ORDER BY (s2.id = t.assigned_to) DESC, s2.full_name) AS names
        FROM ticket_assignees ta
        JOIN staff s2 ON s2.id = ta.staff_id
       WHERE ta.ticket_id = t.id
    ) roster ON true
`

/** The raw shape the digest SELECT returns, before it becomes a DigestTicket. */
export interface RawTicketRow {
  id: string
  ticket_number: number
  title: string
  status: string
  priority: string
  description: string | null
  created_at: string
  resolved_at: string | null
  venue_name: string | null
  primary_assignee: string | null
  roster_names: string[] | null
  latest_body: string | null
  latest_at: string | null
  latest_author: string | null
  created_date_et: string | null
  closed_date_et: string | null
  latest_date_et: string | null
}

/**
 * Who the ticket belongs to. The primary owner leads; extra techs on the roster
 * are counted rather than listed so the column stays one line wide.
 */
export function assigneeLabel(row: RawTicketRow): string {
  const roster = (row.roster_names || []).filter(Boolean)
  const primary = row.primary_assignee || roster[0] || null
  if (!primary) return UNASSIGNED_ASSIGNEE
  const others = roster.filter((n) => n !== primary).length
  return others > 0 ? `${primary} +${others}` : primary
}

/**
 * Row → digest ticket. Lives here, beside the renderers and away from the
 * database client, so the scheduled send, the in-app view and any one-off run
 * are all reading the same mapping rather than three copies of it.
 */
export function mapTicketRow(row: RawTicketRow, now: Date, baseUrl: string): DigestTicket {
  const hasNote = Boolean(row.latest_at)
  // "Days since last update" counts from the newest note, because that is the
  // same thing the "Latest update" column shows. Falling back to updated_at
  // would let a silent status flip report a ticket as fresh while the note
  // beside it is a month old.
  const anchorIso = row.latest_at || row.created_at
  const noteText = hasNote ? summariseUpdate(row.latest_body) : ''
  const openingText = summariseUpdate(row.description)

  let latestUpdate = noteText
  let latestUpdateSource: DigestTicket['latestUpdateSource'] = 'note'
  if (!noteText) {
    if (openingText) {
      latestUpdate = openingText
      latestUpdateSource = 'opened'
    } else {
      latestUpdate = NO_UPDATE_TEXT
      latestUpdateSource = 'none'
    }
  }

  const anchorDate = anchorIso ? new Date(anchorIso) : null

  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title || '(no title)',
    status: row.status,
    priority: row.priority,
    venue: row.venue_name || UNKNOWN_VENUE,
    assignee: assigneeLabel(row),
    lastUpdateAt: anchorDate && !Number.isNaN(anchorDate.getTime()) ? anchorDate.toISOString() : null,
    lastUpdateDate: (hasNote ? row.latest_date_et : row.created_date_et) || '',
    daysSinceUpdate: daysSince(anchorIso, now),
    latestUpdate,
    latestUpdateAuthor: hasNote ? row.latest_author || '' : '',
    latestUpdateSource,
    createdDate: row.created_date_et || '',
    closedDate: row.closed_date_et || undefined,
    url: `${baseUrl.replace(/\/+$/, '')}/tickets/${row.id}`,
  }
}

export function escapeHtml(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Slack mrkdwn escaping — only the three characters Slack treats as markup. */
export function escapeSlack(v: unknown): string {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ANC house colours, same palette as the ticket emails already in flight.
const NAVY = '#002C73'
const BLUE = '#0A52EF'

function pill(label: string, value: number, tone: 'neutral' | 'warn' | 'alert'): string {
  const bg = tone === 'alert' ? '#fef2f2' : tone === 'warn' ? '#fffbeb' : '#f1f5f9'
  const fg = tone === 'alert' ? '#b91c1c' : tone === 'warn' ? '#b45309' : '#334155'
  return `<td style="padding:0 8px 0 0"><div style="background:${bg};color:${fg};border-radius:6px;padding:8px 12px;font-size:12px;line-height:1.3"><div style="font-size:18px;font-weight:700">${value}</div>${escapeHtml(label)}</div></td>`
}

function staleColor(days: number): string {
  if (days >= 14) return '#b91c1c'
  if (days >= 7) return '#b45309'
  return '#334155'
}

function shell(title: string, subtitle: string, inner: string, footer: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f8fafc;padding:24px">
  <div style="max-width:920px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden">
    <div style="background:${NAVY};color:#ffffff;padding:20px 24px">
      <div style="font-size:18px;font-weight:700">${escapeHtml(title)}</div>
      <div style="font-size:13px;opacity:0.75;margin-top:4px">${escapeHtml(subtitle)}</div>
    </div>
    <div style="padding:20px 24px">
${inner}
    </div>
    <div style="border-top:1px solid #e2e8f0;padding:14px 24px;font-size:11px;color:#94a3b8;line-height:1.5">${footer}</div>
  </div>
</div>`
}

export interface EmailContext {
  /** "Wednesday, August 13, 2026" in New York time. */
  dateLabel: string
  baseUrl: string
}

/**
 * Joe's daily recap. Columns are his, in his order: Venue, Assignee, Days since
 * last update, Latest update with its date.
 */
export function renderOpenReviewEmail(rows: DigestTicket[], ctx: EmailContext): string {
  const sorted = sortForReview(rows)
  const s = summariseReview(sorted)
  const reviewUrl = `${ctx.baseUrl}/tickets/open-review`

  if (sorted.length === 0) {
    return shell(
      'Open Ticket Review',
      ctx.dateLabel,
      `<p style="margin:0;font-size:14px;color:#1e293b">No open tickets this morning — every ticket on the board is closed.</p>
      <p style="margin:16px 0 0"><a href="${reviewUrl}" style="background:${BLUE};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open the review</a></p>`,
      'Sent every morning at 8:00 AM New York time.'
    )
  }

  const pills = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px"><tr>
${pill('Open', s.total, 'neutral')}
${pill('Escalated', s.escalated, s.escalated > 0 ? 'alert' : 'neutral')}
${pill('7+ days quiet', s.stale7, s.stale7 > 0 ? 'warn' : 'neutral')}
${pill('14+ days quiet', s.stale14, s.stale14 > 0 ? 'alert' : 'neutral')}
${pill('Unassigned', s.unassigned, s.unassigned > 0 ? 'warn' : 'neutral')}
  </tr></table>`

  const body = sorted
    .map((r) => {
      const update =
        r.latestUpdateSource === 'none'
          ? `<span style="color:#94a3b8">${NO_UPDATE_TEXT}</span>`
          : `<div style="color:#64748b;font-size:11px;margin-bottom:3px">${escapeHtml(r.lastUpdateDate)}${
              r.latestUpdateAuthor ? ` · ${escapeHtml(r.latestUpdateAuthor)}` : ''
            }${r.latestUpdateSource === 'opened' ? ' · opening note' : ''}</div>${escapeHtml(r.latestUpdate)}`
      return `<tr style="border-top:1px solid #e2e8f0;vertical-align:top">
  <td style="padding:10px 10px 10px 0;font-size:12px;white-space:nowrap"><a href="${r.url}" style="color:${BLUE};text-decoration:none;font-weight:600">T-${String(r.ticketNumber).padStart(5, '0')}</a><div style="color:#64748b;margin-top:2px">${escapeHtml(STATUS_LABELS[r.status] || r.status)}</div></td>
  <td style="padding:10px 10px 10px 0;font-size:13px;color:#0f172a"><div style="font-weight:600">${escapeHtml(r.venue)}</div><div style="color:#64748b;font-size:12px;margin-top:2px">${escapeHtml(r.title)}</div></td>
  <td style="padding:10px 10px 10px 0;font-size:13px;color:#0f172a;white-space:nowrap">${escapeHtml(r.assignee)}</td>
  <td style="padding:10px 10px 10px 0;font-size:13px;font-weight:600;white-space:nowrap;color:${staleColor(r.daysSinceUpdate)}">${escapeHtml(daysLabel(r.daysSinceUpdate))}</td>
  <td style="padding:10px 0;font-size:13px;color:#1e293b;line-height:1.5">${update}</td>
</tr>`
    })
    .join('\n')

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
  <tr style="text-align:left">
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Ticket</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Venue</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Assignee</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Since last update</th>
    <th style="padding:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Latest update</th>
  </tr>
${body}
</table>
<p style="margin:18px 0 0"><a href="${reviewUrl}" style="background:${BLUE};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open the review</a></p>`

  return shell(
    'Open Ticket Review',
    `${ctx.dateLabel} · ${s.total} open ticket${s.total === 1 ? '' : 's'}`,
    pills + table,
    'Sent every morning at 8:00 AM New York time. &ldquo;Since last update&rdquo; counts from the newest note on the ticket; tickets with no notes count from the day they were opened.'
  )
}

/** Charlie's Salesforce-parity reports share one simpler layout. */
export function renderActivityEmail(
  report: Exclude<DigestReport, 'open-review'>,
  rows: DigestTicket[],
  ctx: EmailContext
): string {
  const meta: Record<string, { title: string; empty: string; dateHeader: string; footer: string }> = {
    'new-24h': {
      title: 'New Tickets — Last 24 Hours',
      empty: 'No new tickets were opened in the last 24 hours.',
      dateHeader: 'Opened',
      footer: 'Covers every ticket opened in the 24 hours before 8:00 AM New York time.',
    },
    'closed-24h': {
      title: 'Tickets Closed — Last 24 Hours',
      empty: 'No tickets were closed in the last 24 hours.',
      dateHeader: 'Closed',
      footer: 'Covers every ticket closed in the 24 hours before 8:00 AM New York time.',
    },
    escalated: {
      title: 'Escalated Tickets',
      empty: 'Nothing is sitting at escalated right now.',
      dateHeader: 'Opened',
      footer: 'Every open ticket currently marked escalated, longest-quiet first.',
    },
  }
  const m = meta[report]
  const sorted = report === 'escalated' ? sortForReview(rows) : [...rows].sort((a, b) => b.ticketNumber - a.ticketNumber)
  const listUrl = `${ctx.baseUrl}/tickets`

  if (sorted.length === 0) {
    return shell(m.title, ctx.dateLabel, `<p style="margin:0;font-size:14px;color:#1e293b">${escapeHtml(m.empty)}</p>`, m.footer)
  }

  const body = sorted
    .map((r) => {
      const when = report === 'closed-24h' ? r.closedDate || r.lastUpdateDate : r.createdDate
      const update =
        r.latestUpdateSource === 'none'
          ? `<span style="color:#94a3b8">${NO_UPDATE_TEXT}</span>`
          : `<div style="color:#64748b;font-size:11px;margin-bottom:3px">${escapeHtml(r.lastUpdateDate)}${
              r.latestUpdateAuthor ? ` · ${escapeHtml(r.latestUpdateAuthor)}` : ''
            }</div>${escapeHtml(r.latestUpdate)}`
      return `<tr style="border-top:1px solid #e2e8f0;vertical-align:top">
  <td style="padding:10px 10px 10px 0;font-size:12px;white-space:nowrap"><a href="${r.url}" style="color:${BLUE};text-decoration:none;font-weight:600">T-${String(r.ticketNumber).padStart(5, '0')}</a></td>
  <td style="padding:10px 10px 10px 0;font-size:13px;color:#0f172a"><div style="font-weight:600">${escapeHtml(r.venue)}</div><div style="color:#64748b;font-size:12px;margin-top:2px">${escapeHtml(r.title)}</div></td>
  <td style="padding:10px 10px 10px 0;font-size:13px;color:#0f172a;white-space:nowrap">${escapeHtml(r.assignee)}</td>
  <td style="padding:10px 10px 10px 0;font-size:13px;color:#334155;white-space:nowrap">${escapeHtml(when)}</td>
  <td style="padding:10px 0;font-size:13px;color:#1e293b;line-height:1.5">${update}</td>
</tr>`
    })
    .join('\n')

  const table = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
  <tr style="text-align:left">
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Ticket</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Venue</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Assignee</th>
    <th style="padding:0 10px 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${escapeHtml(m.dateHeader)}</th>
    <th style="padding:0 0 8px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#64748b">Latest update</th>
  </tr>
${body}
</table>
<p style="margin:18px 0 0"><a href="${listUrl}" style="background:${BLUE};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Open tickets</a></p>`

  return shell(m.title, `${ctx.dateLabel} · ${sorted.length} ticket${sorted.length === 1 ? '' : 's'}`, table, m.footer)
}

/**
 * Slack version of the review. A 40-row table is unreadable in Slack, so the
 * message leads with the counts and lists the quietest tickets — and says out
 * loud how many it left off rather than pretending the list is complete.
 */
export function renderOpenReviewSlack(
  rows: DigestTicket[],
  ctx: EmailContext,
  listLimit = 15
): { text: string; blocks: unknown[] } {
  const sorted = sortForReview(rows)
  const s = summariseReview(sorted)
  const reviewUrl = `${ctx.baseUrl}/tickets/open-review`

  if (sorted.length === 0) {
    const text = `Open Ticket Review — ${ctx.dateLabel}: no open tickets.`
    return {
      text,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `:white_check_mark: *Open Ticket Review* — ${escapeSlack(ctx.dateLabel)}\nNo open tickets this morning.\n<${reviewUrl}|Open the review>` } },
      ],
    }
  }

  const shown = sorted.slice(0, listLimit)
  const hidden = sorted.length - shown.length

  const lines = shown.map((r) => {
    const update =
      r.latestUpdateSource === 'none'
        ? '_no update logged_'
        : `${escapeSlack(summariseUpdate(r.latestUpdate, 180))} _(${escapeSlack(r.lastUpdateDate)})_`
    return `*<${r.url}|T-${String(r.ticketNumber).padStart(5, '0')}>* · ${escapeSlack(r.venue)} · ${escapeSlack(r.assignee)} · *${escapeSlack(daysLabel(r.daysSinceUpdate))}* since last update\n${update}`
  })

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:clipboard: *Open Ticket Review* — ${escapeSlack(ctx.dateLabel)}\n*${s.total}* open · *${s.escalated}* escalated · *${s.stale7}* quiet 7+ days · *${s.unassigned}* unassigned`,
      },
    },
    { type: 'divider' },
  ]

  // Slack rejects a section over 3000 chars, so the list is chunked rather than
  // truncated — every ticket that made the cut is actually shown.
  let buffer: string[] = []
  let bufferLen = 0
  for (const line of lines) {
    if (bufferLen + line.length + 2 > 2800 && buffer.length > 0) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer.join('\n\n') } })
      buffer = []
      bufferLen = 0
    }
    buffer.push(line)
    bufferLen += line.length + 2
  }
  if (buffer.length > 0) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: buffer.join('\n\n') } })

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text:
          (hidden > 0
            ? `Showing the ${shown.length} quietest of ${sorted.length} open tickets — ${hidden} more in the full review. `
            : '') + `<${reviewUrl}|Open Ticket Review>`,
      },
    ],
  })

  return {
    text: `Open Ticket Review — ${sorted.length} open tickets, ${s.stale7} quiet for 7+ days.`,
    blocks,
  }
}

/** Subject lines — the report names people actually recognise. */
export const REPORT_SUBJECTS: Record<DigestReport, (count: number, dateLabel: string) => string> = {
  'open-review': (count, d) => `Open Ticket Review — ${count} open ticket${count === 1 ? '' : 's'} — ${d}`,
  'new-24h': (count, d) => `New Tickets (last 24 hours) — ${count} — ${d}`,
  'closed-24h': (count, d) => `Tickets Closed (last 24 hours) — ${count} — ${d}`,
  escalated: (count, d) => `Escalated Tickets — ${count} open — ${d}`,
}
