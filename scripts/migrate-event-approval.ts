/**
 * Event approval model — Joe 2026-08-17.
 *
 * "The Master schedule should only pull home sporting events for teams at our
 *  venues. No other events automatically added. Additional events can be
 *  suggested to the assigned venue lead and if approved can be added to the
 *  master schedule. If they are not approved or are rejected, they do not pull
 *  into the master schedule."
 *
 * Modelled as one lifecycle column rather than a second events table, because
 * a suggestion IS an event — it just hasn't earned a place on the schedule yet.
 * A separate table would fork every read path in the app.
 *
 * `approved` is the DEFAULT so the column is invisible to the running build
 * until the read filters ship. Nothing is deleted here: the non-sporting rows
 * already on the schedule move to `suggested`, which takes them off the master
 * schedule while leaving them in the venue lead's queue to accept or reject.
 */
import { query } from '../lib/db'

async function main() {
  await query(`
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES staff(id);
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approved_at timestamptz;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS approval_note text;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS suggestion_reason text;
  `)

  await query(`ALTER TABLE events DROP CONSTRAINT IF EXISTS events_approval_status_check`)
  await query(`
    ALTER TABLE events ADD CONSTRAINT events_approval_status_check
      CHECK (approval_status IN ('approved', 'suggested', 'rejected'))
  `)

  await query(`
    CREATE INDEX IF NOT EXISTS idx_events_approval_status ON events(approval_status);
    CREATE INDEX IF NOT EXISTS idx_events_approval_venue_date
      ON events(approval_status, venue_id, event_date);
  `)

  // Backfill. Only future, non-sporting, untouched rows move to `suggested`:
  //   - past events stay approved so history and reporting are unchanged
  //   - anything already staffed, ticketed or worked stays approved, because
  //     someone has committed to it and pulling it off the schedule mid-flight
  //     would strand real work
  const backfill = await query(`
    UPDATE events e
    SET approval_status = 'suggested',
        suggestion_reason = 'Non-sporting event pulled from the venue calendar before the approval step existed'
    WHERE e.event_date >= CURRENT_DATE
      AND COALESCE(e.event_type, 'event') <> 'game'
      AND e.approval_status = 'approved'
      AND e.status <> 'cancelled'
      AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM tickets t WHERE t.event_id = e.id)
      AND NOT EXISTS (SELECT 1 FROM workflow_submissions ws WHERE ws.event_id = e.id)
    RETURNING e.id
  `)

  const summary = await query(`
    SELECT approval_status,
           COALESCE(event_type, 'event') AS event_type,
           count(*)::int AS count
    FROM events
    WHERE event_date >= CURRENT_DATE
    GROUP BY 1, 2
    ORDER BY 1, 3 DESC
  `)

  console.log(`Moved to suggested: ${backfill.rowCount}`)
  console.table(summary.rows)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
