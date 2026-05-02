import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveAnyTarget, resolvePerson } from '@/lib/elevenlabs-crm-resolve'

function naturalDateToIso(value: string): string | undefined {
  const cleaned = value.trim()
  if (!cleaned) return undefined
  // Accept YYYY-MM-DD as-is (turn into a UTC noon timestamp).
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return `${cleaned}T17:00:00.000Z`
  // Accept ISO timestamps as-is.
  if (/T\d{2}:\d{2}/.test(cleaned)) return cleaned
  // Anything else — let the agent format it; we don't want to mis-parse.
  return cleaned
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json_body' }, { status: 400 })
  }

  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const title = cleanQuery(typeof body.title === 'string' ? body.title : '', 200)
  const taskBody = cleanQuery(typeof body.body === 'string' ? body.body : '', 2000)
  const targetQuery = cleanQuery(typeof body.target === 'string' ? body.target : '', 200)
  const assigneeQuery = cleanQuery(typeof body.assignee === 'string' ? body.assignee : '', 100)
  const dueAtRaw = cleanQuery(typeof body.due_at === 'string' ? body.due_at : '', 32)
  const status = cleanQuery(typeof body.status === 'string' ? body.status : '', 20).toUpperCase() as 'TODO' | 'IN_PROGRESS' | 'DONE' | ''
  const finalStatus: 'TODO' | 'IN_PROGRESS' | 'DONE' = (status === 'IN_PROGRESS' || status === 'DONE') ? status : 'TODO'

  if (!title) {
    return NextResponse.json({ ok: false, error: 'title_required', voiceBrief: 'I need a one-line title for the task.' }, { status: 400 })
  }

  try {
    let assigneeId: string | undefined
    let assigneeName: string | undefined
    if (assigneeQuery) {
      const person = await resolvePerson(assigneeQuery)
      if (person && person.record.isAncStaff) {
        assigneeId = person.id
        assigneeName = person.fullName
      }
    }

    const dueAt = naturalDateToIso(dueAtRaw)

    const task = await twentyClient.createTask({
      title,
      body: taskBody || undefined,
      status: finalStatus,
      dueAt,
      assigneeId,
    })

    let target: { kind: string; id: string; name: string } | null = null
    if (targetQuery) {
      const t = await resolveAnyTarget(targetQuery)
      if (t) {
        target = t
        if (t.kind === 'company') await twentyClient.createTaskTarget({ taskId: task.id, companyId: t.id })
        else if (t.kind === 'opportunity') await twentyClient.createTaskTarget({ taskId: task.id, opportunityId: t.id })
        else if (t.kind === 'person') await twentyClient.createTaskTarget({ taskId: task.id, personId: t.id })
      }
    }

    const voiceBrief = [
      `Task "${title}" created`,
      assigneeName ? `for ${assigneeName}` : null,
      target ? `linked to ${target.kind} ${target.name}` : null,
      dueAt ? `due ${dueAt.slice(0, 10)}` : null,
    ].filter(Boolean).join(', ') + '.'

    return NextResponse.json({
      ok: true,
      created: true,
      task: { id: task.id, title: task.title, status: finalStatus },
      assignee: assigneeName ? { id: assigneeId, name: assigneeName } : null,
      target,
      voiceBrief,
    })
  } catch (error) {
    console.error('crm create-task:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
