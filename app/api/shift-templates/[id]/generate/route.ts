import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { combineLocalToUtc } from '@/lib/timezone'

// Map recurrence patterns to day-of-week arrays (0=Sunday, 6=Saturday)
function getRecurrenceDays(recurrence: string, customDays: number[]): number[] {
  switch (recurrence) {
    case 'daily': return [0, 1, 2, 3, 4, 5, 6]
    case 'weekdays': return [1, 2, 3, 4, 5]
    case 'weekends': return [0, 6]
    case 'mwf': return [1, 3, 5]
    case 'tth': return [2, 4]
    case 'custom': return customDays || []
    default: return [1, 2, 3, 4, 5]
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { start_date, end_date, preview, staff_ids } = await request.json()

    if (!start_date || !end_date) {
      return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
    }

    // Fetch template
    const templateResult = await query(
      `SELECT st.*, v.name as venue_name
       FROM shift_templates st
       JOIN venues v ON st.venue_id = v.id
       WHERE st.id = $1`,
      [params.id]
    )

    if (templateResult.rows.length === 0) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const template = templateResult.rows[0]
    const activeDays = getRecurrenceDays(template.recurrence, template.custom_days)

    const venueTzRes = await query(`SELECT timezone FROM venues WHERE id = $1`, [template.venue_id])
    const venueTimezone = venueTzRes.rows[0]?.timezone || 'America/New_York'

    // Generate dates
    const shifts: Array<{
      date: string
      day_name: string
      start_time: string
      end_time: string
      venue_name: string
      exists: boolean
    }> = []

    const start = new Date(start_date + 'T00:00:00')
    const end = new Date(end_date + 'T00:00:00')

    // Check existing events to avoid duplicates
    const existingResult = await query(
      `SELECT event_date, start_time::time as st FROM events
       WHERE venue_id = $1 AND event_type = 'shift'
         AND COALESCE(approval_status, 'approved') = 'approved'
         AND event_date >= $2 AND event_date <= $3
         AND summary = $4`,
      [template.venue_id, start_date, end_date, template.name]
    )
    const existingDates = new Set(existingResult.rows.map((r: any) => r.event_date.toISOString().split('T')[0]))

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dayOfWeek = d.getDay()
      if (!activeDays.includes(dayOfWeek)) continue

      const dateStr = d.toISOString().split('T')[0]
      shifts.push({
        date: dateStr,
        day_name: dayNames[dayOfWeek],
        start_time: template.start_time,
        end_time: template.end_time,
        venue_name: template.venue_name,
        exists: existingDates.has(dateStr),
      })
    }

    // Preview mode
    if (preview) {
      return NextResponse.json({
        preview: true,
        template_name: template.name,
        venue_name: template.venue_name,
        shifts,
        new_count: shifts.filter(s => !s.exists).length,
        existing_count: shifts.filter(s => s.exists).length,
      })
    }

    // Generate actual events
    let created = 0
    let skipped = 0

    for (const shift of shifts) {
      if (shift.exists) {
        skipped++
        continue
      }

      const startTimestamp = combineLocalToUtc(shift.date, template.start_time, venueTimezone)
        ?? new Date(`${shift.date}T00:00:00Z`)
      const endTimestamp = combineLocalToUtc(shift.date, template.end_time, venueTimezone)
        ?? new Date(startTimestamp.getTime() + 3 * 3600_000)

      const eventResult = await query(
        `INSERT INTO events (summary, event_date, start_time, end_time, venue_id, workflow_status, event_type)
         VALUES ($1, $2, $3, $4, $5, 'pending', 'shift')
         RETURNING id`,
        [template.name, shift.date, startTimestamp, endTimestamp, template.venue_id]
      )

      const eventId = eventResult.rows[0].id

      // Auto-assign staff if provided
      if (staff_ids && staff_ids.length > 0) {
        // Get league estimated hours (default 4 for shifts)
        const hours = Math.abs(
          (new Date(`2000-01-01T${template.end_time}`).getTime() - new Date(`2000-01-01T${template.start_time}`).getTime()) / 3600000
        )

        for (const staffId of staff_ids.slice(0, template.required_staff)) {
          await query(
            `INSERT INTO event_assignments (event_id, staff_id, estimated_hours, role_at_event)
             VALUES ($1, $2, $3, 'technician')
             ON CONFLICT (event_id, staff_id) DO NOTHING`,
            [eventId, staffId, hours]
          )
        }
      }

      created++
    }

    return NextResponse.json({
      created,
      skipped,
      template_name: template.name,
      venue_name: template.venue_name,
    })
  } catch (err) {
    console.error('Error generating shifts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
