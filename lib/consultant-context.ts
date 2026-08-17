/**
 * Consultant Context — gathers ANC's live operational state and serializes
 * it as a markdown block we pin into the advisor's AnythingLLM workspace.
 *
 * Scope is ANC THE BUSINESS — their venue footprint, field staff, ticket
 * volume, event schedule, design pipeline, client base. NOT the
 * service-contract ledger (that's Ahmad's invoicing, a separate concern).
 */

import { query } from '@/lib/db'

interface UserContext {
  fullName: string | null
  email: string | null
  role: string | null
}

function safeRows<T = Record<string, unknown>>(promise: Promise<{ rows: T[] }>): Promise<T[]> {
  return promise.then((r) => r.rows).catch(() => [] as T[])
}

export async function buildConsultantContext(_user: UserContext): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)

  // ── Venue footprint ─────────────────────────────────────────────
  const venueScale = await safeRows<{ total: string; active: string; sports: string; ooh: string }>(query(
    `SELECT
       COUNT(*)::text as total,
       COUNT(*) FILTER (WHERE COALESCE(is_active, true))::text as active,
       COUNT(*) FILTER (WHERE COALESCE(is_active, true) AND COALESCE(venue_type,'sports') = 'sports')::text as sports,
       COUNT(*) FILTER (WHERE COALESCE(is_active, true) AND venue_type = 'ooh')::text as ooh
     FROM venues`
  ))
  const v = venueScale[0] || { total: '0', active: '0', sports: '0', ooh: '0' }

  // Top 12 venues by upcoming-event load — these are the workhorse sites
  const topVenues = await safeRows<{ name: string; venue_type: string; upcoming: number; assigned_count: number }>(query(
    `SELECT v.name, COALESCE(v.venue_type,'sports') as venue_type,
            COUNT(e.id)::int as upcoming,
            COUNT(DISTINCT ea.staff_id)::int as assigned_count
     FROM venues v
     LEFT JOIN events e ON e.venue_id = v.id AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL '30 days'
     LEFT JOIN event_assignments ea ON ea.event_id = e.id
     WHERE COALESCE(v.is_active, true)
     GROUP BY v.id, v.name, v.venue_type
     ORDER BY upcoming DESC NULLS LAST, v.name
     LIMIT 12`
  ))

  // ── Field staff ────────────────────────────────────────────────
  const staffRoles = await safeRows<{ role: string; count: number }>(query(
    `SELECT role, COUNT(*)::int as count
     FROM staff
     WHERE COALESCE(is_active, true)
     GROUP BY role ORDER BY count DESC`
  ))

  // ── Ticket volume (rolling 30 days) ────────────────────────────
  const ticketsByPriority = await safeRows<{ priority: string; status: string; count: number }>(query(
    `SELECT COALESCE(priority,'unset') as priority, COALESCE(status,'open') as status, COUNT(*)::int as count
     FROM tickets
     WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY priority, status
     ORDER BY count DESC`
  ))
  const ticketHotspots = await safeRows<{ venue_name: string; cnt: number }>(query(
    `SELECT COALESCE(v.name, '(no venue)') as venue_name, COUNT(*)::int as cnt
     FROM tickets t
     LEFT JOIN venues v ON v.id = t.venue_id
     WHERE t.created_at >= CURRENT_DATE - INTERVAL '30 days'
       AND t.status NOT IN ('closed', 'resolved')
     GROUP BY v.name
     ORDER BY cnt DESC
     LIMIT 8`
  ))

  // ── Event schedule (next 7 days) ───────────────────────────────
  const upcomingEvents = await safeRows<{ event_date: string; venue_name: string; summary: string; assigned: number }>(query(
    `SELECT TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
            COALESCE(v.name,'(no venue)') as venue_name,
            e.summary,
            COUNT(ea.id)::int as assigned
     FROM events e
     LEFT JOIN venues v ON v.id = e.venue_id
     LEFT JOIN event_assignments ea ON ea.event_id = e.id
     WHERE COALESCE(e.approval_status, 'approved') = 'approved'
       AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL '7 days'
     GROUP BY e.id, v.name
     ORDER BY e.event_date, e.start_time NULLS LAST
     LIMIT 25`
  ))
  const eventCounts = await safeRows<{ horizon: string; cnt: number }>(query(
    `SELECT
       CASE
         WHEN event_date = CURRENT_DATE THEN 'today'
         WHEN event_date < CURRENT_DATE + INTERVAL '7 days' THEN 'next_7d'
         WHEN event_date < CURRENT_DATE + INTERVAL '30 days' THEN 'next_30d'
         ELSE 'beyond_30d'
       END as horizon,
       COUNT(*)::int as cnt
     FROM events
     WHERE COALESCE(approval_status, 'approved') = 'approved'
       AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + INTERVAL '90 days'
     GROUP BY 1`
  ))

  // ── Design pipeline (the Alexis / Daniel surface) ─────────────
  const designPipeline = await safeRows<{ status: string; cnt: number }>(query(
    `SELECT COALESCE(status,'unset') as status, COUNT(*)::int as cnt
     FROM design_requests
     WHERE status NOT IN ('done', 'cancelled')
     GROUP BY status
     ORDER BY cnt DESC`
  ))

  // ── Clients (teams / leagues we support) ──────────────────────
  const clientBreakdown = await safeRows<{ client_kind: string; cnt: number }>(query(
    `SELECT COALESCE(client_kind,'client') as client_kind, COUNT(*)::int as cnt
     FROM clients
     WHERE COALESCE(is_active, true)
     GROUP BY client_kind
     ORDER BY cnt DESC`
  ))

  // ── Contracted services per venue ─────────────────────────────
  const servicesEnabled = await safeRows<{ service_name: string; venue_count: number }>(query(
    `SELECT st.name as service_name, COUNT(DISTINCT cv.venue_id)::int as venue_count
     FROM service_types st
     JOIN client_services cs ON cs.service_type_id = st.id AND cs.enabled
     JOIN client_venues cv ON cv.client_id = cs.client_id
     GROUP BY st.name
     ORDER BY venue_count DESC`
  ))

  // ── Compose markdown ──────────────────────────────────────────
  const lines: string[] = []
  lines.push('# LIVE ANC OPERATIONAL CONTEXT')
  lines.push(`Generated ${new Date().toISOString()} from the live ANC Sports operational dashboard. Use these specific numbers when discussing ANC — never speak in generic terms or use placeholder values.`)
  lines.push('')

  lines.push('## About ANC Sports — the business you advise')
  lines.push('ANC Sports designs, installs, and supports LED video boards, ribbon boards, fascia displays, and scoreboards at sports venues (NBA arenas, MLB stadiums, college football, MiLB ballparks, soccer, and out-of-home / corporate sites) across the US. The company sells both one-time installations and ongoing service / event-support contracts. Field technicians visit venues, run game-night staffing, fix display issues, and produce custom graphic content. The advisor here is reading from ANCs internal operations system — the tool field teams, designers, and management use day-to-day.')
  lines.push('')

  lines.push('## Footprint')
  lines.push(`- **${v.active}** active venues across the network (${v.sports} sports, ${v.ooh} out-of-home, ${Number(v.total) - Number(v.active)} archived).`)
  lines.push(`- **${staffRoles.reduce((s, r) => s + Number(r.count), 0)}** active staff: ` + staffRoles.map((r) => `${r.count} ${r.role}`).join(', ') + '.')
  lines.push(`- **${clientBreakdown.reduce((s, c) => s + Number(c.cnt), 0)}** active clients (` + clientBreakdown.map((c) => `${c.cnt} ${c.client_kind}`).join(', ') + ').')
  lines.push('')

  if (topVenues.length > 0) {
    lines.push('## Top venues by 30-day event load')
    for (const row of topVenues) {
      lines.push(`- **${row.name}** (${row.venue_type}) — ${row.upcoming} upcoming events, ${row.assigned_count} staff assigned`)
    }
    lines.push('')
  }

  if (servicesEnabled.length > 0) {
    lines.push('## Contracted-service coverage (how many venues enable each)')
    for (const row of servicesEnabled) {
      lines.push(`- ${row.service_name}: **${row.venue_count}** venue${row.venue_count === 1 ? '' : 's'}`)
    }
    lines.push('')
  }

  if (eventCounts.length > 0) {
    lines.push('## Event schedule horizon')
    const horizonOrder: Record<string, number> = { today: 0, next_7d: 1, next_30d: 2, beyond_30d: 3 }
    eventCounts.sort((a, b) => (horizonOrder[a.horizon] ?? 9) - (horizonOrder[b.horizon] ?? 9))
    for (const row of eventCounts) {
      const label = row.horizon === 'today' ? 'Today' : row.horizon === 'next_7d' ? 'Next 7 days' : row.horizon === 'next_30d' ? 'Next 30 days' : 'Days 30-90'
      lines.push(`- ${label}: **${row.cnt}** events`)
    }
    lines.push('')
  }

  if (upcomingEvents.length > 0) {
    lines.push('## Next 7 days — game / event detail')
    for (const row of upcomingEvents) {
      lines.push(`- ${row.event_date} · ${row.venue_name} · ${row.summary?.slice(0, 100) || '(no summary)'} · ${row.assigned} staff assigned`)
    }
    lines.push('')
  }

  if (ticketsByPriority.length > 0) {
    lines.push('## Support tickets — last 30 days')
    for (const row of ticketsByPriority) {
      lines.push(`- ${row.priority} · ${row.status}: **${row.count}**`)
    }
    if (ticketHotspots.length > 0) {
      lines.push('')
      lines.push('### Open-ticket hotspots (venues with the most still-open tickets)')
      for (const row of ticketHotspots) {
        lines.push(`- ${row.venue_name}: ${row.cnt} open`)
      }
    }
    lines.push('')
  }

  if (designPipeline.length > 0) {
    lines.push('## Design-request pipeline (graphic content, internal + sales-support)')
    for (const row of designPipeline) {
      lines.push(`- ${row.status}: **${row.cnt}**`)
    }
    lines.push('')
  }

  lines.push('---')
  lines.push('When advising, talk about ANC — their venues, staff, ticket volume, event load, design pipeline. Use the specific names + counts above. For benchmark questions ("typical staffing ratios for venue ops", "industry rates for LED service contracts", "market rates for graphic designers"), use @agent web search and cite the sources. Never refer to ANC as "you" — the user is an ANC staff member asking about their company.')

  return lines.join('\n')
}
