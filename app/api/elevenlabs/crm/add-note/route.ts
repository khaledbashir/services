import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveAnyTarget } from '@/lib/elevenlabs-crm-resolve'

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

  const targetQuery = cleanQuery(typeof body.target === 'string' ? body.target : '', 200)
  const title = cleanQuery(typeof body.title === 'string' ? body.title : '', 200)
  const noteBody = cleanQuery(typeof body.note === 'string' ? body.note : '', 4000)

  if (!targetQuery) {
    return NextResponse.json({
      ok: false,
      error: 'target_required',
      voiceBrief: 'I need to know which company, opportunity, venue, or person this note is about.',
    }, { status: 400 })
  }
  if (!noteBody) {
    return NextResponse.json({ ok: false, error: 'note_required', voiceBrief: 'I need the note text.' }, { status: 400 })
  }

  try {
    const target = await resolveAnyTarget(targetQuery)
    if (!target) {
      return NextResponse.json({
        ok: false,
        error: 'target_not_found',
        voiceBrief: `I could not find a CRM record matching "${targetQuery}".`,
      }, { status: 404 })
    }

    const finalTitle = title || `Voice note — ${new Date().toISOString().slice(0, 10)}`
    const note = await twentyClient.createNote({ title: finalTitle, bodyMarkdown: noteBody })

    if (target.kind === 'company') await twentyClient.createNoteTarget({ noteId: note.id, companyId: target.id })
    else if (target.kind === 'opportunity') await twentyClient.createNoteTarget({ noteId: note.id, opportunityId: target.id })
    else if (target.kind === 'person') await twentyClient.createNoteTarget({ noteId: note.id, personId: target.id })
    // Venue notes — Twenty doesn't have a noteTarget for venues, so we drop
    // the linkage and store as standalone note. The agent should be told
    // when this happens so the user knows.

    const linkSuffix = target.kind === 'venue' ? ' (no linkage — venues don\'t accept note targets in Twenty)' : ''
    return NextResponse.json({
      ok: true,
      created: true,
      note: { id: note.id, title: note.title },
      target,
      voiceBrief: `Note saved on ${target.kind} ${target.name}${linkSuffix}.`,
    })
  } catch (error) {
    console.error('crm add-note:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'note_failed' },
      { status: 500 }
    )
  }
}
