export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import {
  getHubAccess,
  getHubKpis,
  getPlatformHealth,
  getStatusEntries,
  kpiKeysForClassifications,
  labelForClassifications,
  normalizeClassifications,
  platformsForClassifications,
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

  // A link may hold several classifications — the hub shows the union.
  const classifications = normalizeClassifications(person.classification)
  const platforms = platformsForClassifications(classifications)
  const platformKeys = new Set(platforms.map((p) => p.key))
  const kpiKeys = kpiKeysForClassifications(classifications)

  const [health, kpis, feed] = await Promise.all([
    getPlatformHealth(),
    getHubKpis(),
    getStatusEntries(),
  ])

  // Scope KPI tiles and the what's-new feed to this link's world.
  const scopedKpis = Object.fromEntries(
    Object.entries(kpis).map(([key, value]) => [
      key,
      kpiKeys === 'all' || (kpiKeys as string[]).includes(key) ? value : null,
    ])
  ) as typeof kpis
  const scopedFeed = feed.filter(
    (entry: { platform_key: string }) => platformKeys.has(entry.platform_key)
  )

  return NextResponse.json({
    person: { name: person.person_name, email: person.person_email },
    classification: classifications.join(','),
    classifications,
    classificationLabel: labelForClassifications(classifications),
    logins: person.logins || [],
    platforms: platforms.map((p) => ({
      ...p,
      health: health.find((h) => h.key === p.key) || null,
    })),
    kpis: scopedKpis,
    feed: scopedFeed,
  })
}
