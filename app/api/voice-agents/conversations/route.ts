import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'

// Conversation history list — mirrors the ElevenLabs "Conversation history" view.
// Joins ai_chats → voice_agents + staff, and folds per-chat aggregates
// (message count, duration, status) so the table renders in one query.
//
// Visibility:
//   admin / tech_support → every conversation across the org
//   manager / technician → only conversations they initiated
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const agentParam = searchParams.get('agent')?.trim() || ''
  const statusParam = searchParams.get('status')?.trim() || ''
  const search = searchParams.get('q')?.trim() || ''
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200)
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0)

  const seesAll = auth.role === 'admin' || auth.role === 'tech_support'

  const where: string[] = ['c.voice_agent_id IS NOT NULL']
  const values: unknown[] = []

  if (!seesAll) {
    values.push(auth.userId)
    where.push(`c.user_id = $${values.length}::uuid`)
  }

  if (agentParam) {
    // Accept either UUID or slug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentParam)
    values.push(agentParam)
    where.push(isUuid
      ? `va.id = $${values.length}::uuid`
      : `va.slug = $${values.length}`)
  }

  if (search) {
    values.push(`%${search}%`)
    where.push(`(c.title ILIKE $${values.length} OR va.name ILIKE $${values.length})`)
  }

  // Status derived from the last assistant message: errors are written as
  // "⚠️ ..." in lib/ai/agent.ts catch handler. Empty = no messages yet.
  const statusExpr = `
    CASE
      WHEN agg.message_count = 0 THEN 'empty'
      WHEN agg.last_assistant_text LIKE '⚠️%' THEN 'error'
      ELSE 'successful'
    END
  `

  if (statusParam && ['successful', 'error', 'empty'].includes(statusParam)) {
    values.push(statusParam)
    where.push(`${statusExpr} = $${values.length}`)
  }

  values.push(limit)
  const limitIdx = values.length
  values.push(offset)
  const offsetIdx = values.length

  const sql = `
    WITH msg_agg AS (
      SELECT
        chat_id,
        COUNT(*) FILTER (WHERE role IN ('user', 'assistant')) AS message_count,
        MIN(created_at) AS first_message_at,
        MAX(created_at) AS last_message_at,
        (
          SELECT content FROM ai_messages
          WHERE chat_id = m.chat_id AND role = 'assistant'
          ORDER BY created_at DESC LIMIT 1
        ) AS last_assistant_text
      FROM ai_messages m
      GROUP BY chat_id
    )
    SELECT
      c.id,
      c.title,
      c.created_at,
      c.updated_at,
      c.user_id,
      s.full_name AS user_name,
      s.email AS user_email,
      va.id AS agent_id,
      va.slug AS agent_slug,
      va.name AS agent_name,
      COALESCE(agg.message_count, 0)::int AS message_count,
      EXTRACT(EPOCH FROM (agg.last_message_at - agg.first_message_at))::int AS duration_seconds,
      ${statusExpr} AS status
    FROM ai_chats c
    INNER JOIN voice_agents va ON va.id = c.voice_agent_id
    LEFT JOIN staff s ON s.id = c.user_id
    LEFT JOIN msg_agg agg ON agg.chat_id = c.id
    WHERE ${where.join(' AND ')}
    ORDER BY c.updated_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `

  const r = await query(sql, values)

  // Total count (no pagination) for "X of Y" display.
  const countValues = values.slice(0, values.length - 2)
  const countSql = `
    WITH msg_agg AS (
      SELECT
        chat_id,
        COUNT(*) FILTER (WHERE role IN ('user', 'assistant')) AS message_count,
        (
          SELECT content FROM ai_messages
          WHERE chat_id = m.chat_id AND role = 'assistant'
          ORDER BY created_at DESC LIMIT 1
        ) AS last_assistant_text
      FROM ai_messages m
      GROUP BY chat_id
    )
    SELECT COUNT(*)::int AS total
    FROM ai_chats c
    INNER JOIN voice_agents va ON va.id = c.voice_agent_id
    LEFT JOIN msg_agg agg ON agg.chat_id = c.id
    WHERE ${where.join(' AND ')}
  `
  const countR = await query(countSql, countValues)

  return NextResponse.json({
    ok: true,
    conversations: r.rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      agentId: row.agent_id,
      agentSlug: row.agent_slug,
      agentName: row.agent_name,
      messageCount: row.message_count,
      durationSeconds: row.duration_seconds || 0,
      status: row.status,
    })),
    total: countR.rows[0]?.total || 0,
    limit,
    offset,
    scope: seesAll ? 'all' : 'self',
  })
}
