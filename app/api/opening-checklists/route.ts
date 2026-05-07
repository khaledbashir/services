export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError, getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds } from '@/lib/venue-filter'
import {
  OpeningChecklist,
  OpeningChecklistTemplate,
  buildTwentyVenueFilter,
  dashboardVenueIdToTwentyId,
  isTwentyBackedEnabled,
} from '@/lib/twenty-ops'
import {
  buildOpeningChecklistPatch,
  deriveDueDate,
  getStaffLookup,
  normalizeOpeningChecklistLeague,
  normalizeOpeningChecklistStatus,
  resolveChecklistAssignee,
  resolveVenueForChecklist,
  shapeOpeningChecklistItem,
  shapeOpeningChecklistTemplate,
  toTwentyOpeningChecklistPhase,
  toTwentyOpeningChecklistStatus,
} from './shared'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')
    const league = searchParams.get('league')
    const phase = searchParams.get('phase')
    const status = searchParams.get('status')
    const openOnly = searchParams.get('open_only') === '1' || searchParams.get('open_only') === 'true'
    const includeTemplates = searchParams.get('include_templates') === '1' || searchParams.get('include_templates') === 'true'

    const staffVenueIds = await getStaffVenueIds(user.userId, user.role)
    const filters: string[] = []

    if (venueId) {
      const twentyVenueId = await dashboardVenueIdToTwentyId(venueId)
      if (!twentyVenueId) {
        return NextResponse.json({ items: [], templates: includeTemplates ? [] : undefined })
      }
      filters.push(`venueId[eq]:\"${twentyVenueId}\"`)
    } else {
      const venueFilter = await buildTwentyVenueFilter(staffVenueIds, 'venueId')
      if (venueFilter) filters.push(venueFilter)
    }

    if (league) filters.push(`league[eq]:\"${normalizeOpeningChecklistLeague(league) || 'OTHER'}\"`)
    if (phase) filters.push(`phase[eq]:\"${toTwentyOpeningChecklistPhase(phase)}\"`)
    if (status) filters.push(`status[eq]:\"${toTwentyOpeningChecklistStatus(status)}\"`)

    const shapedItems: Awaited<ReturnType<typeof shapeOpeningChecklistItem>>[] = []
    let cursor: string | null = null

    for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
      const page = await OpeningChecklist.list({
        limit: 60,
        startingAfter: cursor || undefined,
        filter: filters.length ? filters.join(',') : undefined,
        orderBy: 'dueDate[AscNullsLast]',
      })

      for (const item of page.items) {
        const shaped = await shapeOpeningChecklistItem(item)
        shapedItems.push(shaped)
      }

      if (!page.hasNextPage || !page.nextCursor) break
      cursor = page.nextCursor
    }

    const filteredItems = openOnly
      ? shapedItems.filter((item) => item.status !== 'complete' && item.status !== 'skipped')
      : shapedItems

    if (!includeTemplates) {
      return NextResponse.json({ items: filteredItems })
    }

    const templatesPage = await OpeningChecklistTemplate.list({
      limit: 100,
      orderBy: 'createdAt[AscNullsLast]',
    })
    return NextResponse.json({
      items: filteredItems,
      templates: templatesPage.items.map(shapeOpeningChecklistTemplate),
    })
  } catch (err) {
    console.error('[opening-checklists GET] error:', err)
    return NextResponse.json({ error: 'Failed to fetch opening checklist items' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    const body = await request.json()
    if (!String(body.name || '').trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const venueId = body.venue_id ? String(body.venue_id) : null
    const twentyVenueId = await resolveVenueForChecklist(venueId)
    if (venueId && !twentyVenueId) {
      return NextResponse.json({ error: 'Venue is not mirrored in Twenty yet' }, { status: 409 })
    }

    const assignee = await resolveChecklistAssignee(body.checklist_assignee_id ? String(body.checklist_assignee_id) : null)
    const patch = buildOpeningChecklistPatch(body)
    patch.name = String(body.name).trim()
    patch.venueId = twentyVenueId
    patch.checklistAssigneeId = assignee.technicianId

    if (!patch.dueDate) {
      patch.dueDate = deriveDueDate(String(body.opening_date || ''), String(body.phase || ''))
    }

    const normalizedStatus = normalizeOpeningChecklistStatus(String(body.status || 'pending'))
    patch.status = toTwentyOpeningChecklistStatus(normalizedStatus)
    patch.completedAt = normalizedStatus === 'complete' ? new Date().toISOString() : null

    const created = await OpeningChecklist.create(patch)
    const fullRecord = await OpeningChecklist.get(created.id)
    if (!fullRecord) return NextResponse.json({ error: 'Checklist item created but could not be reloaded' }, { status: 500 })

    return NextResponse.json({ item: await shapeOpeningChecklistItem(fullRecord) })
  } catch (err) {
    console.error('[opening-checklists POST] error:', err)
    return NextResponse.json({ error: 'Failed to create opening checklist item' }, { status: 500 })
  }
}
