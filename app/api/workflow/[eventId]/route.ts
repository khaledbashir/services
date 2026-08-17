export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { appendFile } from 'fs/promises'
import { resolve } from 'path'
import { getAuthUser } from '@/lib/rbac'
import { syncEventsToTwenty } from '@/lib/twenty-sync'
import { awardPointsOnce } from '@/lib/gamification'
import { clearPostGameReminderMessages } from '@/lib/workflow-reminder-cleanup'
import { notifyLeadsOfWorkflowStep, type WorkflowStepType } from '@/lib/workflow-lead-notifications'

const workflowLabels: Record<string, { label: string; emoji: string }> = {
  check_in: { label: 'Check-in', emoji: ':white_check_mark:' },
  game_ready: { label: 'Game Ready', emoji: ':stadium:' },
  post_game_report: { label: 'Post-Game Report', emoji: ':clipboard:' },
}

const POST_GAME_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

function getPostGameWindow(endTime?: string | null, startTime?: string | null) {
  const baseTime = endTime || startTime || null
  if (!baseTime) {
    return {
      editable: true,
      editWindowEndsAt: null as string | null,
    }
  }

  const baseDate = new Date(baseTime)
  if (Number.isNaN(baseDate.getTime())) {
    return {
      editable: true,
      editWindowEndsAt: null as string | null,
    }
  }

  const editWindowEndsAt = new Date(baseDate.getTime() + POST_GAME_EDIT_WINDOW_MS)
  return {
    editable: Date.now() <= editWindowEndsAt.getTime(),
    editWindowEndsAt: editWindowEndsAt.toISOString(),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const eventId = params.eventId
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get event details
    const eventResult = await query(
      `SELECT
        e.id,
        e.summary,
        e.venue_id,
        v.name as venue_name,
        e.league,
        e.start_time,
        e.end_time,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      WHERE e.id = $1`,
      [eventId]
    )

    if (eventResult.rows.length === 0) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (user.role === 'technician') {
      const accessResult = await query(
        `SELECT 1
         FROM event_assignments
         WHERE event_id = $1 AND staff_id = $2
         LIMIT 1`,
        [eventId, user.userId]
      )
      if (accessResult.rows.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Get assigned technicians
    const techsResult = await query(
      `SELECT DISTINCT s.id, s.full_name
       FROM staff s
       JOIN event_assignments ea ON s.id = ea.staff_id
       WHERE ea.event_id = $1`,
      [eventId]
    )

    // Get all active staff as fallback
    const allStaffResult = user.role === 'technician'
      ? { rows: techsResult.rows.filter((row: any) => row.id === user.userId) }
      : await query(`SELECT id, full_name FROM staff WHERE is_active = true ORDER BY full_name`)

    // Get workflow submissions and map DB types to frontend types
    const workflowResult = await query(
      `SELECT type, submitted_at, staff_id, data
       FROM workflow_submissions
       WHERE event_id = $1
       ORDER BY submitted_at DESC`,
      [eventId]
    )

    // Transform to expected format with frontend type names
    const workflow = {
      checked_in: null as string | null,
      game_ready: null as string | null,
      post_game_submitted: null as string | null,
    }
    let latestPostGameData: Record<string, any> | null = null

    for (const row of workflowResult.rows) {
      // Map DB types back to frontend types
      if (row.type === 'check_in') workflow.checked_in = row.submitted_at
      else if (row.type === 'game_ready') workflow.game_ready = row.submitted_at
      else if (row.type === 'post_game_report') {
        workflow.post_game_submitted = row.submitted_at
        if (!latestPostGameData) {
          latestPostGameData = row.data || {}
        }
      }
    }

    const postGameWindow = getPostGameWindow(
      eventResult.rows[0]?.end_time,
      eventResult.rows[0]?.start_time
    )

    return NextResponse.json({
      event: eventResult.rows[0],
      assignedTechs: techsResult.rows,
      allStaff: allStaffResult.rows,
      workflow,
      latestPostGameData,
      postGameEditable: postGameWindow.editable,
      postGameEditWindowEndsAt: postGameWindow.editWindowEndsAt,
      viewer: {
        userId: user.userId,
        role: user.role,
      },
    })
  } catch (err) {
    console.error('Error fetching workflow:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const eventId = params.eventId
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { staffId, type, data } = await request.json()
    const effectiveStaffId = user.role === 'technician' ? user.userId : staffId

    if (!effectiveStaffId) {
      return NextResponse.json({ error: 'Technician is required' }, { status: 400 })
    }

    if (user.role === 'technician') {
      const accessResult = await query(
        `SELECT 1
         FROM event_assignments
         WHERE event_id = $1 AND staff_id = $2
         LIMIT 1`,
        [eventId, user.userId]
      )
      if (accessResult.rows.length === 0) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Map frontend type names to database type names
    const typeMap: Record<string, string> = {
      'checked_in': 'check_in',
      'game_ready': 'game_ready',
      'post_game_submitted': 'post_game_report',
    }

    const submissionType = typeMap[type]
    if (!submissionType) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    if (submissionType === 'post_game_report') {
      const eventTimingResult = await query(
        `SELECT start_time, end_time
         FROM events
         WHERE id = $1`,
        [eventId]
      )

      const postGameWindow = getPostGameWindow(
        eventTimingResult.rows[0]?.end_time,
        eventTimingResult.rows[0]?.start_time
      )

      if (!postGameWindow.editable) {
        return NextResponse.json(
          {
            error: 'Post-game reports can only be edited for 24 hours after the event ends',
            editWindowEndsAt: postGameWindow.editWindowEndsAt,
          },
          { status: 403 }
        )
      }
    }

    // Insert workflow submission with ON CONFLICT DO UPDATE to handle resubmissions
    await query(
      `INSERT INTO workflow_submissions (event_id, staff_id, type, data, submitted_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (event_id, staff_id, type) DO UPDATE 
       SET data = EXCLUDED.data, submitted_at = NOW()`,
      [eventId, effectiveStaffId, submissionType, data ? JSON.stringify(data) : '{}']
    )

    // Get all workflow submissions for event
    const workflowResult = await query(
      `SELECT type, submitted_at
       FROM workflow_submissions
       WHERE event_id = $1
       ORDER BY submitted_at DESC`,
      [eventId]
    )

    // Transform to expected format with frontend type names
    const workflow = {
      checked_in: null as string | null,
      game_ready: null as string | null,
      post_game_submitted: null as string | null,
    }

    for (const row of workflowResult.rows) {
      // Map DB types back to frontend types
      if (row.type === 'check_in') workflow.checked_in = row.submitted_at
      else if (row.type === 'game_ready') workflow.game_ready = row.submitted_at
      else if (row.type === 'post_game_report') workflow.post_game_submitted = row.submitted_at
    }

    // Determine new event status (using frontend type names)
    let eventStatus = 'pending'
    if (workflow.post_game_submitted) eventStatus = 'post_game_submitted'
    else if (workflow.game_ready) eventStatus = 'game_ready'
    else if (workflow.checked_in) eventStatus = 'checked_in'

    // Update event workflow status (use frontend type names)
    await query(
      'UPDATE events SET workflow_status = $1 WHERE id = $2',
      [eventStatus, eventId]
    )

    if (submissionType === 'post_game_report') {
      clearPostGameReminderMessages(eventId).catch((cleanupErr) => {
        console.error('[workflow] failed to clear post-game Slack reminders:', cleanupErr)
      })
    }

    // --- CRM SYNC: push workflow status change to Twenty ---
    ;(async () => {
      try {
        const syncEvent = await query(
          `SELECT e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
                  e.league, e.workflow_status, e.start_time,
                  v.name as venue_name, e.venue_id,
                  COALESCE(string_agg(s.full_name, ', '), '') as assigned_techs
           FROM events e
           LEFT JOIN venues v ON e.venue_id = v.id
           LEFT JOIN event_assignments ea ON ea.event_id = e.id
           LEFT JOIN staff s ON ea.staff_id = s.id
           WHERE e.id = $1
           GROUP BY e.id, v.name`,
          [eventId]
        )
        if (syncEvent.rows[0]) {
          const se = syncEvent.rows[0]
          await syncEventsToTwenty([{
            id: se.id,
            name: se.summary,
            event_date: se.event_date,
            venue_name: se.venue_name || '',
            venue_id: se.venue_id,
            league: se.league || '',
            workflow_status: se.workflow_status,
            assigned_techs: se.assigned_techs || '',
            summary: se.summary,
            start_time: se.start_time || '',
          }])
        }
      } catch (crmErr) {
        console.error('[twenty] workflow event sync error:', crmErr)
      }
    })()

    // Get staff and event names for notification log
    const staffResult = await query('SELECT full_name FROM staff WHERE id = $1', [effectiveStaffId])
    const eventResult = await query('SELECT summary, venue_id FROM events WHERE id = $1', [eventId])
    const venueResult = await query('SELECT name FROM venues WHERE id = $1', [eventResult.rows[0]?.venue_id])

    const staffName = staffResult.rows[0]?.full_name || 'Unknown'
    const eventName = eventResult.rows[0]?.summary || 'Unknown Event'
    const venueName = venueResult.rows[0]?.name || 'Unknown Venue'
    const dbType = submissionType
    const timestamp = new Date().toISOString()

    // Write to notification log for OpenClaw cron
    try {
      await appendFile(
        '/tmp/anc-workflow-notifications.log',
        `WORKFLOW|${dbType}|${staffName}|${eventName}|${venueName}|${timestamp}\n`
      )
    } catch (logErr) {
      console.error('Failed to write notification log:', logErr)
    }

    // Gamification: award points once for each real workflow milestone.
    // The workflow form uses UPSERT, so resubmissions must not farm points.
    if (staffName !== 'Unknown') {
      const actionMap: Record<string, string> = { check_in: 'CHECKIN_ON_TIME', game_ready: 'GAME_READY', post_game_report: 'POST_GAME_REPORT' }
      const gamAction = actionMap[submissionType]
      if (gamAction) {
        awardPointsOnce(effectiveStaffId, staffName, gamAction, `workflow:${eventId}:${submissionType}`, { event_id: eventId, event_name: eventName }).catch(() => {})
        if (workflow.checked_in && workflow.game_ready && workflow.post_game_submitted) {
          awardPointsOnce(effectiveStaffId, staffName, 'FULL_WORKFLOW', `workflow:${eventId}:full`, { event_id: eventId, event_name: eventName }).catch(() => {})
        }
      }
    }

    // Slack notification for workflow step.
    //
    // Joe's 2026-04-29 follow-up split the rule asymmetrically:
    //   - check_in + game_ready: silent on success, only the tech-reminders
    //     cron pings if the step is missed. Re-enabled via the
    //     workflow-success-pings toggle if Chris's local-team pulse view is
    //     needed again.
    //   - post_game_report: ALWAYS pings on submit (and the cron also pings
    //     if it isn't done). Joe wants the post-game stream visible
    //     regardless of the toggle, so we bypass it for this type only.
    const successPingsRes = await query(
      `SELECT enabled FROM automation_jobs WHERE id = 'workflow-success-pings'`
    )
    const successPingsEnabled = successPingsRes.rows[0]?.enabled === true
    const venueSlackRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [eventResult.rows[0]?.venue_id])
    const fallbackVenueChannel = venueSlackRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    const fallbackAuditChannel = process.env.SLACK_WORKFLOW_AUDIT_CHANNEL || ''
    const isAlwaysOnSuccess = dbType === 'post_game_report'
    const venueChannel = isAlwaysOnSuccess || successPingsEnabled ? fallbackVenueChannel : ''
    const auditChannel = isAlwaysOnSuccess || successPingsEnabled ? fallbackAuditChannel : ''

    const POST_TO_VENUE_CHANNEL: Record<string, boolean> = {
      check_in: true,
      game_ready: true,
      post_game_report: true,
    }

    // Joe 2026-08-17: the venue's manager and lead rep hear about every
    // completed step directly, independent of the channel-level toggle above.
    // Fire-and-forget — a Slack outage must never fail a technician's submit.
    notifyLeadsOfWorkflowStep({
      eventId,
      venueId: eventResult.rows[0]?.venue_id || null,
      step: dbType as WorkflowStepType,
      staffName,
      eventName,
      venueName,
      incidentText: dbType === 'post_game_report' ? String(data?.incidents ?? '') : undefined,
    }).catch((notifyErr) => {
      console.error('[workflow] failed to notify venue leads:', notifyErr)
    })

    const wf = workflowLabels[dbType] || { label: dbType, emoji: ':gear:' }
    const allDone = workflow.checked_in && workflow.game_ready && workflow.post_game_submitted
    const dashboardUrl = `https://abc-anc-services.izcgmb.easypanel.host/workflow/${eventId}`

    // Post-game submissions: surface whether an incident was flagged so ops
    // can glance at the Slack feed and know if anything needs a follow-up.
    // Joe's 2026-04-23 ask: "Incident Reported - Yes 🚨 / No ✅".
    const incidentsRaw = dbType === 'post_game_report' ? String(data?.incidents ?? '').trim() : ''
    const hasIncident = incidentsRaw.length > 0 && incidentsRaw.toLowerCase() !== 'none' && incidentsRaw.toLowerCase() !== 'n/a'
    const incidentExcerpt = incidentsRaw.length > 240 ? `${incidentsRaw.slice(0, 240)}…` : incidentsRaw

    const buildBlocks = () => {
      const b: any[] = [
        { type: 'section', text: { type: 'mrkdwn', text: `${wf.emoji} *Workflow: ${wf.label} completed*\n*${eventName}* @ ${venueName}\nBy: ${staffName}\n\n<${dashboardUrl}|View Workflow>` } },
      ]
      if (dbType === 'post_game_report') {
        b.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: hasIncident
              ? `:rotating_light: *Incident Reported — Yes*\n>${incidentExcerpt.replace(/\n/g, '\n>')}`
              : ':white_check_mark: *Incident Reported — No*',
          },
        })
      }
      if (allDone) {
        b.push({ type: 'section', text: { type: 'mrkdwn', text: ':tada: *All workflow steps complete for this event*' } })
      }
      b.push({ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View Workflow' }, url: dashboardUrl, style: 'primary' }] })
      return b
    }

    if (venueChannel && POST_TO_VENUE_CHANNEL[dbType]) {
      sendSlackMessage({
        channel: venueChannel,
        text: `${wf.emoji} ${wf.label} completed: ${eventName} @ ${venueName} by ${staffName}`,
        blocks: buildBlocks(),
      })
    }
    // Audit channel always gets the ping (if configured + distinct from the venue channel).
    if (auditChannel && auditChannel !== venueChannel) {
      sendSlackMessage({
        channel: auditChannel,
        text: `${wf.emoji} ${wf.label} completed: ${eventName} @ ${venueName} by ${staffName}`,
        blocks: buildBlocks(),
      })
    }

    return NextResponse.json({
      workflow,
    })
  } catch (err) {
    console.error('Error updating workflow:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
