export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const [audiences, contacts, campaigns, events, recentCampaigns, routes, social, templates, approvals, submissions] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM marketing_audiences WHERE is_active = true`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE subscription_status = 'subscribed')::int AS subscribed,
          COUNT(*) FILTER (WHERE subscription_status = 'suppressed')::int AS suppressed,
          COUNT(*) FILTER (WHERE subscription_status = 'non_marketing')::int AS non_marketing,
          COUNT(*) FILTER (WHERE subscription_status = 'candidate')::int AS candidate,
          COUNT(*) FILTER (WHERE subscription_status = 'unsubscribed')::int AS unsubscribed,
          COUNT(*) FILTER (WHERE bounced_at IS NOT NULL)::int AS bounced,
          COUNT(*) FILTER (WHERE metadata->>'migratedFromHubSpot' = 'true')::int AS hubspot_imported
        FROM marketing_contacts`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
          COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE status = 'hubspot_imported_reference')::int AS hubspot_imported_reference
        FROM newsletter_campaigns`),
      query(`SELECT
          COUNT(*) FILTER (WHERE event_type = 'sent')::int AS sent_events,
          COUNT(*) FILTER (WHERE event_type = 'open')::int AS opens,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(*) FILTER (WHERE event_type = 'unsubscribe')::int AS unsubscribes
        FROM newsletter_campaign_events`),
      query(`SELECT c.*,
          a.name AS audience_name,
          COUNT(r.id)::int AS recipient_count,
          COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL)::int AS sent_count,
          COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened_count,
          COUNT(r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL)::int AS clicked_count
        FROM newsletter_campaigns c
        LEFT JOIN marketing_audiences a ON a.id = c.audience_id
        LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
        GROUP BY c.id, a.name
        ORDER BY c.updated_at DESC
        LIMIT 8`),
      query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active = true)::int AS active FROM marketing_form_routing_rules`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE state = 'scheduled')::int AS scheduled,
          COUNT(*) FILTER (WHERE state = 'published')::int AS published
        FROM marketing_social_posts`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE template_type = 'newsletter')::int AS newsletters,
          COUNT(*) FILTER (WHERE template_type = 'social')::int AS social
        FROM marketing_templates
        WHERE is_active = true`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested
        FROM marketing_approval_requests`),
      query(`SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE source = 'hubspot')::int AS hubspot,
          COUNT(*) FILTER (WHERE timeline_status = 'crm_note_created')::int AS crm_notes
        FROM marketing_form_submissions`),
    ])

    return NextResponse.json({
      summary: {
        audiences: audiences.rows[0],
        contacts: contacts.rows[0],
        campaigns: campaigns.rows[0],
        events: events.rows[0],
        formRoutes: routes.rows[0],
        social: social.rows[0],
        templates: templates.rows[0],
        approvals: approvals.rows[0],
        formSubmissions: submissions.rows[0],
        postiz: {
          baseUrl: process.env.POSTIZ_API_URL || process.env.POSTIZ_URL || 'https://abc-postiz.izcgmb.easypanel.host',
          connectedChannels: ['Slack'],
          missingChannels: ['LinkedIn', 'X', 'Instagram'],
        },
      },
      recentCampaigns: recentCampaigns.rows,
    })
  } catch (err) {
    console.error('Error loading marketing dashboard:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
