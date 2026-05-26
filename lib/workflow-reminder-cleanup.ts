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

export async function clearPostGameReminderMessages(eventId: string) {
  await ensureWorkflowReminderTracking()

  const reminders = await query(
    `SELECT DISTINCT post_game_reminder_channel, post_game_reminder_ts
     FROM event_assignments
     WHERE event_id = $1
       AND post_game_reminder_channel IS NOT NULL
       AND post_game_reminder_ts IS NOT NULL`,
    [eventId],
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
     WHERE event_id = $1`,
    [eventId],
  )
}
