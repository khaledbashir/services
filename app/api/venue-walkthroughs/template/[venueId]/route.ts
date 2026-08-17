export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getOrCreateTemplate, listTemplateItems, replaceTemplateItems } from '@/lib/venue-walkthroughs'

/**
 * The venue's standard walk-thru checklist (Joe 2026-08-17).
 *
 * GET is open to technicians so someone walking the building can see the list.
 * PUT is manager-and-above: the standard walk is a venue-level definition, not
 * something the person answering it edits mid-walk.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { venueId: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const template = await getOrCreateTemplate(params.venueId, auth.userId)
  const items = await listTemplateItems(template.id)
  return NextResponse.json({ template, items })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { venueId: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    if (!Array.isArray(body?.items)) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 })
    }

    const template = await getOrCreateTemplate(params.venueId, auth.userId)
    const items = await replaceTemplateItems(template.id, body.items)
    return NextResponse.json({ template, items })
  } catch (err) {
    console.error('Error saving walk-thru template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
