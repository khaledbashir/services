export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { loadMarketingComposeContext } from '@/lib/marketing/compose-context'
import { generateCampaignArtifact } from '@/lib/marketing/compose-generate'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const brief = String(body.brief || '').trim()
    if (!brief) {
      return NextResponse.json({ error: 'Brief is required' }, { status: 400 })
    }

    const audienceId = body.audienceId ? String(body.audienceId) : null
    const context = await loadMarketingComposeContext()
    const audience = audienceId
      ? context.audiences.find((row) => row.id === audienceId)
      : context.audiences[0]

    const result = await generateCampaignArtifact({
      brief,
      audienceName: audience?.name,
      context,
    })

    return NextResponse.json({
      artifact: result.artifact,
      visual: result.visual,
      bodyHtml: result.bodyHtml,
      audienceId: audience?.id || null,
      audienceName: audience?.name || null,
      contextLoadedAt: context.loadedAt,
    })
  } catch (err) {
    console.error('marketing compose generate:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 })
  }
}
