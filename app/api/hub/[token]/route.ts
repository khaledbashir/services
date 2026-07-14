export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import {
  HUB_CLASSIFICATIONS,
  getHubAccess,
  getHubKpis,
  getPlatformHealth,
  getStatusEntries,
  normalizeClassification,
  platformsForClassification,
} from '@/lib/hub'

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const token = String(params.token || '').trim()
  if (token.length < 20) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const person = await getHubAccess(token)
  if (!person) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const classification = normalizeClassification(person.classification)
  const spec = HUB_CLASSIFICATIONS[classification]
  const platforms = platformsForClassification(classification)
  const platformKeys = new Set(platforms.map((p) => p.key))

  const [health, kpis, feed] = await Promise.all([
    getPlatformHealth(),
    getHubKpis(),
    getStatusEntries(),
  ])

  // Scope KPI tiles and the what's-new feed to this classification's world.
  const scopedKpis = Object.fromEntries(
    Object.entries(kpis).map(([key, value]) => [
      key,
      spec.kpiKeys === 'all' || (spec.kpiKeys as string[]).includes(key) ? value : null,
    ])
  ) as typeof kpis
  const scopedFeed = feed.filter(
    (entry: { platform_key: string }) => platformKeys.has(entry.platform_key)
  )

  return NextResponse.json({
    person: { name: person.person_name, email: person.person_email },
    classification,
    classificationLabel: spec.label,
    logins: person.logins || [],
    platforms: platforms.map((p) => ({
      ...p,
      health: health.find((h) => h.key === p.key) || null,
    })),
    kpis: scopedKpis,
    feed: scopedFeed,
  })
}
