/**
 * Ticket digest data layer — the queries behind the Open Ticket Review and the
 * Salesforce-parity activity reports.
 *
 * Joe Occhipinti 2026-08-13: a daily 8:00 AM New York recap of every ticket
 * still open, showing venue, assignee, days since last update, and the latest
 * update with its date.  Charlie Dinh, same thread: the three report emails
 * Salesforce used to send — new tickets, tickets closed in the last 24 hours,
 * escalated tickets.
 *
 * Everything renders from one row shape so the emailed recap, the Slack post
 * and the in-app view can never disagree with each other.
 */

import { query } from '@/lib/db'
import {
  DigestReport,
  DigestTicket,
  NO_UPDATE_TEXT,
  UNASSIGNED_ASSIGNEE,
  UNKNOWN_VENUE,
  daysSince,
  sortForReview,
  summariseUpdate,
} from '@/lib/ticket-digest-format'

export const DIGEST_REPORTS: DigestReport[] = ['open-review', 'new-24h', 'closed-24h', 'escalated']

export function isDigestReport(v: string): v is DigestReport {
  return (DIGEST_REPORTS as string[]).includes(v)
}

function baseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/+$/, '')
}

/**
 * The shared SELECT. `latest_*` comes from the newest surviving note on the
 * ticket; the roster line keeps the primary owner first so "assignee" means
 * the same thing here as it does on the ticket itself.
 */
const TICKET_SELECT = `
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

interface RawRow {
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
function assigneeLabel(row: RawRow): string {
  const roster = (row.roster_names || []).filter(Boolean)
  const primary = row.primary_assignee || roster[0] || null
  if (!primary) return UNASSIGNED_ASSIGNEE
  const others = roster.filter((n) => n !== primary).length
  return others > 0 ? `${primary} +${others}` : primary
}

function toDigestTicket(row: RawRow, now: Date): DigestTicket {
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

  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    title: row.title || '(no title)',
    status: row.status,
    priority: row.priority,
    venue: row.venue_name || UNKNOWN_VENUE,
    assignee: assigneeLabel(row),
    lastUpdateAt: anchorIso ? new Date(anchorIso).toISOString() : null,
    lastUpdateDate: (hasNote ? row.latest_date_et : row.created_date_et) || '',
    daysSinceUpdate: daysSince(anchorIso, now),
    latestUpdate,
    latestUpdateAuthor: hasNote ? row.latest_author || '' : '',
    latestUpdateSource,
    createdDate: row.created_date_et || '',
    closedDate: row.closed_date_et || undefined,
    url: `${baseUrl()}/tickets/${row.id}`,
  }
}

/**
 * Every ticket that is not closed. Merged duplicates are folded into their
 * primary ticket and never counted twice — same rule the tickets list uses.
 */
export async function getOpenTicketReview(now: Date = new Date()): Promise<DigestTicket[]> {
  const r = await query(
    `${TICKET_SELECT}
     WHERE t.status <> 'closed'
       AND t.merged_into_ticket_id IS NULL`
  )
  return sortForReview((r.rows as RawRow[]).map((row) => toDigestTicket(row, now)))
}

export async function getNewTickets(hours = 24, now: Date = new Date()): Promise<DigestTicket[]> {
  const r = await query(
    `${TICKET_SELECT}
     WHERE t.merged_into_ticket_id IS NULL
       AND t.created_at >= NOW() - ($1 || ' hours')::interval
     ORDER BY t.ticket_number DESC`,
    [String(hours)]
  )
  return (r.rows as RawRow[]).map((row) => toDigestTicket(row, now))
}

export async function getClosedTickets(hours = 24, now: Date = new Date()): Promise<DigestTicket[]> {
  // resolved_at is the close stamp; older rows closed before it existed fall
  // back to updated_at so the report is never silently short.
  const r = await query(
    `${TICKET_SELECT}
     WHERE t.merged_into_ticket_id IS NULL
       AND t.status = 'closed'
       AND COALESCE(t.resolved_at, t.updated_at) >= NOW() - ($1 || ' hours')::interval
     ORDER BY t.ticket_number DESC`,
    [String(hours)]
  )
  return (r.rows as RawRow[]).map((row) => toDigestTicket(row, now))
}

export async function getEscalatedTickets(now: Date = new Date()): Promise<DigestTicket[]> {
  const r = await query(
    `${TICKET_SELECT}
     WHERE t.merged_into_ticket_id IS NULL
       AND t.status = 'escalated'`
  )
  return sortForReview((r.rows as RawRow[]).map((row) => toDigestTicket(row, now)))
}

export async function getDigestRows(report: DigestReport, now: Date = new Date()): Promise<DigestTicket[]> {
  switch (report) {
    case 'open-review':
      return getOpenTicketReview(now)
    case 'new-24h':
      return getNewTickets(24, now)
    case 'closed-24h':
      return getClosedTickets(24, now)
    case 'escalated':
      return getEscalatedTickets(now)
  }
}

// ---------------------------------------------------------------------------
// Recipients + run bookkeeping
// ---------------------------------------------------------------------------

/**
 * Recipients resolve env → app_settings → the people who asked for the report.
 *
 * The seeded default means the digest works the morning it ships without an
 * env-var write on a live service, and Support can change the list later by
 * updating one app_settings row.
 */
const DEFAULT_RECIPIENTS: Record<DigestReport, string[]> = {
  'open-review': ['joeo@anc.com', 'cdinh@anc.com'],
  'new-24h': ['cdinh@anc.com'],
  'closed-24h': ['cdinh@anc.com'],
  escalated: ['cdinh@anc.com'],
}

const ENV_KEYS: Record<DigestReport, string> = {
  'open-review': 'OPEN_TICKET_REVIEW_RECIPIENTS',
  'new-24h': 'TICKET_DIGEST_NEW_RECIPIENTS',
  'closed-24h': 'TICKET_DIGEST_CLOSED_RECIPIENTS',
  escalated: 'TICKET_DIGEST_ESCALATED_RECIPIENTS',
}

function parseList(raw: string | null | undefined): string[] {
  return (raw || '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes('@'))
}

export function settingsKey(report: DigestReport): string {
  return `ticket_digest_recipients_${report.replace(/-/g, '_')}`
}

export async function getRecipients(report: DigestReport): Promise<string[]> {
  const fromEnv = parseList(process.env[ENV_KEYS[report]])
  if (fromEnv.length > 0) return fromEnv

  const r = await query(`SELECT value FROM app_settings WHERE key = $1`, [settingsKey(report)])
  if (r.rows.length > 0) {
    // An explicit empty string is a deliberate "stop sending this one".
    const stored = String(r.rows[0].value ?? '')
    if (stored.trim() === '') return []
    const parsed = parseList(stored)
    if (parsed.length > 0) return parsed
  }
  return DEFAULT_RECIPIENTS[report]
}

/** Idempotency stamp so a re-run inside the same hour cannot double-send. */
function lastRunKey(report: DigestReport): string {
  return `ticket_digest_last_sent_${report.replace(/-/g, '_')}`
}

export async function getLastSentDate(report: DigestReport): Promise<string | null> {
  const r = await query(`SELECT value FROM app_settings WHERE key = $1`, [lastRunKey(report)])
  return r.rows.length > 0 ? String(r.rows[0].value) : null
}

export async function markSent(report: DigestReport, etDate: string): Promise<void> {
  await query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [lastRunKey(report), etDate]
  )
}

// ---------------------------------------------------------------------------
// New York time helpers — the schedule is Joe's local 8:00 AM, all year
// ---------------------------------------------------------------------------

const ET = 'America/New_York'

/** Hour 0-23 in New York, whatever the host clock is set to. */
export function newYorkHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: ET, hour: 'numeric', hour12: false }).format(now))
}

/** "2026-08-13" in New York — the idempotency key for "already sent today". */
export function newYorkDateKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "Wednesday, August 13, 2026" — the human line under every subject. */
export function newYorkDateLabel(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: ET,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)
}

export function digestContext(now: Date = new Date()) {
  return { dateLabel: newYorkDateLabel(now), baseUrl: baseUrl() }
}

export const REPORT_SUBJECTS: Record<DigestReport, (count: number, dateLabel: string) => string> = {
  'open-review': (count, d) => `Open Ticket Review — ${count} open ticket${count === 1 ? '' : 's'} — ${d}`,
  'new-24h': (count, d) => `New Tickets (last 24 hours) — ${count} — ${d}`,
  'closed-24h': (count, d) => `Tickets Closed (last 24 hours) — ${count} — ${d}`,
  escalated: (count, d) => `Escalated Tickets — ${count} open — ${d}`,
}
