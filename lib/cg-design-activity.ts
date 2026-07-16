import { query } from '@/lib/db'

export type CgDesignActivityType =
  | 'created'
  | 'status_change'
  | 'time_logged'
  | 'proof_sent'
  | 'client_response'
  | 'client_upload'
  | 'comment'
  | 'note'

export async function logCgDesignActivity(input: {
  cgDesignRequestId: string
  eventType: CgDesignActivityType
  actor?: { userId?: string | null; fullName?: string | null; email?: string | null } | null
  fromValue?: string | null
  toValue?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await query(
      `INSERT INTO cg_design_activity
         (cg_design_request_id, event_type, actor_id, actor_name, actor_email, from_value, to_value, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        input.cgDesignRequestId,
        input.eventType,
        input.actor?.userId || null,
        input.actor?.fullName || null,
        input.actor?.email || null,
        input.fromValue || null,
        input.toValue || null,
        input.detail ? JSON.stringify(input.detail) : null,
      ],
    )
  } catch (err) {
    console.warn('[cg-design-activity] failed to log', input.eventType, err)
  }
}
