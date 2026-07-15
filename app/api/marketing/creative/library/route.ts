export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { AD_FORMATS, AD_LIBRARY } from '@/lib/marketing/ad-creative'
import { AD_TEMPLATES } from '@/lib/marketing/ad-creative/templates'

export async function GET() {
  return NextResponse.json({
    formats: AD_FORMATS,
    templates: AD_TEMPLATES,
    photos: AD_LIBRARY.map(p => ({ ...p, url: `/ad-library/${p.file}` })),
  })
}
