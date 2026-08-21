/**
 * The database half of the ticket history block (see ./ticket-history).
 *
 * Split out so the rendering rules — above all "only what already emailed
 * this distribution list" — can be tested without a Postgres.
 */
import { query } from '@/lib/db'
import {
  HISTORY_LIMIT,
  buildTicketHistory,
  type ActivityRow,
  type CommentRow,
  type TicketHistoryEntry,
} from '@/lib/ticket-history'

/**
 * Reads a ticket's client-visible history.
 *
 * Never throws: a notification that cannot fetch its history still has to go
 * out carrying the update it was sent for.
 */
export async function fetchTicketHistory(
  ticketId: string,
  opts: { limit?: number; before?: Date | string | null; exclude?: string | null } = {},
): Promise<{ entries: TicketHistoryEntry[]; more: number }> {
  const limit = opts.limit ?? HISTORY_LIMIT
  const before = opts.before ? new Date(opts.before) : null
  const cutoff = before && !Number.isNaN(before.getTime()) ? before : new Date()
  // One more than we render, so the email can say how much it left out.
  const fetchLimit = limit + 1

  try {
    const [comments, activity] = await Promise.all([
      query(
        `SELECT c.body, c.created_at,
                COALESCE(author.full_name, c.author_name) AS author_name
           FROM ticket_comments c
           LEFT JOIN staff author ON author.id = c.author_id
          WHERE c.ticket_id = $1
            AND c.is_internal = false
            AND c.created_at < $2
          ORDER BY c.created_at DESC
          LIMIT $3`,
        [ticketId, cutoff, fetchLimit],
      ).catch(() => ({ rows: [] as CommentRow[] })),
      query(
        `SELECT al.action, al.details, al.created_at,
                COALESCE(author.full_name, '') AS author_name
           FROM activity_log al
           LEFT JOIN staff author ON author.id = al.staff_id
          WHERE al.entity_type = 'ticket'
            AND al.entity_id = $1
            AND al.action = 'ticket_status_change'
            AND al.created_at < $2
          ORDER BY al.created_at DESC
          LIMIT $3`,
        [ticketId, cutoff, fetchLimit],
      ).catch(() => ({ rows: [] as ActivityRow[] })),
    ])

    const all = buildTicketHistory(
      comments.rows as CommentRow[],
      activity.rows as ActivityRow[],
      { limit: fetchLimit, exclude: opts.exclude },
    )
    return { entries: all.slice(0, limit), more: Math.max(0, all.length - limit) }
  } catch (error) {
    console.error('[ticket-history] could not read the history for', ticketId, error)
    return { entries: [], more: 0 }
  }
}
