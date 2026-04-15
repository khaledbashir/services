import { query } from '@/lib/db'
import { createDesignProofShare } from '@/lib/design-proof'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'move_design_to_client_review',
  description: 'Advance a design request to "Client Review" status. This auto-generates the proof link and emails the client.',
  category: 'Creative',
  icon: '📧',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: { design_request_id: { type: 'string' } },
    required: ['design_request_id'],
  },
  async handler(args) {
    const r = await query(
      `UPDATE design_requests SET status = 'client_review', updated_at = NOW()
       WHERE id = $1 RETURNING id, job_title, status, client_email`,
      [args.design_request_id]
    )
    if (r.rows.length === 0) return { ok: false, error: 'Design request not found' }
    try {
      const share = await createDesignProofShare({ designRequestId: String(args.design_request_id) })
      await query(
        `UPDATE design_requests SET ftp_proof_link = $1
         WHERE id = $2 AND (ftp_proof_link IS NULL OR ftp_proof_link = '')`,
        [share.url, args.design_request_id]
      )
      return {
        design_request: r.rows[0],
        proof_url: share.url,
        emailed: share.emailed,
        client_email: share.client_email,
      }
    } catch (err) {
      return { design_request: r.rows[0], proof_error: err instanceof Error ? err.message : String(err) }
    }
  },
}
export default skill
