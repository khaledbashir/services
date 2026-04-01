import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

interface Alert {
  level: 'urgent' | 'warning' | 'info' | 'good'
  icon: string
  message: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Parallel queries for all the data we need
    const [venueRes, eventsRes, ticketsRes, workflowRes, resolvedRes, recentActivityRes] = await Promise.all([
      query(
        `SELECT v.name, v.venue_manager_id, v.lead_field_rep_id, v.requires_assignment,
                sm.full_name as manager_name, sl.full_name as lead_rep_name
         FROM venues v
         LEFT JOIN staff sm ON v.venue_manager_id = sm.id
         LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
         WHERE v.id = $1`,
        [venueId]
      ),
      query(
        `SELECT e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
                e.start_time, e.workflow_status,
                COUNT(ea.id) as assigned_count,
                STRING_AGG(s.full_name, ', ') as assigned_names
         FROM events e
         LEFT JOIN event_assignments ea ON e.id = ea.event_id
         LEFT JOIN staff s ON ea.staff_id = s.id
         WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $2::date + INTERVAL '14 days'
         GROUP BY e.id, e.summary, e.event_date, e.start_time, e.workflow_status
         ORDER BY e.start_time`,
        [venueId, today]
      ),
      query(
        `SELECT id, title, status, priority, category, created_at
         FROM tickets
         WHERE venue_id = $1 AND status IN ('new', 'on_hold', 'in_progress', 'escalated')
         ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
        [venueId]
      ),
      query(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed
         FROM events
         WHERE venue_id = $1 AND event_date >= $2::date - INTERVAL '30 days' AND event_date < $2`,
        [venueId, today]
      ),
      query(
        `SELECT COUNT(*) as count FROM tickets
         WHERE venue_id = $1 AND status = 'closed' AND resolved_at >= $2::date - INTERVAL '7 days'`,
        [venueId, today]
      ),
      // Recent activity for AI context (safe — may not exist)
      query(
        `SELECT action, details, created_at FROM activity_log
         WHERE entity_id IN (SELECT id FROM tickets WHERE venue_id = $1)
         ORDER BY created_at DESC LIMIT 5`,
        [venueId]
      ).catch(() => ({ rows: [] })),
    ])

    const venue = venueRes.rows[0]
    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const events = eventsRes.rows
    const openTickets = ticketsRes.rows
    const workflowData = workflowRes.rows[0] || { total: 0, completed: 0 }
    const resolvedThisWeek = parseInt(resolvedRes.rows[0]?.count || '0')
    const recentActivity = recentActivityRes.rows

    // Compute stats
    const totalEvents = events.length
    const unassignedEvents = events.filter((e: any) => parseInt(e.assigned_count) === 0)
    const assignedEvents = totalEvents - unassignedEvents.length
    const coverageRate = totalEvents > 0 ? Math.round((assignedEvents / totalEvents) * 100) : null
    const workflowTotal = parseInt(workflowData.total) || 0
    const workflowCompleted = parseInt(workflowData.completed) || 0
    const workflowRate = workflowTotal > 0 ? Math.round((workflowCompleted / workflowTotal) * 100) : null

    // Build deterministic alerts (always fast, always works)
    const alerts: Alert[] = []

    if (unassignedEvents.length > 0 && venue.requires_assignment) {
      const next = unassignedEvents[0]
      const daysUntil = Math.ceil((new Date(next.event_date).getTime() - now.getTime()) / 86400000)
      alerts.push({
        level: daysUntil <= 2 ? 'urgent' : 'warning',
        icon: daysUntil <= 2 ? '🔴' : '⚠️',
        message: daysUntil <= 2
          ? `${unassignedEvents.length} event${unassignedEvents.length > 1 ? 's' : ''} with no staff. Next: ${daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'tomorrow' : `${daysUntil} days`} (${next.summary}).`
          : `${unassignedEvents.length} of ${totalEvents} upcoming events need staff.`,
      })
    }

    if (!venue.venue_manager_id && venue.requires_assignment) {
      alerts.push({ level: 'warning', icon: '⚠️', message: 'No venue manager assigned — coverage coordination at risk.' })
    }

    if (openTickets.length > 0) {
      const critCount = openTickets.filter((t: any) => t.priority === 'critical' || t.priority === 'high').length
      const daysOld = Math.ceil((now.getTime() - new Date(openTickets[0].created_at).getTime()) / 86400000)
      alerts.push({
        level: critCount > 0 ? 'urgent' : 'warning',
        icon: critCount > 0 ? '🔴' : '📋',
        message: critCount > 0
          ? `${critCount} high/critical ticket${critCount > 1 ? 's' : ''} open. ${openTickets.length} total.`
          : `${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''} (${resolvedThisWeek} resolved this week). Oldest: ${daysOld}d.`,
      })
    }

    const overdue = events.filter((e: any) => new Date(e.event_date) < now && e.workflow_status !== 'post_game_submitted' && parseInt(e.assigned_count) > 0)
    if (overdue.length > 0) {
      alerts.push({ level: 'warning', icon: '📝', message: `${overdue.length} past event${overdue.length > 1 ? 's' : ''} missing post-game reports.` })
    }

    if (alerts.length === 0) {
      alerts.push({
        level: 'good', icon: '✅',
        message: totalEvents > 0
          ? `All ${totalEvents} events staffed. ${openTickets.length === 0 ? 'No open tickets. ' : ''}Looking good.`
          : 'No upcoming events in the next 14 days. All clear.',
      })
    }

    // --- AI ANALYSIS ---
    // Feed the structured data to AI for a natural-language executive briefing
    let aiSummary = ''
    let aiRecommendation = ''

    if (AI_API_KEY) {
      try {
        const dataContext = {
          venue_name: venue.name,
          manager: venue.manager_name || 'NOT ASSIGNED',
          lead_rep: venue.lead_rep_name || 'NOT ASSIGNED',
          requires_assignment: venue.requires_assignment,
          upcoming_events: events.map((e: any) => ({
            name: e.summary,
            date: e.event_date,
            assigned: parseInt(e.assigned_count),
            staff: e.assigned_names || 'none',
            workflow: e.workflow_status,
          })),
          open_tickets: openTickets.map((t: any) => ({
            title: t.title,
            priority: t.priority,
            category: t.category,
            status: t.status,
            age_days: Math.ceil((now.getTime() - new Date(t.created_at).getTime()) / 86400000),
          })),
          stats: {
            coverage_rate: coverageRate,
            workflow_completion_rate: workflowRate,
            resolved_tickets_this_week: resolvedThisWeek,
          },
          recent_activity: recentActivity.map((a: any) => ({ action: a.action, details: a.details })),
          today: today,
        }

        const aiRes = await fetch(`${AI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
          body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: 500,
            temperature: 0.7,
            messages: [
              {
                role: 'system',
                content: `You are the AI operations analyst for ANC Sports' Service Dashboard. You write concise venue briefings for field operations managers.

Your tone: direct, professional, slightly urgent when needed. Like a chief of staff briefing a COO. No fluff. No greetings. No "Here's your briefing" — just the insight.

Output EXACTLY this JSON format, nothing else:
{
  "summary": "2-3 sentence executive summary of this venue's situation right now. Be specific — use names, dates, numbers. If things are bad, say so directly. If things are good, acknowledge it briefly.",
  "recommendation": "One specific, actionable next step. Start with a verb. Be concrete — 'Assign Nick or Chris to the Apr 3 Celtics game' not 'Consider staffing upcoming events'."
}`
              },
              {
                role: 'user',
                content: `Generate a venue briefing for today (${today}):\n\n${JSON.stringify(dataContext, null, 2)}`
              }
            ],
          }),
        })

        if (aiRes.ok) {
          const aiData = await aiRes.json()
          const content = aiData.choices?.[0]?.message?.content || ''
          try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = content.match(/\{[\s\S]*\}/)
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0])
              aiSummary = parsed.summary || ''
              aiRecommendation = parsed.recommendation || ''
            }
          } catch {
            // AI returned non-JSON, use as raw summary
            aiSummary = content.slice(0, 300)
          }
        }
      } catch (err) {
        console.error('AI briefing failed (using fallback):', err)
        // Fallback to deterministic — no problem
      }
    }

    // Fallback recommendation if AI didn't provide one
    if (!aiRecommendation) {
      if (unassignedEvents.length > 0) {
        aiRecommendation = `Assign staff to the ${unassignedEvents.length} unassigned event${unassignedEvents.length > 1 ? 's' : ''}.`
      } else if (!venue.venue_manager_id && venue.requires_assignment) {
        aiRecommendation = 'Assign a venue manager to improve coverage coordination.'
      } else if (openTickets.some((t: any) => t.priority === 'critical')) {
        aiRecommendation = 'Address the critical tickets before they impact operations.'
      }
    }

    return NextResponse.json({
      alerts,
      ai_summary: aiSummary || null,
      stats: {
        coverage_rate: coverageRate,
        workflow_rate: workflowRate,
        upcoming_events: totalEvents,
        unassigned_events: unassignedEvents.length,
        open_tickets: openTickets.length,
        resolved_this_week: resolvedThisWeek,
      },
      recommendation: aiRecommendation,
      generated_at: now.toISOString(),
    })
  } catch (err: any) {
    console.error('Error generating venue briefing:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
