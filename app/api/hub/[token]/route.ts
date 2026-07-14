export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { HUB_PLATFORMS, getHubAccess, getHubKpis, getPlatformHealth, getStatusEntries } from '@/lib/hub'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || '').trim()
  if (token.length < 20) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const person = await getHubAccess(token)
  if (!person) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [health, kpis, feed] = await Promise.all([
    getPlatformHealth(),
    getHubKpis(),
    getStatusEntries(),
  ])

  return NextResponse.json({
    person: { name: person.person_name, email: person.person_email },
    logins: person.logins || [],
    platforms: HUB_PLATFORMS.map((p) => ({
      ...p,
      health: health.find((h) => h.key === p.key) || null,
    })),
    kpis,
    feed,
  })
}
