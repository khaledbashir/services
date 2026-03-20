import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    // Workflow activity
    const workflowResult = await query(
      `SELECT 
        'workflow' as source,
        ws.type, 
        ws.submitted_at as created_at,
        s.full_name as staff_name,
        e.summary as entity_name,
        v.name as venue_name
      FROM workflow_submissions ws
      JOIN staff s ON ws.staff_id = s.id
      JOIN events e ON ws.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      ORDER BY ws.submitted_at DESC
      LIMIT 15`
    )

    // Ticket creation
    const ticketResult = await query(
      `SELECT 
        'ticket' as source,
        'ticket_created' as type,
        t.created_at,
        s.full_name as staff_name,
        t.title as entity_name,
        v.name as venue_name
      FROM tickets t
      JOIN staff s ON t.created_by = s.id
      LEFT JOIN venues v ON t.venue_id = v.id
      ORDER BY t.created_at DESC
      LIMIT 10`
    )

    // Ticket comments
    const commentResult = await query(
      `SELECT 
        'comment' as source,
        CASE WHEN tc.is_internal THEN 'internal_comment' ELSE 'external_comment' END as type,
        tc.created_at,
        s.full_name as staff_name,
        t.title as entity_name,
        v.name as venue_name
      FROM ticket_comments tc
      JOIN staff s ON tc.author_id = s.id
      JOIN tickets t ON tc.ticket_id = t.id
      LEFT JOIN venues v ON t.venue_id = v.id
      ORDER BY tc.created_at DESC
      LIMIT 10`
    )

    // Activity log (status changes, assignments, etc.)
    const logResult = await query(
      `SELECT 
        'log' as source,
        al.action as type,
        al.created_at,
        s.full_name as staff_name,
        al.details->>'entity_name' as entity_name,
        al.details->>'venue_name' as venue_name
      FROM activity_log al
      LEFT JOIN staff s ON al.staff_id = s.id
      ORDER BY al.created_at DESC
      LIMIT 10`
    )

    // Merge all, sort, take top 15
    const all = [
      ...workflowResult.rows,
      ...ticketResult.rows,
      ...commentResult.rows,
      ...logResult.rows,
    ]
    const sorted = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15)

    const typeMap: Record<string, string> = {
      'check_in': 'checked in at',
      'game_ready': 'confirmed game ready at',
      'post_game_report': 'submitted post-game report for',
      'ticket_created': 'created ticket',
      'internal_comment': 'added internal comment on',
      'external_comment': 'added comment on',
      'ticket_status_change': 'changed ticket status on',
      'ticket_assigned': 'assigned ticket',
      'tech_assigned': 'was assigned to',
      'tech_removed': 'was removed from',
    }

    const activity = sorted.map(item => {
      // Ensure created_at is a proper ISO string
      const createdAtDate = new Date(item.created_at)
      const isoTimestamp = createdAtDate.toISOString()
      
      return {
        ...item,
        created_at: isoTimestamp,
        type_display: typeMap[item.type] || item.type,
      }
    })

    return NextResponse.json(activity)
  } catch (err) {
    console.error('Error fetching activity:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
