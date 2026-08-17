import { query } from '@/lib/db'
import { deleteSlackMessage } from '@/lib/slack'

let reminderTrackingReady = false

export async function ensureWorkflowReminderTracking() {
  if (reminderTrackingReady) return

  await query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS post_game_reminder_channel TEXT`)
  await query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS post_game_reminder_ts TEXT`)
  reminderTrackingReady = true
}

export async function recordPostGameReminder(
  assignmentId: string,
  channel: string,
  ts: string,
) {
  await ensureWorkflowReminderTracking()
  await query(
    `UPDATE event_assignments
     SET post_game_reminder_channel = $2,
         post_game_reminder_ts = $3,
         last_post_game_reminder_at = NOW()
     WHERE id = $1`,
    [assignmentId, channel, ts],
  )
}

/**
 * Take down the Slack reminders a post-game submission has answered.
 *
 * On an event set to "one report", the submission answers for the whole crew,
 * so every reminder on the event comes down. On "everyone submits", it only
 * answers for the person who submitted — the rest still owe a report and must
 * keep their reminder (Charlie 2026-08-17). Pass the submitting staff id so the
 * right rows are chosen.
 */
export async function clearPostGameReminderMessages(eventId: string, submittedByStaffId?: string) {
  await ensureWorkflowReminderTracking()

  const modeResult = await query(
    `SELECT COALESCE(e.post_game_report_mode, v.post_game_report_mode, 'one') AS mode
     FROM events e LEFT JOIN venues v ON v.id = e.venue_id
     WHERE e.id = $1`,
    [eventId],
  )
  const perPerson = modeResult.rows[0]?.mode === 'everyone' && Boolean(submittedByStaffId)

  const scope = perPerson ? ' AND staff_id = $2' : ''
  const params = perPerson ? [eventId, submittedByStaffId] : [eventId]

  const reminders = await query(
    `SELECT DISTINCT post_game_reminder_channel, post_game_reminder_ts
     FROM event_assignments
     WHERE event_id = $1
       AND post_game_reminder_channel IS NOT NULL
       AND post_game_reminder_ts IS NOT NULL${scope}`,
    params,
  )

  await Promise.all(
    reminders.rows.map((row: any) =>
      deleteSlackMessage(row.post_game_reminder_channel, row.post_game_reminder_ts),
    ),
  )

  await query(
    `UPDATE event_assignments
     SET post_game_reminder_channel = NULL,
         post_game_reminder_ts = NULL
     WHERE event_id = $1${scope}`,
    params,
  )
}
