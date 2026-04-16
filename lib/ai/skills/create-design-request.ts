import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'create_design_request',
  description: 'Create a new design request. Used by Enterprise Solutions when a client asks for a design.',
  category: 'Creative',
  icon: '🎨',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      job_title: { type: 'string' },
      venue_id: { type: 'string', description: 'Optional venue UUID' },
      company_name: { type: 'string' },
      tricode: { type: 'string' },
      client_name: { type: 'string' },
      client_email: { type: 'string' },
      boards_requested: { type: 'string' },
      sizes_requested: { type: 'string' },
      hours_estimated: { type: 'number' },
      due_date: { type: 'string', description: 'YYYY-MM-DD' },
      notes: { type: 'string' },
    },
    required: ['job_title'],
  },
  async handler(args) {
    const r = await query(
      `INSERT INTO design_requests (
         job_title, venue_id, company_name, tricode, client_name, client_email,
         boards_requested, sizes_requested, hours_estimated, due_date, notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'request_submitted')
       RETURNING id, job_title, status`,
      [
        args.job_title, args.venue_id || null, args.company_name || null,
        args.tricode || null, args.client_name || null, args.client_email || null,
        args.boards_requested || null, args.sizes_requested || null,
        args.hours_estimated || null, args.due_date || null, args.notes || null,
      ]
    )
    return { design_request: r.rows[0], _ui_action: { type: 'refresh' } }
  },
}
export default skill
