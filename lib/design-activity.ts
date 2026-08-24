import { query } from '@/lib/db'

/**
 * Append-only activity log for design tickets. Every meaningful mutation on a
 * design request (status change, time logged, proof created, client response,
 * assignment, reschedule, comment) writes one row here; the ticket history
 * timeline reads them back newest-first.
 *
 * Logging is best-effort: a failure to record history must never break the
 * mutation it describes, so every write is wrapped and swallowed with a warning.
 */

export type DesignActivityType =
  | 'created'
  | 'status_change'
  | 'time_logged'
  | 'proof_created'
  | 'proof_sent'
  // Client Review was reached but the ticket had no proof to show, so no
  // client link was minted and the ticket's existing link was left alone.
  | 'proof_blocked'
  | 'client_response'
  | 'client_upload'
  | 'assigned'
  | 'unassigned'
  | 'rescheduled'
  | 'comment'
  | 'note'

export interface DesignActivityActor {
  userId?: string | null
  fullName?: string | null
  email?: string | null
}

export interface LogDesignActivityInput {
  designRequestId: string
  eventType: DesignActivityType
  actor?: DesignActivityActor | null
  /** Prior value, when the event is a transition (e.g. old status). */
  fromValue?: string | null
  /** New value, when the event is a transition (e.g. new status). */
  toValue?: string | null
  /** Structured extras rendered in the timeline (hours, file name, note, etc.). */
  detail?: Record<string, unknown> | null
}

export async function logDesignActivity(input: LogDesignActivityInput): Promise<void> {
  const { designRequestId, eventType, actor, fromValue, toValue, detail } = input
  if (!designRequestId || !eventType) return
  try {
    await query(
      `INSERT INTO design_request_activity
         (design_request_id, event_type, actor_id, actor_name, actor_email, from_value, to_value, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        designRequestId,
        eventType,
        actor?.userId ?? null,
        actor?.fullName ?? null,
        actor?.email ?? null,
        fromValue ?? null,
        toValue ?? null,
        detail ? JSON.stringify(detail) : null,
      ]
    )
  } catch (err) {
    // Never let history logging break the underlying action.
    console.warn('[design-activity] failed to log', eventType, 'for', designRequestId, err)
  }
}

export interface DesignActivityRow {
  id: string
  eventType: DesignActivityType
  actorId: string | null
  actorName: string | null
  actorEmail: string | null
  fromValue: string | null
  toValue: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

export async function getDesignActivity(designRequestId: string): Promise<DesignActivityRow[]> {
  const r = await query(
    `SELECT id, event_type, actor_id, actor_name, actor_email, from_value, to_value, detail, created_at
       FROM design_request_activity
      WHERE design_request_id = $1
      ORDER BY created_at DESC, id DESC`,
    [designRequestId]
  )
  return r.rows.map((row: any) => ({
    id: row.id,
    eventType: row.event_type,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorEmail: row.actor_email,
    fromValue: row.from_value,
    toValue: row.to_value,
    detail: row.detail ?? null,
    createdAt: row.created_at,
  }))
}
