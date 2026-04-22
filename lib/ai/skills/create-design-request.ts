import { query } from '@/lib/db'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'create_design_request',
  description: 'Create a brand-new design request record. Use only when the user explicitly asks to create/new/add another request. Never use this to fill or edit an already-open form/detail page.',
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
    const jobTitle = String(args.job_title || '').trim()
    const venueId = args.venue_id ? String(args.venue_id) : null
    const companyName = args.company_name ? String(args.company_name) : null
    const tricode = args.tricode ? String(args.tricode) : null
    const clientName = args.client_name ? String(args.client_name) : null
    const clientEmail = args.client_email ? String(args.client_email) : null
    const boardsRequested = args.boards_requested ? String(args.boards_requested) : null
    const sizesRequested = args.sizes_requested ? String(args.sizes_requested) : null
    const hoursEstimated = args.hours_estimated != null ? Number(args.hours_estimated) : null
    const dueDate = args.due_date ? String(args.due_date) : null
    const notes = args.notes ? String(args.notes) : null

    // When Twenty is the system of record, create there first so the returned
    // ID exists in Twenty; then mirror a local stub so FK-dependent features
    // (proofs, hours, assignees) work without a race. Without this mirror the
    // detail page hits GET /api/design-requests/:id, finds nothing in Twenty
    // yet (or fetches by the wrong id) and shows "Design request not found".
    if (isTwentyBackedEnabled('DESIGNS')) {
      const created = await Designs.create({
        name: jobTitle,
        aiPrompt: notes,
        boardSection: boardsRequested,
        status: 'STATUS_REQUEST_SUBMITTED' as any,
      })

      await query(
        `INSERT INTO design_requests (
           id, job_title, venue_id, company_name, tricode, client_name, client_email,
           boards_requested, sizes_requested, hours_estimated, due_date, notes, status,
           created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'request_submitted',NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          created.id, jobTitle, venueId, companyName,
          tricode, clientName, clientEmail,
          boardsRequested, sizesRequested,
          hoursEstimated, dueDate, notes,
        ]
      )

      const link = `/designs/${created.id}`
      return {
        design_request: { id: created.id, job_title: jobTitle, status: 'request_submitted' },
        link,
        text_summary: `Created design request "${jobTitle}" — [open →](${link})`,
        _ui_action: { type: 'refresh' },
      }
    }

    const r = await query(
      `INSERT INTO design_requests (
         job_title, venue_id, company_name, tricode, client_name, client_email,
         boards_requested, sizes_requested, hours_estimated, due_date, notes, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'request_submitted')
       RETURNING id, job_title, status`,
      [
        jobTitle, venueId, companyName,
        tricode, clientName, clientEmail,
        boardsRequested, sizesRequested,
        hoursEstimated, dueDate, notes,
      ]
    )
    const dr = r.rows[0]
    const link = `/designs/${dr.id}`
    return {
      design_request: dr,
      link,
      text_summary: `Created design request "${dr.job_title}" — [open →](${link})`,
      _ui_action: { type: 'refresh' },
    }
  },
}
export default skill
