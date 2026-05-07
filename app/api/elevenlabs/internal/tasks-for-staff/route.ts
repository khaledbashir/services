export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { twentyClient } from '@/lib/twenty-client'
import { authorizeVoiceCall, cleanQuery, compactDate } from '@/lib/elevenlabs-internal-auth'
import { resolvePerson } from '@/lib/elevenlabs-crm-resolve'

// "What is Joe waiting on" / "Show me Charlie's open tasks"
// Resolves a name to an ANC staff person, lists their open Twenty CRM tasks.

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const name = cleanQuery(request.nextUrl.searchParams.get('name') || request.nextUrl.searchParams.get('staff'))
  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

  try {
    const person = await resolvePerson(name)
    if (!person) {
      return NextResponse.json({
        ok: true,
        found: false,
        query: name,
        voiceBrief: `I could not find anyone named ${name}.`,
      })
    }

    const tasks = await twentyClient.getTasks(`assigneeId[eq]:"${person.id}"`)
    const open = tasks.filter(t => String(t.status || '').toUpperCase() !== 'DONE')
    const sorted = open.sort((a, b) => {
      const ad = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      const bd = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER
      return ad - bd
    })
    const overdue = sorted.filter(t => t.dueAt && new Date(t.dueAt).getTime() < Date.now()).length
    const dueThisWeek = sorted.filter(t => {
      if (!t.dueAt) return false
      const due = new Date(t.dueAt).getTime()
      return due >= Date.now() && due < Date.now() + 7 * 24 * 3600 * 1000
    }).length

    const voiceBrief = open.length === 0
      ? `${person.fullName} has no open tasks.`
      : [
          `${person.fullName} has ${open.length} open task${open.length === 1 ? '' : 's'}.`,
          overdue ? `${overdue} overdue.` : null,
          dueThisWeek ? `${dueThisWeek} due this week.` : null,
          sorted[0] ? `Next up: ${sorted[0].title}${sorted[0].dueAt ? `, due ${compactDate(sorted[0].dueAt)}` : ''}.` : null,
        ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      person: { id: person.id, name: person.fullName },
      counts: { open: open.length, overdue, dueThisWeek },
      tasks: sorted.slice(0, 10).map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dueAt: compactDate(t.dueAt),
        priority: t.taskPriority || null,
        overdue: t.dueAt ? new Date(t.dueAt).getTime() < Date.now() : false,
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('voice tasks-for-staff:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'tasks_failed' },
      { status: 500 }
    )
  }
}
