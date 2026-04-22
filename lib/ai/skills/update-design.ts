import { query } from '@/lib/db'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import type { Skill } from '@/lib/ai/types'

const ALLOWED_STATUSES = new Set([
  'request_submitted', 'in_queue', 'in_progress', 'in_qc',
  'client_review', 'approved', 'done',
])

// Omnibus updater for design requests — lets the AI set hours / due date /
// notes / status / boards / sizes in one call. Keeps the model from having
// to chain 5 separate tool calls for "set hours to 3 and due date to
// Friday" kind of requests.
const skill: Skill = {
  name: 'update_design',
  description: 'Update one or more fields on a design request: status, hours_estimated, hours_spent, due_date, notes, boards_requested, sizes_requested. Use search_design_requests first to get the id.',
  category: 'Creative',
  icon: '✏️',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      design_request_id: { type: 'string' },
      status: { type: 'string', description: 'One of: request_submitted / in_queue / in_progress / in_qc / client_review / approved / done' },
      hours_estimated: { type: 'number' },
      hours_spent: { type: 'number' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      notes: { type: 'string' },
      boards_requested: { type: 'string' },
      sizes_requested: { type: 'string' },
    },
    required: ['design_request_id'],
  },
  async handler(args) {
    const drId = String(args.design_request_id)
    const status = args.status && ALLOWED_STATUSES.has(String(args.status)) ? String(args.status) : null

    if (isTwentyBackedEnabled('DESIGNS')) {
      const patch: Record<string, unknown> = {}
      if (status) patch.status = `STATUS_${status.toUpperCase()}`
      if (args.hours_estimated !== undefined) patch.effortHours = Number(args.hours_estimated) || 0
      if (args.due_date !== undefined) patch.dueDate = args.due_date || null
      if (args.notes !== undefined) patch.aiPrompt = String(args.notes).slice(0, 5000)
      if (args.boards_requested !== undefined) patch.boardSection = String(args.boards_requested).slice(0, 500)
      // hours_spent + sizes_requested have no direct Twenty field — fall back silently
      if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update' }
      const updated = await Designs.update(drId, patch as any)
      return {
        ok: true,
        design_request_id: drId,
        updated_fields: Object.keys(patch),
        _ui_action: { type: 'refresh' },
      }
    }

    const updates: string[] = []
    const params: unknown[] = []
    const set = (col: string, v: unknown) => { params.push(v); updates.push(`${col} = $${params.length}`) }
    if (status) set('status', status)
    if (args.hours_estimated !== undefined) set('hours_estimated', Number(args.hours_estimated))
    if (args.hours_spent !== undefined) set('hours_spent', Number(args.hours_spent))
    if (args.due_date !== undefined) set('due_date', args.due_date || null)
    if (args.notes !== undefined) set('notes', String(args.notes))
    if (args.boards_requested !== undefined) set('boards_requested', String(args.boards_requested))
    if (args.sizes_requested !== undefined) set('sizes_requested', String(args.sizes_requested))
    if (updates.length === 0) return { ok: false, error: 'Nothing to update' }
    params.push(drId)
    const r = await query(
      `UPDATE design_requests SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length} RETURNING id, job_title, status`,
      params
    )
    if (r.rows.length === 0) return { ok: false, error: 'Design request not found' }
    return {
      ok: true,
      design_request: r.rows[0],
      updated_fields: updates.map((u) => u.split(' = ')[0]),
      _ui_action: { type: 'refresh' },
    }
  },
}
export default skill
