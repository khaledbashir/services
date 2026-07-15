export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { exportNewsletterFullHtml, parseVisualDocument } from '@/lib/marketing/newsletter-visual'

/**
 * Public "view in browser" page for a sent/staged newsletter campaign.
 * The campaign id is an unguessable UUID; this renders exactly the HTML that
 * recipients get (minus their personal unsubscribe link).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const r = await query(
      `SELECT id, subject, preview_text, visual_content, body_html FROM newsletter_campaigns WHERE id=$1`,
      [params.id])
    const c = r.rows[0]
    if (!c) return new NextResponse('This newsletter is not available.', { status: 404 })

    const visual = parseVisualDocument(c.visual_content)
    const html = visual
      ? exportNewsletterFullHtml(
          { ...visual, subject: visual.subject || c.subject, previewText: visual.previewText || c.preview_text || '' },
        )
      : `<!DOCTYPE html><html><body style="margin:0;background:#F3F6FA;padding:24px"><div style="max-width:600px;margin:0 auto">${c.body_html || ''}</div></body></html>`

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' } })
  } catch (err) {
    console.error('newsletter view failed:', err)
    return new NextResponse('Could not load this newsletter.', { status: 500 })
  }
}
