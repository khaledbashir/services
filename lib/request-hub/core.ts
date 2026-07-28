// Request Hub — core record operations. Single code path for creating,
// updating, and transitioning requests so web, Slack, and AI surfaces
// can't drift (same rule as lib/ticket-comment.ts).

import { query } from '@/lib/db'
import { getHubConfig, statusByKey, type HubConfig } from './config'

export type HubActivityType =
  | 'created'
  | 'submitted'
  | 'status_change'
  | 'field_change'
  | 'assigned'
  | 'priority_change'
  | 'assessment'
  | 'decision'
  | 'comment'
  | 'clarification_request'
  | 'clarification_answer'
  | 'attachment'
  | 'link'
  | 'slack'
  | 'config_change'

export interface HubActivityActor {
  userId?: string | null
  fullName?: string | null
}

// Never let history logging break the underlying action.
export async function logHubActivity(entry: {
  requestId: string
  eventType: HubActivityType
  actor?: HubActivityActor
  fromValue?: string | null
  toValue?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  try {
    await query(
      `INSERT INTO request_hub_activity (request_id, event_type, actor_id, actor_name, from_value, to_value, detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.requestId,
        entry.eventType,
        entry.actor?.userId || null,
        entry.actor?.fullName || null,
        entry.fromValue ?? null,
        entry.toValue ?? null,
        entry.detail ? JSON.stringify(entry.detail) : null,
      ]
    )
  } catch (err) {
    console.warn('[request-hub] activity log failed:', err)
  }
}

export async function nextRequestNumber(): Promise<string> {
  const res = await query(`SELECT nextval('request_hub_number_seq') AS n`)
  const n = Number(res.rows[0]?.n || 1)
  return `REQ-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`
}

// ---------------------------------------------------------------------------
// Create / submit
// ---------------------------------------------------------------------------

export interface CreateRequestInput {
  type?: string
  title?: string | null
  summary?: string | null
  answers?: Record<string, unknown>
  status?: 'draft' | 'submitted'
  urgency?: string | null
  priority?: string | null
  deadline?: string | null
  deadlineReason?: string | null
  constraintsNote?: string | null
  team?: string | null
  venueId?: string | null
  requester: {
    userId?: string | null
    fullName?: string | null
    email?: string | null
    slackUserId?: string | null
  }
  source?: string
  sourceChannelId?: string | null
  sourceMessageTs?: string | null
  sourcePermalink?: string | null
}

export async function createRequest(input: CreateRequestInput): Promise<any> {
  const status = input.status === 'submitted' ? 'submitted' : 'draft'
  const requestNumber = status === 'submitted' ? await nextRequestNumber() : null
  const res = await query(
    `INSERT INTO request_hub_items (
       request_number, type, status, priority, urgency, title, summary, answers,
       requester_id, requester_name, requester_email, requester_slack_id,
       deadline, deadline_reason, constraints_note, team, venue_id,
       source, source_channel_id, source_message_ts, source_permalink,
       submitted_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
       CASE WHEN $3 = 'submitted' THEN NOW() ELSE NULL END)
     RETURNING *`,
    [
      requestNumber,
      input.type || 'idea',
      status,
      input.priority || 'medium',
      input.urgency || null,
      input.title || null,
      input.summary || null,
      JSON.stringify(input.answers || {}),
      input.requester.userId || null,
      input.requester.fullName || null,
      input.requester.email || null,
      input.requester.slackUserId || null,
      input.deadline || null,
      input.deadlineReason || null,
      input.constraintsNote || null,
      input.team || null,
      input.venueId || null,
      input.source || 'web',
      input.sourceChannelId || null,
      input.sourceMessageTs || null,
      input.sourcePermalink || null,
    ]
  )
  const row = res.rows[0]
  await logHubActivity({
    requestId: row.id,
    eventType: status === 'submitted' ? 'submitted' : 'created',
    actor: { userId: input.requester.userId, fullName: input.requester.fullName },
    toValue: status,
    detail: { source: input.source || 'web' },
  })
  return row
}

/** Finalize a draft: assign a request number, set status, apply routing. */
export async function submitRequest(
  requestId: string,
  actor: HubActivityActor,
  config?: HubConfig
): Promise<any | null> {
  const cfg = config || (await getHubConfig())
  const existing = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [requestId])
  const row = existing.rows[0]
  if (!row) return null
  if (row.status !== 'draft') return row

  const requestNumber = row.request_number || (await nextRequestNumber())
  const ownerId = cfg.routing.typeOwners[row.type] || cfg.routing.defaultOwnerId || null
  const res = await query(
    `UPDATE request_hub_items
     SET status = 'submitted', request_number = $2, owner_id = COALESCE(owner_id, $3),
         submitted_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [requestId, requestNumber, ownerId]
  )
  const updated = res.rows[0]
  await logHubActivity({
    requestId,
    eventType: 'submitted',
    actor,
    fromValue: 'draft',
    toValue: 'submitted',
    detail: { request_number: requestNumber },
  })
  return updated
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface ListRequestsOptions {
  status?: string | null
  type?: string | null
  requesterId?: string | null
  ownerId?: string | null
  includeDrafts?: boolean
  scopeToRequesterId?: string | null // non-leadership callers only see their own
  search?: string | null
  limit?: number
}

export async function listRequests(opts: ListRequestsOptions = {}): Promise<any[]> {
  const where: string[] = []
  const params: any[] = []
  const add = (clause: string, value: any) => {
    params.push(value)
    where.push(clause.replace('?', `$${params.length}`))
  }

  if (!opts.includeDrafts) where.push(`r.status <> 'draft'`)
  if (opts.status) add(`r.status = ?`, opts.status)
  if (opts.type) add(`r.type = ?`, opts.type)
  if (opts.requesterId) add(`r.requester_id = ?`, opts.requesterId)
  if (opts.ownerId) add(`r.owner_id = ?`, opts.ownerId)
  if (opts.scopeToRequesterId) add(`r.requester_id = ?`, opts.scopeToRequesterId)
  if (opts.search) {
    params.push(`%${opts.search}%`)
    const p = `$${params.length}`
    where.push(`(r.title ILIKE ${p} OR r.summary ILIKE ${p} OR r.request_number ILIKE ${p})`)
  }

  const res = await query(
    `SELECT r.*,
            req.full_name AS requester_staff_name,
            own.full_name AS owner_name,
            bld.full_name AS builder_name,
            v.name AS venue_name,
            (SELECT COUNT(*)::int FROM request_hub_comments c WHERE c.request_id = r.id) AS comment_count,
            (SELECT COUNT(*)::int FROM request_hub_attachments a WHERE a.request_id = r.id) AS attachment_count
     FROM request_hub_items r
     LEFT JOIN staff req ON req.id = r.requester_id
     LEFT JOIN staff own ON own.id = r.owner_id
     LEFT JOIN staff bld ON bld.id = r.builder_id
     LEFT JOIN venues v ON v.id = r.venue_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY r.updated_at DESC
     LIMIT ${Math.min(Math.max(opts.limit || 500, 1), 1000)}`,
    params
  )
  return res.rows
}

export async function getRequestDetail(requestId: string): Promise<any | null> {
  const res = await query(
    `SELECT r.*,
            req.full_name AS requester_staff_name, req.email AS requester_staff_email,
            own.full_name AS owner_name,
            bld.full_name AS builder_name,
            dec.full_name AS decided_by_name,
            v.name AS venue_name
     FROM request_hub_items r
     LEFT JOIN staff req ON req.id = r.requester_id
     LEFT JOIN staff own ON own.id = r.owner_id
     LEFT JOIN staff bld ON bld.id = r.builder_id
     LEFT JOIN staff dec ON dec.id = r.decided_by
     LEFT JOIN venues v ON v.id = r.venue_id
     WHERE r.id = $1`,
    [requestId]
  )
  const row = res.rows[0]
  if (!row) return null

  const [comments, activity, attachments, links] = await Promise.all([
    query(
      `SELECT c.*, s.full_name AS author_staff_name
       FROM request_hub_comments c LEFT JOIN staff s ON s.id = c.author_id
       WHERE c.request_id = $1 ORDER BY c.created_at ASC`,
      [requestId]
    ),
    query(
      `SELECT * FROM request_hub_activity WHERE request_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`,
      [requestId]
    ),
    query(
      `SELECT id, request_id, file_name, mime_type, size_bytes, external_url, source, uploaded_by_name, created_at,
              (data_url IS NOT NULL) AS has_data
       FROM request_hub_attachments WHERE request_id = $1 ORDER BY created_at ASC`,
      [requestId]
    ),
    query(`SELECT * FROM request_hub_links WHERE request_id = $1 ORDER BY created_at ASC`, [requestId]),
  ])

  return {
    ...row,
    comments: comments.rows,
    activity: activity.rows,
    attachments: attachments.rows.map((a) => ({ ...a, size_bytes: Number(a.size_bytes || 0) })),
    links: links.rows,
  }
}

export async function getRequestByNumber(requestNumber: string): Promise<any | null> {
  const res = await query(`SELECT * FROM request_hub_items WHERE request_number = $1`, [requestNumber])
  return res.rows[0] || null
}

export async function findBySourceMessage(channelId: string, messageTs: string): Promise<any | null> {
  const res = await query(
    `SELECT * FROM request_hub_items WHERE source_channel_id = $1 AND source_message_ts = $2 LIMIT 1`,
    [channelId, messageTs]
  )
  return res.rows[0] || null
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Columns a requester may edit on their own request while it is pre-decision. */
export const REQUESTER_EDITABLE = new Set([
  'type', 'title', 'summary', 'answers', 'urgency', 'deadline', 'deadline_reason',
  'constraints_note', 'team', 'venue_id',
])

/** Additional columns assessors/leadership may edit. */
export const ASSESSOR_EDITABLE = new Set([
  ...Array.from(REQUESTER_EDITABLE),
  'priority', 'owner_id', 'builder_id', 'business_value', 'feasibility', 'effort',
  'duration', 'dependencies', 'risk', 'confidence', 'recommendation', 'assessment',
  'assessment_ai', 'pending_questions', 'twenty_company_id', 'twenty_opportunity_id',
  'project_ref', 'app_surface', 'kanban_order',
])

const JSONB_FIELDS = new Set(['answers', 'assessment', 'pending_questions', 'ai_suggestions'])

export async function updateRequestFields(
  requestId: string,
  fields: Record<string, unknown>,
  allowed: Set<string>,
  actor: HubActivityActor,
  opts: { logEvent?: HubActivityType } = {}
): Promise<any | null> {
  const keys = Object.keys(fields).filter((k) => allowed.has(k))
  if (keys.length === 0) {
    const res = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [requestId])
    return res.rows[0] || null
  }

  const sets: string[] = []
  const params: any[] = [requestId]
  for (const key of keys) {
    const value = fields[key]
    params.push(JSONB_FIELDS.has(key) ? JSON.stringify(value ?? (key === 'pending_questions' ? [] : {})) : value ?? null)
    sets.push(`${key} = $${params.length}${JSONB_FIELDS.has(key) ? '::jsonb' : ''}`)
  }
  const res = await query(
    `UPDATE request_hub_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING *`,
    params
  )
  const row = res.rows[0]
  if (row && opts.logEvent !== undefined) {
    await logHubActivity({
      requestId,
      eventType: opts.logEvent,
      actor,
      detail: { fields: keys },
    })
  }
  return row || null
}

export async function setRequestStatus(
  requestId: string,
  status: string,
  actor: HubActivityActor,
  opts: { detail?: Record<string, unknown>; config?: HubConfig } = {}
): Promise<any | null> {
  const cfg = opts.config || (await getHubConfig())
  if (!statusByKey(cfg, status)) return null
  const res = await query(
    `UPDATE request_hub_items
     SET status = $2,
         completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END,
         updated_at = NOW()
     WHERE id = $1 AND status <> $2
     RETURNING *`,
    [requestId, status]
  )
  const row = res.rows[0]
  if (!row) {
    const cur = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [requestId])
    return cur.rows[0] || null
  }
  await logHubActivity({
    requestId,
    eventType: 'status_change',
    actor,
    toValue: status,
    detail: opts.detail,
  })
  return row
}

export type HubDecision = 'approve' | 'decline' | 'hold' | 'need_info'

const DECISION_STATUS: Record<HubDecision, string> = {
  approve: 'approved',
  decline: 'declined',
  hold: 'on_hold',
  need_info: 'needs_clarification',
}

export async function applyDecision(
  requestId: string,
  decision: HubDecision,
  reason: string | null,
  actor: HubActivityActor & { userId: string },
  opts: { questions?: string[] } = {}
): Promise<any | null> {
  const status = DECISION_STATUS[decision]
  const res = await query(
    `UPDATE request_hub_items
     SET status = $2, decision = $3, decision_reason = $4, decided_by = $5, decided_at = NOW(),
         pending_questions = CASE WHEN $3 = 'need_info' THEN $6::jsonb ELSE pending_questions END,
         updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [requestId, status, decision, reason, actor.userId, JSON.stringify(opts.questions || [])]
  )
  const row = res.rows[0]
  if (!row) return null
  await logHubActivity({
    requestId,
    eventType: 'decision',
    actor,
    toValue: decision,
    detail: { reason, questions: opts.questions || [] },
  })
  return row
}

export async function addComment(
  requestId: string,
  body: string,
  actor: HubActivityActor,
  kind: 'comment' | 'clarification_answer' | 'clarification_question' = 'comment'
): Promise<any> {
  const res = await query(
    `INSERT INTO request_hub_comments (request_id, author_id, author_name, body, kind)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [requestId, actor.userId || null, actor.fullName || null, body, kind]
  )
  await query(`UPDATE request_hub_items SET updated_at = NOW() WHERE id = $1`, [requestId])
  await logHubActivity({
    requestId,
    eventType: kind === 'comment' ? 'comment' : kind === 'clarification_answer' ? 'clarification_answer' : 'clarification_request',
    actor,
    detail: { preview: body.slice(0, 200) },
  })
  return res.rows[0]
}

// ---------------------------------------------------------------------------
// Slack idempotency
// ---------------------------------------------------------------------------

/** Returns true the first time a key is seen; false on Slack retries. */
export async function markHubSlackEvent(eventKey: string): Promise<boolean> {
  try {
    const res = await query(
      `INSERT INTO request_hub_slack_events (event_key) VALUES ($1)
       ON CONFLICT (event_key) DO NOTHING RETURNING event_key`,
      [eventKey]
    )
    return res.rows.length > 0
  } catch (err) {
    console.warn('[request-hub] slack idempotency check failed:', err)
    return true
  }
}
