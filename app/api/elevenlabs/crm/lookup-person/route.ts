import { NextRequest, NextResponse } from 'next/server'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'
import { twentyClient } from '@/lib/twenty-client'
import { resolvePerson } from '@/lib/elevenlabs-crm-resolve'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ ok: false, error: 'twenty_crm_not_configured' }, { status: 503 })
  }

  const query = cleanQuery(request.nextUrl.searchParams.get('query') || request.nextUrl.searchParams.get('name'))
  if (!query) return NextResponse.json({ ok: false, error: 'query_required' }, { status: 400 })

  try {
    const person = await resolvePerson(query)
    if (!person) {
      return NextResponse.json({
        ok: true,
        found: false,
        query,
        voiceBrief: `I could not find a person matching ${query} in the CRM.`,
      })
    }

    const company = person.record.companyId ? await twentyClient.getCompany(person.record.companyId) : null
    const role = (person.record as { jobTitle?: string }).jobTitle || null

    const voiceBrief = [
      `${person.fullName}${role ? `, ${role}` : ''}${company ? ` at ${company.name}` : ''}.`,
      person.record.emails?.primaryEmail ? `Email ${person.record.emails.primaryEmail}.` : null,
    ].filter(Boolean).join(' ')

    return NextResponse.json({
      ok: true,
      found: true,
      person: {
        id: person.id,
        fullName: person.fullName,
        firstName: person.record.name?.firstName || null,
        lastName: person.record.name?.lastName || null,
        email: person.record.emails?.primaryEmail || null,
        phone: person.record.phones?.primaryPhoneNumber || null,
        jobTitle: role,
        isAncStaff: person.record.isAncStaff || false,
        company: company ? { id: company.id, name: company.name } : null,
      },
      voiceBrief,
    })
  } catch (error) {
    console.error('crm lookup-person:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'lookup_failed' },
      { status: 500 }
    )
  }
}
