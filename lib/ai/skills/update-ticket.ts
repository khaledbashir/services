import { SkillError, type Skill } from '@/lib/ai/types'

const STATUS_VALUES = ['new', 'on_hold', 'in_progress', 'escalated', 'closed'] as const
const PRIORITY_VALUES = ['low', 'medium', 'high', 'critical'] as const
const CATEGORY_VALUES = ['hardware', 'software', 'content', 'operational', 'general', 'voicemail'] as const

function appBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL
    || process.env.PUBLIC_APP_URL
    || process.env.NEXT_PUBLIC_BASE_URL
  if (configured) return configured.replace(/\/+$/, '')
  return process.env.NODE_ENV === 'production'
    ? 'https://services.ancsports.net'
    : `http://localhost:${process.env.PORT || '3000'}`
}

const skill: Skill = {
  name: 'update_ticket',
  description: 'Update an existing service ticket through the authoritative ticket API so notifications and ticket side effects are preserved. Use for confirmed status, priority, category, assignment, or resolution changes; never use DOM-only writes for these fields.',
  category: 'Support',
  icon: '🎫',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Ticket UUID. On /tickets/[id], use the current record id from page context.' },
      status: { type: 'string', enum: STATUS_VALUES },
      priority: { type: 'string', enum: PRIORITY_VALUES },
      category: { type: 'string', enum: CATEGORY_VALUES },
      assigned_to: { type: ['string', 'null'], description: 'Staff UUID, or null to unassign.' },
      resolution_notes: { type: 'string', description: 'Resolution summary. Include when closing whenever possible.' },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = String(args.id || '').trim()
    if (!id) throw new SkillError('missing_ticket_id', 'A ticket id is required.')

    const body: Record<string, unknown> = {}
    if (args.status !== undefined) body.status = args.status
    if (args.priority !== undefined) body.priority = args.priority
    if (args.category !== undefined) body.category = args.category
    if (args.assigned_to !== undefined) body.assigned_to = args.assigned_to
    if (args.resolution_notes !== undefined) body.resolution_notes = args.resolution_notes
    if (Object.keys(body).length === 0) {
      throw new SkillError('missing_update', 'Provide at least one ticket field to update.')
    }

    const response = await fetch(`${appBaseUrl()}/api/internal/tickets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.INTERNAL_API_KEY || 'anc-internal-2026',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const result = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      throw new SkillError(
        'ticket_update_failed',
        typeof result.error === 'string' ? result.error : `Ticket update failed (${response.status}).`,
      )
    }

    const ticketNumber = result.ticket_number ? String(result.ticket_number) : id
    const confirmationActions: Array<Record<string, unknown>> = [
      { type: 'refresh' },
      { type: 'wait', ms: 550 },
    ]
    if (body.status !== undefined) {
      confirmationActions.push(
        { type: 'highlight', selector: `[data-ai-target="ticket-status-${String(body.status)}"]`, label: `Status · ${String(body.status).replace(/_/g, ' ')}` },
        { type: 'wait', ms: 450 },
      )
    }
    if (body.assigned_to !== undefined) {
      confirmationActions.push(
        { type: 'highlight', selector: '[data-ai-target="ticket-owner-summary"]', label: 'Owner updated' },
        { type: 'wait', ms: 450 },
      )
    }
    if (body.priority !== undefined) {
      confirmationActions.push(
        { type: 'highlight', selector: '[data-ai-target="ticket-priority-summary"]', label: `Priority · ${String(body.priority)}` },
        { type: 'wait', ms: 450 },
      )
    }
    if (body.resolution_notes !== undefined) {
      confirmationActions.push(
        { type: 'highlight', selector: '[data-ai-target="ticket-resolution-area"]', label: 'Resolution updated' },
        { type: 'wait', ms: 450 },
      )
    }
    confirmationActions.push({ type: 'toast', message: `Ticket ${ticketNumber} updated`, variant: 'success' })

    return {
      ticket_id: id,
      ticket_number: result.ticket_number,
      updated: body,
      link: `/tickets/${id}`,
      text_summary: `Ticket **${ticketNumber}** updated — [open →](/tickets/${id})`,
      _ui_action: { type: 'sequence', actions: confirmationActions },
    }
  },
}

export default skill
