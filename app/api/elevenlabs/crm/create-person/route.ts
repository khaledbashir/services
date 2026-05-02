import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolveCompany } from '@/lib/elevenlabs-crm-resolve'

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

  const firstName = cleanQuery(typeof body.first_name === 'string' ? body.first_name : '', 80)
  const lastName = cleanQuery(typeof body.last_name === 'string' ? body.last_name : '', 80)
  const email = cleanQuery(typeof body.email === 'string' ? body.email : '', 200)
  const phone = cleanQuery(typeof body.phone === 'string' ? body.phone : '', 60)
  const jobTitle = cleanQuery(typeof body.job_title === 'string' ? body.job_title : '', 120)
  const companyQuery = cleanQuery(typeof body.company === 'string' ? body.company : '', 120)

  if (!firstName && !lastName) {
    return NextResponse.json({ ok: false, error: 'name_required', voiceBrief: 'I need at least a first or last name.' }, { status: 400 })
  }

  try {
    let companyId: string | undefined
    let companyName: string | undefined
    if (companyQuery) {
      const co = await resolveCompany(companyQuery)
      if (co) {
        companyId = co.id
        companyName = co.record.name
      }
    }

    const person = await twentyClient.createPerson({
      firstName: firstName || lastName,
      lastName: lastName || firstName,
      email: email || undefined,
      phone: phone || undefined,
      jobTitle: jobTitle || undefined,
      companyId,
    })

    const fullName = `${firstName} ${lastName}`.trim()
    const voiceBrief = [
      `Person ${fullName} added to the CRM`,
      jobTitle ? `as ${jobTitle}` : null,
      companyName ? `at ${companyName}` : null,
    ].filter(Boolean).join(' ') + '.'

    return NextResponse.json({
      ok: true,
      created: true,
      person: { id: person.id, fullName },
      company: companyName ? { id: companyId, name: companyName } : null,
      voiceBrief,
    })
  } catch (error) {
    console.error('crm create-person:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
