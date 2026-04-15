import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'search_staff',
  description: 'Find staff members by name, email, or role.',
  category: 'Staff',
  icon: '👤',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search term' },
      role: { type: 'string', description: 'Filter by role: admin, manager, technician' },
      limit: { type: 'integer', default: 10, maximum: 30 },
    },
  },
  async handler(args) {
    const conditions: string[] = ['1=1']
    const params: unknown[] = []
    if (args.q) { params.push(`%${args.q}%`); conditions.push(`(s.full_name ILIKE $${params.length} OR s.email ILIKE $${params.length})`) }
    if (args.role) { params.push(args.role); conditions.push(`s.role = $${params.length}`) }
    params.push(Math.min(Number(args.limit) || 10, 30))
    const r = await query(
      `SELECT s.id, s.full_name, s.email, s.role, s.title
       FROM staff s WHERE ${conditions.join(' AND ')}
       ORDER BY s.full_name LIMIT $${params.length}`,
      params
    )
    return { staff: r.rows }
  },
}
export default skill
