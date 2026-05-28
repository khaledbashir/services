import { SignalTopbar } from '@/components/signal/topbar'
import { CalendarView } from '@/components/signal/calendar-view'
import { query } from '@/lib/db'

interface ScheduledItem {
  id: string
  channel: string
  title: string
  date: string
  state: string
}

async function getScheduled(): Promise<ScheduledItem[]> {
  try {
    const r = await query(`
      SELECT id::text AS id,
             'newsletter'::text AS channel,
             COALESCE(subject, name) AS title,
             COALESCE(scheduled_at, sent_at, updated_at)::date::text AS date,
             status AS state
      FROM newsletter_campaigns
      WHERE COALESCE(scheduled_at, sent_at) > NOW() - INTERVAL '90 days'
        AND status NOT IN ('hubspot_imported_reference')
      UNION ALL
      SELECT id::text AS id,
             platform AS channel,
             COALESCE(channel_name, content) AS title,
             COALESCE(scheduled_at, created_at)::date::text AS date,
             state
      FROM marketing_social_posts
      WHERE COALESCE(scheduled_at, created_at) > NOW() - INTERVAL '90 days'
      ORDER BY date ASC
      LIMIT 200
    `)
    return r.rows as ScheduledItem[]
  } catch {
    return []
  }
}

export default async function SignalCalendar() {
  const scheduled = await getScheduled()
  return (
    <div className="flex flex-col">
      <SignalTopbar
        title="Calendar"
        description="Every scheduled send + post on one canvas. Gold slots = AI-suggested optimal windows."
      />
      <CalendarView scheduled={scheduled} />
    </div>
  )
}
