import { query } from '@/lib/db'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import type { Skill } from '@/lib/ai/types'

// Search the Creative queue for a specific design request the user is
// describing. Returns up to 10 matches with id + title + client + status +
// designer, so the model can pick the right one before calling another skill
// like assign_designer or update_design.
const skill: Skill = {
  name: 'search_design_requests',
  description: 'Find design requests by job title, client, or status. Use BEFORE assign_designer / update_design / move_design_to_client_review so you have the correct design_request_id.',
  category: 'Creative',
  icon: '🔎',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text search across job title + client + designer name' },
      status: { type: 'string', description: 'Optional status filter: request_submitted / in_queue / in_progress / in_qc / client_review / approved / done' },
      limit: { type: 'number', description: 'Max results (default 10)' },
    },
  },
  async handler(args) {
    const q = (args.query || '').toString().trim()
    const status = (args.status || '').toString().trim()
    const limit = Math.min(Number(args.limit) || 10, 25)

    if (isTwentyBackedEnabled('DESIGNS')) {
      const filters: string[] = []
      if (status) filters.push(`status[eq]:"STATUS_${status.toUpperCase()}"`)
      if (q) filters.push(`name[ilike]:"%${q.replace(/"/g, '\\"')}%"`)
      const page = await Designs.list({
        limit,
        filter: filters.length ? filters.join(',') : undefined,
        orderBy: 'updatedAt[DescNullsLast]',
      })
      const results = page.items.map((d: any) => ({
        id: d.id,
        job_title: d.name,
        client: d.designClient?.name || null,
        status: (d.status || '').toString().replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
        designer: d.designAssignee ? `${d.designAssignee.name.firstName} ${d.designAssignee.name.lastName}`.trim() : null,
        due_date: d.dueDate || null,
      }))
      return { results, count: results.length }
    }

    const conditions: string[] = []
    const params: unknown[] = []
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`(dr.job_title ILIKE $${params.length} OR dr.company_name ILIKE $${params.length} OR dr.client_name ILIKE $${params.length})`)
    }
    if (status) {
      params.push(status)
      conditions.push(`dr.status = $${params.length}`)
    }
    params.push(limit)
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const r = await query(
      `SELECT dr.id, dr.job_title, dr.company_name, dr.status, dr.due_date,
              s.full_name as designer_name
       FROM design_requests dr
       LEFT JOIN staff s ON s.id = dr.designer_id
       ${where}
       ORDER BY dr.updated_at DESC
       LIMIT $${params.length}`,
      params
    )
    return {
      results: r.rows.map((x: any) => ({
        id: x.id,
        job_title: x.job_title,
        client: x.company_name,
        status: x.status,
        designer: x.designer_name,
        due_date: x.due_date,
      })),
      count: r.rows.length,
    }
  },
}
export default skill
