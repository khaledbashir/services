import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Maintenance, isTwentyBackedEnabled, twentyVenueToDashboard, type TwentyMaintenanceLog } from '@/lib/twenty-ops'

// Legacy response shape the /maintenance page consumes:
//   { logs: [ { id, venue_id, venue_name, technician_name, asset_name,
//               maintenance_type, issue, issue_summary, details_to_resolve,
//               status, reported_date, scheduled_date, completed_date,
//               escort_information, location_reported, techs_scheduled,
//               created_at, updated_at } ] }

async function reshapeMaintenance(log: TwentyMaintenanceLog) {
  const details = typeof log.detailsToResolve === 'object'
    ? (log.detailsToResolve as any)?.markdown || (log.detailsToResolve as any)?.blocknote || ''
    : (log.detailsToResolve || '')
  const summaryRich = typeof (log as any).issueSummary === 'object'
    ? ((log as any).issueSummary?.markdown || (log as any).issueSummary?.blocknote || '')
    : ((log as any).issueSummary || '')
  // Wrike migrated the task Title to Twenty's `name` field; legacy `issue` is
  // almost always empty. Fall back to name/issueSummary so the grid row isn't blank.
  const issueText = (log.issue && log.issue.trim()) || (log as any).name || summaryRich || ''
  const venue = log.maintenanceStationId ? await twentyVenueToDashboard(log.maintenanceStationId) : null
  const status = ((log as any).status || '').toString()
  const normalizedStatus = status.includes('RESOLVED') ? 'closed'
    : status.includes('IN_PROGRESS') ? 'in_progress'
    : log.scheduledDate ? 'in_progress' : 'open'
  return {
    id: log.id,
    venue_id: venue?.venue_id || null,
    venue_name: venue?.venue_name || log.maintenanceStation?.name || '',
    technician_name: log.logTechnician ? `${log.logTechnician.name.firstName} ${log.logTechnician.name.lastName}`.trim() : null,
    asset_name: log.maintenanceAsset?.name || null,
    maintenance_type: ((log as any).maintenanceType || 'reactive').toString().toLowerCase(),
    issue: issueText,
    issue_summary: issueText,
    details_to_resolve: details,
    status: normalizedStatus,
    reported_date: (log as any).reportedDate || log.scheduledDate || log.createdAt,
    scheduled_date: log.scheduledDate,
    completed_date: (log as any).completedDate || log.lastUpdated,
    escort_information: log.escortInformation,
    location_reported: log.locationReported,
    techs_scheduled: (log as any).techsScheduled || null,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('MAINTENANCE')) {
    try {
      const { searchParams } = new URL(request.url)
      const from = searchParams.get('from')
      const to = searchParams.get('to')
      const limit = Math.min(Math.max(Number(searchParams.get('limit') || 500), 1), 2000)

      const filters: string[] = []
      if (from) filters.push(`scheduledDate[gte]:"${from}"`)
      if (to)   filters.push(`scheduledDate[lte]:"${to}"`)

      const items: any[] = []
      let cursor: string | null = null
      while (items.length < limit) {
        const pageSize = Math.min(60, limit - items.length)
        const page = await Maintenance.list({
          limit: pageSize,
          startingAfter: cursor || undefined,
          filter: filters.length ? filters.join(',') : undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const log of page.items) items.push(await reshapeMaintenance(log))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ logs: items, next_cursor: cursor, filters_applied: filters.length })
    } catch (err) {
      console.error('[maintenance GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list maintenance logs from Twenty' }, { status: 500 })
    }
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const venueId = searchParams.get('venue_id')
  const conditions: string[] = []
  const params: unknown[] = []
  if (status) { params.push(status); conditions.push(`m.status = $${params.length}`) }
  if (venueId) { params.push(venueId); conditions.push(`m.venue_id = $${params.length}`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await query(
    `SELECT m.*, v.name AS venue_name, s.full_name AS technician_name, i.item_name AS asset_name
     FROM maintenance_logs m
     LEFT JOIN venues v ON v.id = m.venue_id
     LEFT JOIN staff s ON s.id = m.technician_id
     LEFT JOIN inventory i ON i.id = m.asset_id
     ${where}
     ORDER BY m.reported_date DESC NULLS LAST, m.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ logs: result.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const {
    venue_id, asset_id = null, station_id = null, technician_id = null,
    maintenance_type = 'reactive', issue = null, issue_summary = null, details_to_resolve = null,
    status = 'open', reported_date = null, scheduled_date = null, completed_date = null,
    escort_information = null, location_reported = null, techs_scheduled = null,
  } = body
  if (!venue_id) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })

  if (isTwentyBackedEnabled('MAINTENANCE')) {
    try {
      // Translate the dashboard venue UUID to Twenty's internal ID so
      // the maintenance log links to the right station. Silent null if we
      // can't find it — Twenty lets the log exist unlinked.
      const { dashboardVenueIdToTwentyId } = await import('@/lib/twenty-ops')
      const twentyVenueId = venue_id ? await dashboardVenueIdToTwentyId(venue_id) : null
      const created = await Maintenance.create({
        name: issue_summary || issue || 'Maintenance log',
        issue,
        issueSummary: issue_summary ? { markdown: issue_summary } : null,
        detailsToResolve: details_to_resolve ? { markdown: details_to_resolve } : null,
        scheduledDate: scheduled_date,
        locationReported: location_reported,
        escortInformation: escort_information,
        techsScheduled: techs_scheduled || null,
        maintenanceType: maintenance_type ? `MAINTENANCE_TYPE_${maintenance_type.toUpperCase()}` : 'MAINTENANCE_TYPE_OTHER',
        status: `STATUS_${(status || 'open').toUpperCase()}`,
        maintenanceStationId: twentyVenueId,
        maintenanceAssetId: asset_id || null,
      } as any)
      return NextResponse.json({ log: { id: created.id, ...body } })
    } catch (err) {
      console.error('[maintenance POST twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to create maintenance log in Twenty' }, { status: 500 })
    }
  }

  const result = await query(
    `INSERT INTO maintenance_logs (
       venue_id, asset_id, station_id, technician_id, maintenance_type, issue, issue_summary,
       details_to_resolve, status, reported_date, scheduled_date, completed_date,
       escort_information, location_reported, techs_scheduled
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [venue_id, asset_id, station_id, technician_id, maintenance_type, issue, issue_summary,
     details_to_resolve, status, reported_date, scheduled_date, completed_date,
     escort_information, location_reported, techs_scheduled]
  )
  return NextResponse.json({ log: result.rows[0] })
}
