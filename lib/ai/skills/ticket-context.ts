import { query } from '@/lib/db'
import { SkillError, type Skill } from '@/lib/ai/types'

function clean(value: unknown, max = 4000): string {
  const text = String(value || '').trim()
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

const skill: Skill = {
  name: 'ticket_context',
  description: 'Load the complete working context for the current ticket: issue description, owner, venue, resolution, recent internal/client comments, email-thread entries, and change history. Use before summarizing a ticket or drafting an internal note, customer reply, resolution, or multi-step ticket workflow.',
  category: 'Support',
  icon: '🧭',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Ticket UUID. On /tickets/[id], use the current record id from page context.' },
      comment_limit: { type: 'integer', minimum: 1, maximum: 40, default: 20 },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = String(args.id || '').trim()
    if (!id) throw new SkillError('missing_ticket_id', 'A ticket id is required.')
    const commentLimit = Math.min(Math.max(Number(args.comment_limit) || 20, 1), 40)

    const [ticketResult, commentsResult, activityResult] = await Promise.all([
      query(
        `SELECT t.id, t.ticket_number, t.title, t.description, t.original_message,
                t.status, t.priority, t.category, t.resolution_notes,
                t.contact_name, t.contact_email, t.source, t.ticket_type,
                t.created_at, t.updated_at, t.resolved_at,
                t.sla_response_due, t.sla_resolution_due,
                v.id AS venue_id, v.name AS venue_name,
                owner.id AS owner_id, owner.full_name AS owner_name
         FROM tickets t
         LEFT JOIN venues v ON v.id = t.venue_id
         LEFT JOIN staff owner ON owner.id = t.assigned_to
         WHERE t.id = $1
         LIMIT 1`,
        [id],
      ),
      query(
        `SELECT c.id, c.body, c.is_internal, c.created_at,
                COALESCE(author.full_name, 'Unknown') AS author_name
         FROM ticket_comments c
         LEFT JOIN staff author ON author.id = c.author_id
         WHERE c.ticket_id = $1
         ORDER BY c.created_at DESC
         LIMIT $2`,
        [id, commentLimit],
      ),
      query(
        `SELECT action, details, created_at
         FROM activity_log
         WHERE entity_type = 'ticket' AND entity_id = $1
         ORDER BY created_at DESC
         LIMIT 20`,
        [id],
      ).catch(() => ({ rows: [] })),
    ])

    const ticket = ticketResult.rows[0]
    if (!ticket) throw new SkillError('ticket_not_found', 'The current ticket could not be found.')

    const comments = commentsResult.rows.map((row) => ({
      id: row.id,
      author_name: row.author_name,
      audience: row.is_internal ? 'internal' : 'client',
      body: clean(row.body),
      created_at: row.created_at,
    }))
    const internalCount = comments.filter((comment) => comment.audience === 'internal').length
    const clientCount = comments.length - internalCount
    const threadLines = [...comments].reverse().map((comment) =>
      `- [${comment.audience}] ${comment.author_name}: ${clean(comment.body, 800)}`,
    )

    return {
      ticket: {
        ...ticket,
        description: clean(ticket.description),
        original_message: clean(ticket.original_message),
        resolution_notes: clean(ticket.resolution_notes),
      },
      comments,
      activity: activityResult.rows,
      counts: {
        comments_returned: comments.length,
        internal_comments: internalCount,
        client_comments: clientCount,
      },
      link: `/tickets/${id}`,
      text_summary: [
        `Ticket **T-${ticket.ticket_number}** — ${ticket.title} — [open →](/tickets/${id})`,
        `Status: ${ticket.status} · Priority: ${ticket.priority} · Owner: ${ticket.owner_name || 'Unassigned'} · Venue: ${ticket.venue_name || 'Not linked'}`,
        ticket.description ? `Issue: ${clean(ticket.description, 1000)}` : '',
        ticket.resolution_notes ? `Resolution: ${clean(ticket.resolution_notes, 800)}` : '',
        threadLines.length ? `Recent thread (${clientCount} client / ${internalCount} internal):\n${threadLines.join('\n')}` : 'No comments yet.',
      ].filter(Boolean).join('\n'),
    }
  },
}

export default skill
