import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { OpeningChecklist, OpeningChecklistTemplate, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import {
  deriveDueDate,
  parseTemplateItems,
  resolveDefaultAssigneeForVenue,
  resolveVenueForChecklist,
  shapeOpeningChecklistItem,
  toTwentyOpeningChecklistPhase,
} from '../shared'

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const venueId = body.venue_id ? String(body.venue_id) : ''
    const templateId = body.template_id ? String(body.template_id) : ''
    const openingDate = body.opening_date ? String(body.opening_date) : ''

    if (!venueId || !templateId || !openingDate) {
      return NextResponse.json({ error: 'venue_id, template_id, and opening_date are required' }, { status: 400 })
    }

    const twentyVenueId = await resolveVenueForChecklist(venueId)
    if (!twentyVenueId) {
      return NextResponse.json({ error: 'Venue is not mirrored in Twenty yet' }, { status: 409 })
    }

    const template = await OpeningChecklistTemplate.get(templateId)
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const templateItems = parseTemplateItems(template.items)
    if (templateItems.length === 0) {
      return NextResponse.json({ error: 'Template has no items to clone' }, { status: 400 })
    }

    const existing = await OpeningChecklist.list({
      limit: 200,
      filter: `venueId[eq]:\"${twentyVenueId}\"`,
      orderBy: 'createdAt[AscNullsLast]',
    })
    const existingKeys = new Set(
      existing.items.map((item) => `${item.venueId || ''}|${item.openingDate || ''}|${item.phase || ''}|${(item.name || '').trim().toLowerCase()}`),
    )

    const createdItems = []

    for (const item of templateItems) {
      const dedupeKey = `${twentyVenueId}|${openingDate}|${item.phase}|${item.name.trim().toLowerCase()}`
      if (existingKeys.has(dedupeKey)) continue

      const assignee = await resolveDefaultAssigneeForVenue(venueId, item.defaultAssigneeRole)
      const created = await OpeningChecklist.create({
        name: item.name,
        venueId: twentyVenueId,
        league: template.league || null,
        phase: toTwentyOpeningChecklistPhase(item.phase),
        openingDate,
        dueDate: deriveDueDate(openingDate, item.phase),
        itemDescription: item.itemDescription ? { markdown: item.itemDescription } : null,
        checklistAssigneeId: assignee.technicianId,
        status: 'pending',
        completedAt: null,
        notes: null,
      })
      const fullRecord = await OpeningChecklist.get(created.id)
      if (fullRecord) createdItems.push(await shapeOpeningChecklistItem(fullRecord))
    }

    return NextResponse.json({
      created_count: createdItems.length,
      skipped_count: templateItems.length - createdItems.length,
      items: createdItems,
    })
  } catch (err) {
    console.error('[opening-checklists clone-template] error:', err)
    return NextResponse.json({ error: 'Failed to clone opening checklist template' }, { status: 500 })
  }
}
