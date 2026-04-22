import { query } from '@/lib/db'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import type { Skill } from '@/lib/ai/types'

// Assign a designer to a design request. Both design_request_id and
// designer_id must come from prior searches (search_design_requests +
// search_staff) — the model shouldn't invent UUIDs.
const skill: Skill = {
  name: 'assign_designer',
  description: 'Assign a staff member as the designer on a design request. Use search_design_requests + search_staff first to get the UUIDs.',
  category: 'Creative',
  icon: '👤',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      design_request_id: { type: 'string' },
      designer_id: { type: 'string' },
    },
    required: ['design_request_id', 'designer_id'],
  },
  async handler(args) {
    const drId = String(args.design_request_id)
    const designerId = String(args.designer_id)

    // Verify the designer exists locally so we don't FK-fail silently.
    const staff = await query(`SELECT id, full_name FROM staff WHERE id = $1`, [designerId])
    if (staff.rows.length === 0) return { ok: false, error: 'Designer not found' }

    if (isTwentyBackedEnabled('DESIGNS')) {
      const updated = await Designs.update(drId, { designAssigneeId: designerId } as any)
      if (!updated) return { ok: false, error: 'Design request not found' }
      // Also advance to in_queue if still at submitted — assignment implies queued.
      const priorStatus = ((updated as any).status || '').toString().replace(/^STATUS_/i, '').toLowerCase()
      if (priorStatus === 'request_submitted' || priorStatus === '') {
        try { await Designs.update(drId, { status: 'STATUS_IN_QUEUE' as any }) } catch {}
      }
      return {
        ok: true,
        design_request_id: drId,
        designer_name: staff.rows[0].full_name,
        _ui_action: { type: 'refresh' },
      }
    }

    const r = await query(
      `UPDATE design_requests
       SET designer_id = $1,
           status = CASE WHEN status = 'request_submitted' THEN 'in_queue' ELSE status END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, job_title, status`,
      [designerId, drId]
    )
    if (r.rows.length === 0) return { ok: false, error: 'Design request not found' }
    return {
      ok: true,
      design_request: r.rows[0],
      designer_name: staff.rows[0].full_name,
      _ui_action: { type: 'refresh' },
    }
  },
}
export default skill
