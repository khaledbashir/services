import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'

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

  const name = cleanQuery(typeof body.name === 'string' ? body.name : '', 200)
  const domain = cleanQuery(typeof body.domain === 'string' ? body.domain : '', 200)
  const city = cleanQuery(typeof body.city === 'string' ? body.city : '', 100)
  const state = cleanQuery(typeof body.state === 'string' ? body.state : '', 60)

  if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 })

  try {
    const co = await twentyClient.createCompany({
      name,
      domain: domain || undefined,
      address: (city || state) ? { city: city || undefined, state: state || undefined } : undefined,
    })
    return NextResponse.json({
      ok: true,
      created: true,
      company: { id: co.id, name: co.name },
      voiceBrief: `Company "${name}" added to the CRM${city ? ` (${city}${state ? `, ${state}` : ''})` : ''}.`,
    })
  } catch (error) {
    console.error('crm create-company:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
