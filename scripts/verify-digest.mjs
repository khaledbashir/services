import pg from 'pg'
const { Pool } = pg
const pool = new Pool({ host: '10.11.0.11', port: 5432, user: 'ancservices', password: 'AncSvc2026SecureDB', database: 'anc_services' })

const r = await pool.query(`
  SELECT e.id, e.summary, e.workflow_status,
         CASE WHEN TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
              THEN 'TBD' ELSE TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END as start_et,
         CASE WHEN TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
              THEN 'TBD' ELSE TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END as end_et,
         v.name as venue_name,
         COALESCE(v.requires_assignment, true) as venue_requires_assignment,
         e.requires_staffing as event_requires_staffing,
         COALESCE(string_agg(DISTINCT s.full_name, ', ') FILTER (WHERE s.full_name IS NOT NULL), '') as techs,
         COUNT(DISTINCT ea.staff_id) FILTER (WHERE ea.staff_id IS NOT NULL) as assigned_count
  FROM events e
  LEFT JOIN venues v ON v.id = e.venue_id
  LEFT JOIN event_assignments ea ON ea.event_id = e.id
  LEFT JOIN staff s ON s.id = ea.staff_id
  WHERE e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date
  GROUP BY e.id, v.name, v.requires_assignment
  ORDER BY e.start_time ASC
`)
const events = r.rows
const needsStaffing = (e) => e.event_requires_staffing === true ? true : e.event_requires_staffing === false ? false : e.venue_requires_assignment !== false
const needsList = events.filter(needsStaffing)
const warrantyCount = events.length - needsList.length
const assignedCount = needsList.filter(e => Number(e.assigned_count || 0) > 0).length
const unassignedCount = needsList.length - assignedCount

const morningBucket = (e) => {
  const n = needsStaffing(e)
  const a = Number(e.assigned_count || 0) > 0
  if (n && !a) return 0
  if (n && a) return 1
  return 2
}
const toMin = (v) => {
  if (!v || v === 'TBD') return Number.MAX_SAFE_INTEGER
  const m = String(v).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!m) return Number.MAX_SAFE_INTEGER
  let h = parseInt(m[1],10) % 12
  if (m[3].toUpperCase() === 'PM') h += 12
  return h*60 + parseInt(m[2],10)
}
const sorted = [...events].sort((a,b) => {
  const ab = morningBucket(a), bb = morningBucket(b)
  if (ab !== bb) return ab - bb
  return toMin(a.start_et) - toMin(b.start_et)
})

const pills = [
  unassignedCount > 0
    ? `:red_circle: *${unassignedCount} unassigned*`
    : needsList.length > 0 ? ':white_check_mark: *all staffed*' : ':white_check_mark: *no staffing required*',
  `:busts_in_silhouette: ${assignedCount} staffed`,
  ...(warrantyCount > 0 ? [`:shield: ${warrantyCount} warranty-only`] : []),
]

console.log(`HEADER: :sunrise: *ANC Events — Today (${events.length})*`)
console.log(`PILLS:  ${pills.join('  ·  ')}`)
console.log(`---`)
for (const e of sorted) {
  const needs = needsStaffing(e)
  const assigned = Number(e.assigned_count || 0)
  const tag = (needs && assigned === 0) ? '🔴 unassigned' : (needs && assigned > 0) ? `${assigned} staffed (${e.techs})` : '🛡 warranty'
  const time = `${e.start_et}${e.end_et ? `→${e.end_et}` : ''}`
  console.log(`• ${time} — ${e.summary} @ ${e.venue_name || 'venue tbd'} :: ${tag}`)
}
await pool.end()
