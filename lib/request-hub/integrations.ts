// Request Hub — integration adapter layer. Each adapter reports whether it is
// actually configured (real credentials present) so the admin screen and the
// link picker can show honest status. Nothing here fakes a connection: an
// unconfigured adapter is shown as "not connected" and its features are
// hidden, while the core system keeps working without it.

import { twentyClient } from '@/lib/twenty-client'
import { graphConfigured } from '@/lib/msgraph-files'
import { getHubConfig } from './config'

export interface IntegrationStatus {
  key: string
  label: string
  description: string
  configured: boolean
  enabled: boolean
  testMode: boolean
  envVars: string[]
  linkKinds: string[]
}

export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const cfg = await getHubConfig()
  const flag = (key: string) => cfg.integrations[key] || { enabled: false, testMode: false }

  return [
    {
      key: 'crm',
      label: 'CRM accounts & opportunities',
      description: 'Link requests to accounts, venues, and opportunities in the CRM; powers the record picker.',
      configured: twentyClient.isConfigured(),
      enabled: flag('crm').enabled,
      testMode: flag('crm').testMode,
      envVars: ['TWENTY_API_URL', 'TWENTY_API_KEY'],
      linkKinds: ['account', 'opportunity'],
    },
    {
      key: 'slack',
      label: 'Slack',
      description: 'Slash command, shortcuts, intake modal, confirmation DMs, and leadership decision cards.',
      configured: !!process.env.SLACK_BOT_TOKEN && !!process.env.SLACK_SIGNING_SECRET,
      enabled: flag('slack').enabled,
      testMode: flag('slack').testMode,
      envVars: ['SLACK_BOT_TOKEN', 'SLACK_SIGNING_SECRET'],
      linkKinds: ['slack_thread'],
    },
    {
      key: 'graph',
      label: 'OneDrive / SharePoint',
      description: 'Attach documents that live in company drives by link.',
      configured: graphConfigured(),
      enabled: flag('graph').enabled,
      testMode: flag('graph').testMode,
      envVars: ['MSGRAPH_TENANT_ID', 'MSGRAPH_CLIENT_ID', 'MSGRAPH_CLIENT_SECRET'],
      linkKinds: ['document'],
    },
    {
      key: 'email_intake',
      label: 'Email intake',
      description: 'Create requests from inbound email via the intake webhook.',
      configured: !!process.env.REQUEST_HUB_EMAIL_TOKEN,
      enabled: flag('email_intake').enabled,
      testMode: flag('email_intake').testMode,
      envVars: ['REQUEST_HUB_EMAIL_TOKEN'],
      linkKinds: [],
    },
  ]
}

export interface LinkSearchResult {
  kind: string
  ref_id: string
  label: string
  url?: string
}

/** Search linkable records across configured sources. Unconfigured sources are skipped. */
export async function searchLinkTargets(q: string): Promise<LinkSearchResult[]> {
  const results: LinkSearchResult[] = []
  const term = q.trim()
  if (term.length < 2) return results

  const statuses = await getIntegrationStatuses()
  const crm = statuses.find((s) => s.key === 'crm')
  if (crm?.configured && crm.enabled) {
    try {
      const filter = `name[ilike]:"%${term.replace(/"/g, '')}%"`
      const [companies, opportunities] = await Promise.all([
        twentyClient.getCompanies(filter).catch(() => []),
        twentyClient.getOpportunities(filter).catch(() => []),
      ])
      for (const c of (companies as any[]).slice(0, 5)) {
        results.push({ kind: 'account', ref_id: c.id, label: c.name || c.id })
      }
      for (const o of (opportunities as any[]).slice(0, 5)) {
        results.push({ kind: 'opportunity', ref_id: o.id, label: o.name || o.id })
      }
    } catch (err) {
      console.warn('[request-hub] CRM link search failed:', err)
    }
  }
  return results
}
