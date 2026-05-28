import { SignalTopbar } from '@/components/signal/topbar'
import { InsightsPage } from '@/components/signal/insights-page'
import { query } from '@/lib/db'

interface CampaignRow {
  id: string
  name: string
  subject: string
  status: string
  sent_at: string | null
  scheduled_at: string | null
  recipient_count: number
  opened_count: number
  clicked_count: number
  unsubscribed_count: number
}

async function getCampaigns(): Promise<CampaignRow[]> {
  try {
    const r = await query(`
      SELECT
        c.id, c.name, c.subject, c.status, c.sent_at, c.scheduled_at,
        COUNT(r.id)::int                                               AS recipient_count,
        COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int        AS opened_count,
        COUNT(r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL)::int AS clicked_count,
        COUNT(r.id) FILTER (WHERE r.unsubscribed_at IS NOT NULL)::int  AS unsubscribed_count
      FROM newsletter_campaigns c
      LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
      WHERE c.status NOT IN ('hubspot_imported_reference')
      GROUP BY c.id
      ORDER BY COALESCE(c.sent_at, c.updated_at) DESC NULLS LAST
      LIMIT 30
    `)
    return r.rows as CampaignRow[]
  } catch {
    return []
  }
}

export default async function SignalInsights() {
  const campaigns = await getCampaigns()
  return (
    <div className="flex flex-col">
      <SignalTopbar
        title="Insights"
        description="Operator-grade reads on every send. AI tells you what worked, what didn't, what to do next."
      />
      <InsightsPage campaigns={campaigns} />
    </div>
  )
}
