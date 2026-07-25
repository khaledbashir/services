/**
 * Email-ticket repair sweep.
 *
 * Inbound email tickets are created by the Resend webhook
 * (app/api/webhooks/email/route.ts). The webhook payload carries no body, the
 * Resend Receiving API sometimes has none either, and the Twenty CRM fallback
 * races Twenty's two-stage message sync — the message row (subject +
 * participants) exists before the body text is imported. When every source is
 * empty at receipt time the ticket stores the subject as original_message, and
 * reply emails are dropped entirely.
 *
 * The body text does land in Twenty minutes later. This module repairs both
 * symptoms from there, idempotently:
 *   1. subject-only original_message → replaced with the real full email body
 *   2. dropped inbound replies → inserted as client-visible email comments,
 *      stamped with twenty_message_id so re-runs never duplicate
 *
 * Used by the repair-email-tickets cron and by scheduleEmailTicketRepair(),
 * which the webhook fires after ingesting a message with no body.
 */
import { query } from '@/lib/db'

const TWENTY_API_URL = process.env.TWENTY_API_URL || 'https://crm.ancsports.net'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
/** Mailboxes whose messages are ANC-outbound, never client email. */
const OUTBOUND_HANDLES = new Set(['support@anc.com', 'noreply@anc.com', 'deals@anc.com'])

interface TwentyMessage {
  id: string
  subject: string
  text: string
  receivedAt: string | null
  fromHandle: string
  fromName: string
}

export interface EmailRepairReport {
  ok: boolean
  dry: boolean
  scanned: number
  bodiesRepaired: number
  commentsInserted: number
  noMatch: number
  errors: string[]
  repairedTickets: number[]
}

/**
 * Strip quoted reply text and email signatures from an email body.
 * Mirrors the live inbound path so repaired comments read the same as
 * comments ingested at receipt time.
 */
export function cleanEmailReply(body: string): string {
  if (!body) return ''
  const lines = body.split('\n')
  const cleaned: string[] = []
  for (const line of lines) {
    if (line.match(/^On .+ wrote:$/)) break
    if (line.match(/^-{3,}$/)) break
    if (line.match(/^_{3,}$/)) break
    if (line.match(/^From:/i)) break
    if (line.match(/^Sent:/i)) break
    if (line.trim() === '--') break
    if (line.match(/^Get Outlook for/i)) break
    if (line.match(/^Sent from my/i)) break
    if (line.match(/^>+ /)) continue
    cleaned.push(line)
  }
  const result = cleaned.join('\n').trim()
  if (!result && body.trim()) {
    return body.replace(/<[^>]*>/g, '').trim().substring(0, 500)
  }
  return result
}

async function gql<T = any>(q: string, variables: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${TWENTY_API_URL}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q, variables }),
  })
  const json = await r.json()
  if (json.errors) throw new Error(`Twenty GraphQL: ${JSON.stringify(json.errors).slice(0, 300)}`)
  return json.data as T
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Collapse whitespace so sliced/re-wrapped copies of the same email still match. */
function normalize(s: string) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

function stripSubject(subject: string) {
  return (subject || '')
    .replace(/^(Re|Fwd|Fw)\s*:\s*/gi, '')
    .replace(/^Case\s+\d+\s*[—\-–]\s*/i, '')
    .trim()
}

const MESSAGE_FIELDS = `id subject text receivedAt messageParticipants{ edges{ node{ role handle displayName } } }`

function toMessages(edges: any[]): TwentyMessage[] {
  return (edges || []).map((e: any) => {
    const node = e.node
    const from = (node.messageParticipants?.edges ?? [])
      .map((p: any) => p.node)
      .find((p: any) => p.role === 'FROM')
    return {
      id: node.id,
      subject: node.subject || '',
      text: (node.text || '').trim(),
      receivedAt: node.receivedAt ?? null,
      fromHandle: (from?.handle || '').toLowerCase(),
      fromName: from?.displayName || (from?.handle || '').split('@')[0] || 'Unknown',
    }
  })
}

/** Fetch candidate Twenty messages for a ticket: same base subject + explicit Case-number replies. */
async function fetchCandidateMessages(ticketNumber: number, title: string): Promise<TwentyMessage[]> {
  const byId = new Map<string, TwentyMessage>()

  const subjectProbe = stripSubject(title).slice(0, 60).trim()
  if (subjectProbe.length >= 4) {
    const data = await gql<{ messages: any }>(
      `query($subject: String!){
        messages(first: 40, filter:{ subject:{ ilike:$subject } }, orderBy:{ receivedAt: AscNullsLast }){
          edges{ node{ ${MESSAGE_FIELDS} } }
        }
      }`,
      { subject: `%${subjectProbe}%` }
    )
    for (const m of toMessages(data.messages?.edges)) byId.set(m.id, m)
  }

  const caseProbe = `Case ${String(ticketNumber).padStart(8, '0')}`
  const caseData = await gql<{ messages: any }>(
    `query($subject: String!){
      messages(first: 40, filter:{ subject:{ ilike:$subject } }, orderBy:{ receivedAt: AscNullsLast }){
        edges{ node{ ${MESSAGE_FIELDS} } }
      }
    }`,
    { subject: `%${caseProbe}%` }
  )
  for (const m of toMessages(caseData.messages?.edges)) byId.set(m.id, m)

  return [...byId.values()].sort((a, b) => (a.receivedAt || '').localeCompare(b.receivedAt || ''))
}

function isInbound(msg: TwentyMessage) {
  return !!msg.fromHandle && !OUTBOUND_HANDLES.has(msg.fromHandle)
}

export async function repairEmailTickets(opts: { days?: number; dry?: boolean; ticketNumber?: number } = {}): Promise<EmailRepairReport> {
  const { days = 2, dry = false, ticketNumber } = opts
  const report: EmailRepairReport = {
    ok: true, dry, scanned: 0, bodiesRepaired: 0, commentsInserted: 0, noMatch: 0, errors: [], repairedTickets: [],
  }
  if (!TWENTY_API_KEY) {
    report.ok = false
    report.errors.push('TWENTY_API_KEY not set')
    return report
  }

  const tickets = await query(
    `SELECT id, ticket_number, title, description, original_message, contact_name, contact_email, created_at
     FROM tickets
     WHERE source = 'email'
       AND ($1::int IS NULL OR ticket_number = $1)
       AND ($1::int IS NOT NULL OR created_at > NOW() - ($2 || ' days')::interval)
     ORDER BY ticket_number DESC`,
    [ticketNumber ?? null, String(days)]
  )

  for (const t of tickets.rows) {
    report.scanned++
    try {
      const messages = await fetchCandidateMessages(t.ticket_number, t.title || '')
      const inbound = messages.filter((m) => isInbound(m) && m.text)
      if (!inbound.length) {
        report.noMatch++
        continue
      }

      const createdAt = new Date(t.created_at).getTime()
      const contactEmail = (t.contact_email || '').toLowerCase()

      // 1. The original email is the message that triggered ticket creation, so
      // it arrived within moments of created_at — pick the closest inbound
      // message inside a ±2h window (never the earliest of a long-running
      // thread), preferring an exact sender match. No candidate in the window
      // means we can't be sure — skip rather than store the wrong email.
      const originalCandidates = inbound
        .filter((m) => m.receivedAt && Math.abs(new Date(m.receivedAt).getTime() - createdAt) <= 2 * 3600_000)
        .sort(
          (a, b) =>
            Math.abs(new Date(a.receivedAt!).getTime() - createdAt) -
            Math.abs(new Date(b.receivedAt!).getTime() - createdAt)
        )
      const original =
        originalCandidates.find((m) => contactEmail && m.fromHandle === contactEmail) ||
        originalCandidates[0] ||
        null

      const needsBody = !t.original_message || t.original_message.trim() === (t.title || '').trim()
      if (needsBody && original) {
        const senderName = original.fromName || t.contact_name || 'Unknown'
        const senderEmail = original.fromHandle || contactEmail
        if (!dry) {
          await query(
            `UPDATE tickets SET
               original_message = $1,
               description = CASE WHEN description LIKE 'Email received from %' THEN $2 ELSE description END,
               updated_at = NOW()
             WHERE id = $3`,
            [original.text, `Email from ${senderName} (${senderEmail}):\n\n${original.text.slice(0, 5000)}`, t.id]
          )
        }
        report.bodiesRepaired++
        report.repairedTickets.push(t.ticket_number)
      }

      // 2. Dropped inbound replies → client-visible email comments. Only
      // messages carrying THIS ticket's Case marker qualify — bare subject
      // matches are ambiguous when several tickets share a subject family
      // (WMATA request threads), and would cross-post the same reply onto
      // every sibling ticket.
      const caseMarker = new RegExp(`\\bCase\\s*0*${t.ticket_number}\\b`, 'i')
      const originalText = normalize(t.original_message || '') || (original ? normalize(original.text) : '')
      const replies = inbound.filter(
        (m) =>
          m.id !== original?.id &&
          caseMarker.test(m.subject) &&
          (!m.receivedAt || new Date(m.receivedAt).getTime() > createdAt - 60_000)
      )
      if (replies.length) {
        const existing = await query(
          `SELECT body, twenty_message_id FROM ticket_comments WHERE ticket_id = $1`,
          [t.id]
        )
        const knownIds = new Set(existing.rows.map((r: any) => r.twenty_message_id).filter(Boolean))
        const knownBodies = existing.rows.map((r: any) => normalize(r.body || ''))

        for (const msg of replies) {
          if (knownIds.has(msg.id)) continue
          const cleanBody = cleanEmailReply(msg.text)
          if (!cleanBody) continue
          const probe = normalize(cleanBody).slice(0, 180)
          if (!probe) continue
          // Skip if this message IS the original body, or was already ingested
          // at receipt time (legacy comments have no twenty_message_id).
          if (originalText && originalText.includes(probe)) continue
          if (knownBodies.some((b: string) => b.includes(probe))) continue

          if (!dry) {
            await query(
              `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, twenty_message_id, created_at)
               VALUES ($1, $2, $3, false, $4, COALESCE($5::timestamptz, NOW()))
               ON CONFLICT DO NOTHING`,
              [t.id, CLAW_STAFF_ID, cleanBody, msg.id, msg.receivedAt]
            )
            await query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [t.id])
          }
          report.commentsInserted++
          if (!report.repairedTickets.includes(t.ticket_number)) report.repairedTickets.push(t.ticket_number)
        }
      }
      // Pace Twenty API calls — the sweep can cover hundreds of tickets.
      await sleep(150)
    } catch (e) {
      report.ok = false
      report.errors.push(`#${t.ticket_number}: ${String(e).slice(0, 200)}`)
    }
  }

  return report
}

/**
 * Fire-and-forget self-heal for a single ticket. Called by the inbound email
 * webhook when a message arrives with no body anywhere yet — Twenty's body
 * import usually lands within a few minutes, so retry on a widening schedule.
 * Every attempt is idempotent; the cron sweep remains the safety net.
 */
export function scheduleEmailTicketRepair(ticketNumber: number) {
  for (const delayMs of [30_000, 120_000, 420_000]) {
    setTimeout(() => {
      repairEmailTickets({ ticketNumber }).then(
        (report) => {
          if (report.bodiesRepaired || report.commentsInserted) {
            console.log(`[email-ticket-repair] self-heal #${ticketNumber} @${delayMs / 1000}s`, JSON.stringify(report))
          }
        },
        (err) => console.error(`[email-ticket-repair] self-heal #${ticketNumber} failed:`, err)
      )
    }, delayMs)
  }
}
