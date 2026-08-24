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
      const outcome = await createDesignProofShare({ designRequestId: String(args.design_request_id) })
      if (!outcome.ok) {
        // Nothing to show a client — say so plainly rather than reporting a
        // proof that was never sent.
        return {
          design_request: r.rows[0],
          proof_error:
            'No proof link was sent — this ticket has no proof files attached. Attach the proof, then move it to Client Review again.',
          _ui_action: { type: 'refresh' },
        }
      }
      await query(
        `UPDATE design_requests SET ftp_proof_link = $1
         WHERE id = $2 AND (ftp_proof_link IS NULL OR ftp_proof_link = '')`,
        [outcome.url, args.design_request_id]
      )
      return {
        design_request: r.rows[0],
        proof_url: outcome.url,
        emailed: outcome.emailed,
        client_email: outcome.client_email,
        _ui_action: { type: 'refresh' },
      }
    } catch (err) {
      return {
        design_request: r.rows[0],
        proof_error: err instanceof Error ? err.message : String(err),
        _ui_action: { type: 'refresh' },
      }
    }
  },
}
export default skill
