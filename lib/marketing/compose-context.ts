import { query } from '@/lib/db'

export type MarketingComposeContext = {
  loadedAt: string
  summary: {
    contacts?: Record<string, unknown>
    campaigns?: Record<string, unknown>
    audiences?: Record<string, unknown>
    approvals?: Record<string, unknown>
    social?: Record<string, unknown>
    formRoutes?: Record<string, unknown>
    templates?: Record<string, unknown>
    formSubmissions?: Record<string, unknown>
  }
  audiences: Array<{ id: string; name: string; member_count?: number; description?: string }>
  recentCampaigns: Array<{ id: string; name: string; subject: string; status: string; audience_name?: string; open_rate?: number }>
  recentSocial: Array<{ id: string; platform: string; content: string; state: string }>
  newsletterTemplates: Array<{ id: string; name: string; subject?: string; preview_text?: string; body_snippet?: string }>
  formRoutes: Array<{ form_title: string; route_to_name: string; inquiry_type?: string }>
  recentSubmissions: Array<{ form_title: string; company_name?: string; submitted_at?: string }>
  promptBlock: string
}

function snippet(value: unknown, max = 180) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text) return ''
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

export function buildMarketingContextPromptBlock(ctx: Omit<MarketingComposeContext, 'promptBlock'>) {
  const lines: string[] = [
    'Live ANC Marketing Hub data (HubSpot-imported where noted):',
    `- Send-safe contacts: ${ctx.summary.contacts?.subscribed ?? 0} subscribed of ${ctx.summary.contacts?.total ?? 0} total`,
    `- HubSpot-imported contacts: ${ctx.summary.contacts?.hubspot_imported ?? 0}`,
    `- Bounced contacts: ${ctx.summary.contacts?.bounced ?? 0}`,
    `- Newsletter campaigns: ${ctx.summary.campaigns?.total ?? 0} (${ctx.summary.campaigns?.sent ?? 0} sent)`,
    `- Pending approvals: ${ctx.summary.approvals?.pending ?? 0}`,
    `- Form routing rules: ${ctx.summary.formRoutes?.active ?? 0} active`,
    `- Form submissions: ${ctx.summary.formSubmissions?.total ?? 0} (${ctx.summary.formSubmissions?.hubspot ?? 0} from HubSpot)`,
  ]

  if (ctx.audiences.length) {
    lines.push('', 'Audiences:')
    for (const audience of ctx.audiences.slice(0, 6)) {
      lines.push(`- ${audience.name}: ${audience.member_count ?? 0} members${audience.description ? ` — ${snippet(audience.description, 80)}` : ''}`)
    }
  }

  if (ctx.recentCampaigns.length) {
    lines.push('', 'Recent newsletters (voice reference):')
    for (const campaign of ctx.recentCampaigns.slice(0, 4)) {
      lines.push(
        `- "${campaign.subject}" (${campaign.status}${campaign.open_rate != null ? `, ${campaign.open_rate}% open` : ''})`,
      )
    }
  }

  if (ctx.newsletterTemplates.length) {
    lines.push('', 'Imported newsletter templates:')
    for (const template of ctx.newsletterTemplates.slice(0, 3)) {
      lines.push(`- ${template.name}: subject "${snippet(template.subject, 90)}"`)
      if (template.body_snippet) lines.push(`  excerpt: ${template.body_snippet}`)
    }
  }

  if (ctx.recentSocial.length) {
    lines.push('', 'Recent social drafts:')
    for (const post of ctx.recentSocial.slice(0, 3)) {
      lines.push(`- ${post.platform}: ${snippet(post.content, 120)}`)
    }
  }

  if (ctx.recentSubmissions.length) {
    lines.push('', 'Recent form signals:')
    for (const submission of ctx.recentSubmissions.slice(0, 4)) {
      lines.push(`- ${submission.form_title}${submission.company_name ? ` (${submission.company_name})` : ''}`)
    }
  }

  return lines.join('\n')
}

export async function loadMarketingComposeContext(): Promise<MarketingComposeContext> {
  const [
    audiencesRes,
    contactsRes,
    campaignsRes,
    eventsRes,
    routesRes,
    socialRes,
    templatesRes,
    approvalsRes,
    submissionsRes,
    recentCampaignsRes,
    recentSocialRes,
    templateSamplesRes,
    formRoutesRes,
    recentSubmissionsRes,
  ] = await Promise.all([
    query(`SELECT a.id, a.name, a.description,
        COUNT(m.contact_id) FILTER (WHERE m.status = 'active')::int AS member_count
      FROM marketing_audiences a
      LEFT JOIN marketing_audience_members m ON m.audience_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id
      ORDER BY member_count DESC NULLS LAST
      LIMIT 12`),
    query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE subscription_status = 'subscribed')::int AS subscribed,
        COUNT(*) FILTER (WHERE bounced_at IS NOT NULL)::int AS bounced,
        COUNT(*) FILTER (WHERE metadata->>'migratedFromHubSpot' = 'true')::int AS hubspot_imported
      FROM marketing_contacts`),
    query(`SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
      FROM newsletter_campaigns`),
    query(`SELECT COUNT(*)::int AS opens FROM newsletter_campaign_events WHERE event_type = 'open'`),
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active = true)::int AS active FROM marketing_form_routing_rules`),
    query(`SELECT COUNT(*)::int AS total FROM marketing_social_posts`),
    query(`SELECT COUNT(*)::int AS total FROM marketing_templates WHERE is_active = true AND template_type = 'newsletter'`),
    query(`SELECT COUNT(*)::int AS pending FROM marketing_approval_requests WHERE status = 'pending'`),
    query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE source = 'hubspot')::int AS hubspot FROM marketing_form_submissions`),
    query(`SELECT c.id, c.name, c.subject, c.status, a.name AS audience_name,
        ROUND((COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL))::numeric * 100 / NULLIF(COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL), 0), 1)::float AS open_rate
      FROM newsletter_campaigns c
      LEFT JOIN marketing_audiences a ON a.id = c.audience_id
      LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
      GROUP BY c.id, a.name
      ORDER BY c.updated_at DESC
      LIMIT 6`),
    query(`SELECT id, platform, content, state FROM marketing_social_posts ORDER BY updated_at DESC LIMIT 6`),
    query(`SELECT id, name, subject, preview_text, LEFT(COALESCE(body_html, ''), 220) AS body_snippet
      FROM marketing_templates
      WHERE is_active = true AND template_type = 'newsletter'
      ORDER BY updated_at DESC
      LIMIT 4`),
    query(`SELECT form_title, route_to_name, inquiry_type FROM marketing_form_routing_rules WHERE is_active = true ORDER BY form_title LIMIT 8`),
    query(`SELECT form_title, company_name, submitted_at FROM marketing_form_submissions ORDER BY submitted_at DESC NULLS LAST LIMIT 6`),
  ])

  const summary = {
    contacts: contactsRes.rows[0],
    campaigns: campaignsRes.rows[0],
    audiences: { total: audiencesRes.rows.length },
    approvals: approvalsRes.rows[0],
    social: socialRes.rows[0],
    formRoutes: routesRes.rows[0],
    templates: templatesRes.rows[0],
    formSubmissions: submissionsRes.rows[0],
    events: eventsRes.rows[0],
  }

  const base = {
    loadedAt: new Date().toISOString(),
    summary,
    audiences: audiencesRes.rows as MarketingComposeContext['audiences'],
    recentCampaigns: recentCampaignsRes.rows as MarketingComposeContext['recentCampaigns'],
    recentSocial: recentSocialRes.rows as MarketingComposeContext['recentSocial'],
    newsletterTemplates: (templateSamplesRes.rows as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      name: String(row.name),
      subject: row.subject ? String(row.subject) : undefined,
      preview_text: row.preview_text ? String(row.preview_text) : undefined,
      body_snippet: row.body_snippet ? snippet(String(row.body_snippet), 180) : undefined,
    })),
    formRoutes: formRoutesRes.rows as MarketingComposeContext['formRoutes'],
    recentSubmissions: recentSubmissionsRes.rows as MarketingComposeContext['recentSubmissions'],
  }

  return {
    ...base,
    promptBlock: buildMarketingContextPromptBlock(base),
  }
}
