export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getComposeRun } from '@/lib/marketing/compose-runs'
import { exportNewsletterFullHtml } from '@/lib/marketing/newsletter-visual'

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const run = await getComposeRun(params.id)
    if (!run) return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    const html = exportNewsletterFullHtml(run.visual)
    return NextResponse.json({ run, html })
  } catch (err) {
    console.error('compose run fetch failed:', err)
    return NextResponse.json({ error: 'Could not load the run' }, { status: 500 })
  }
}
