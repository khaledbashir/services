export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import {
  buildAdHtml,
  getLibraryPhoto,
  readLibraryPhotoDataUri,
  readLogoDataUri,
  resolveFormat,
  type AdTemplateId,
} from '@/lib/marketing/ad-creative'
import { renderAdCreative } from '@/lib/marketing/ad-creative/render'

const TEMPLATE_IDS: AdTemplateId[] = ['spotlight', 'cinematic', 'statement']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const format = resolveFormat({
      formatId: body.formatId ? String(body.formatId) : undefined,
      width: body.width,
      height: body.height,
      maxBytes: body.maxBytes,
    })
    if (!format) {
      return NextResponse.json({ error: 'Unknown format or invalid custom dimensions' }, { status: 400 })
    }

    const template = TEMPLATE_IDS.includes(body.template) ? (body.template as AdTemplateId) : 'spotlight'

    const photoId = String(body.photoId || '')
    const photo = getLibraryPhoto(photoId)
    const photoDataUri = await readLibraryPhotoDataUri(photoId)
    if (!photo || !photoDataUri) {
      return NextResponse.json({ error: 'Unknown photo' }, { status: 400 })
    }

    const headline = String(body.headline || '').trim()
    if (template !== 'cinematic' && !headline) {
      return NextResponse.json({ error: 'Headline is required' }, { status: 400 })
    }

    const logoDataUri = await readLogoDataUri('white')
    const html = buildAdHtml({
      template,
      width: format.width,
      height: format.height,
      copy: {
        eyebrow: String(body.eyebrow || '').trim() || undefined,
        headline,
        cta: String(body.cta || '').trim() || undefined,
        tagline: String(body.tagline || '').trim() || undefined,
      },
      photoDataUri,
      logoDataUri,
      photoFocusY: Number.isFinite(Number(body.photoFocusY)) ? Number(body.photoFocusY) : undefined,
    })

    const safeBase = `ANC-${format.formatId === 'custom' ? `${format.width}x${format.height}` : format.formatId}`
      .replace(/[^a-zA-Z0-9-]/g, '')
    const result = await renderAdCreative({
      html,
      width: format.width,
      height: format.height,
      maxBytes: format.maxBytes,
      baseName: `${safeBase}-${format.width}x${format.height}`,
      animate: Boolean(body.animate),
    })

    return NextResponse.json({
      files: result.files,
      width: result.width,
      height: result.height,
      maxBytes: result.maxBytes,
      photo: { id: photo.id, venue: photo.venue },
    })
  } catch (err) {
    console.error('Ad creative render failed:', err)
    const message = err instanceof Error ? err.message : 'Render failed'
    const isConnect = /connect|ECONNREFUSED|WebSocket|browserless/i.test(message)
    return NextResponse.json(
      { error: isConnect ? 'Render service unavailable' : 'Render failed' },
      { status: 502 }
    )
  }
}
