import { query } from '@/lib/db'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

type MarketingStatus = 'subscribed' | 'unsubscribed' | 'bounced' | 'non_marketing' | 'candidate'

type EligibilityResult = {
  email: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  crmPersonId: string | null
  crmCompanyId: string | null
  status: MarketingStatus
  newsletterOptIn: boolean | null
  reason: string
  metadata: Record<string, unknown>
}

function compactString(value: unknown): string | null {
  const text = String(value || '').trim()
  return text || null
}

function cleanEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !email.includes('@')) return null
  return email
}

function truthy(value: unknown): boolean {
  if (value === true) return true
  const text = String(value || '').trim().toLowerCase()
  return ['true', 'yes', '1', 'y', 'opted_out', 'unsubscribed'].includes(text)
}

function booleanValue(value: unknown): boolean | null {
  if (value === true || value === false) return value
  const text = String(value ?? '').trim().toLowerCase()
  if (['true', 'yes', '1', 'y'].includes(text)) return true
  if (['false', 'no', '0', 'n'].includes(text)) return false
  return null
}

function readPath(record: Record<string, any>, paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
      return undefined
    }, record)
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return null
}

function joinSignals(record: Record<string, any>): string {
  return [
    readPath(record, ['marketingStatus', 'marketingContactStatus', 'hs_marketable_status', 'subscriptionStatus']),
    readPath(record, ['contactStatus', 'status', 'leadStatus']),
    readPath(record, ['lifecycleStage', 'lifecyclestage']),
    readPath(record, ['leadSource', 'leadsource', 'source']),
    readPath(record, ['emailStatus', 'emailDeliveryStatus']),
    readPath(record, ['metadata.marketingStatus', 'metadata.contactStatus']),
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ')
}

export function evaluateMarketingEligibility(record: Record<string, any>, source: string): EligibilityResult | null {
  const email = cleanEmail(readPath(record, ['emails.primaryEmail', 'email.primaryEmail', 'email', 'primaryEmail']))
  if (!email) return null

  const signal = joinSignals(record)
  const rawMarketingStatus = String(readPath(record, ['marketingStatus', 'marketingContactStatus', 'hs_marketable_status', 'subscriptionStatus']) || '')
    .trim()
    .toLowerCase()
  const hardBounce = truthy(readPath(record, ['hardBounced', 'hardBounce', 'bounced', 'emailBounced'])) ||
    /hard[_ -]?bounce|bounced|invalid email/.test(signal)
  const optedOut = truthy(readPath(record, ['doNotMarket', 'marketingOptOut', 'optedOut', 'unsubscribed', 'emailOptOut'])) ||
    /unsubscribe|opt[_ -]?out|do not market|do_not_market/.test(signal)
  const nonMarketing = truthy(readPath(record, ['nonMarketing', 'isNonMarketing'])) ||
    /suppressed|non[_ -]?marketing|disqualified|spam|unengaged/.test(signal)
  const isAncStaff = truthy(readPath(record, ['isAncStaff', 'staff', 'isStaff']))
  const newsletterOptIn = booleanValue(readPath(record, ['newsletterOptIn', 'newsletterOptedIn', 'metadata.newsletterOptIn']))

  let status: MarketingStatus = 'subscribed'
  let reason = 'eligible'
  if (hardBounce) {
    status = 'bounced'
    reason = 'hard_bounce'
  } else if (optedOut) {
    status = 'unsubscribed'
    reason = 'opted_out'
  } else if (nonMarketing || isAncStaff) {
    status = 'non_marketing'
    reason = isAncStaff ? 'anc_staff' : 'non_marketing_or_disqualified'
  } else if (/candidate|review/.test(rawMarketingStatus)) {
    status = 'candidate'
    reason = 'candidate_review'
  }

  const firstName = compactString(readPath(record, ['name.firstName', 'firstName']))
  const lastName = compactString(readPath(record, ['name.lastName', 'lastName']))
  const companyName = compactString(readPath(record, ['company.name', 'companyName', 'accountName']))

  return {
    email,
    firstName,
    lastName,
    companyName,
    crmPersonId: compactString(readPath(record, ['id', 'personId'])),
    crmCompanyId: compactString(readPath(record, ['companyId', 'company.id'])),
    status,
    newsletterOptIn,
    reason,
    metadata: {
      marketing_sync_source: source,
      marketing_sync_reason: reason,
      marketing_sync_seen_at: new Date().toISOString(),
      crm_newsletter_opt_in: newsletterOptIn,
      crm_created_at: compactString(readPath(record, ['createdAt', 'created_at'])),
      crm_updated_at: compactString(readPath(record, ['updatedAt', 'updated_at'])),
      crm_raw_marketing_status: compactString(readPath(record, ['marketingStatus', 'marketingContactStatus', 'hs_marketable_status'])),
      crm_contact_status: compactString(readPath(record, ['contactStatus', 'status', 'leadStatus'])),
      crm_lifecycle_stage: compactString(readPath(record, ['lifecycleStage', 'lifecyclestage'])),
      crm_lead_source: compactString(readPath(record, ['leadSource', 'leadsource', 'source'])),
    },
  }
}

export async function upsertMarketingEligibility(input: EligibilityResult): Promise<{ contactId: string; status: string; audienceStatus: string }> {
  const now = new Date()
  const unsubscribedAt = input.status === 'unsubscribed' ? now : null
  const bouncedAt = input.status === 'bounced' ? now : null

  const contactRes = await query(
    `INSERT INTO marketing_contacts
      (crm_person_id, crm_company_id, email, first_name, last_name, company_name, source, subscription_status,
       unsubscribe_reason, bounced_at, unsubscribed_at, last_synced_at, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12::jsonb)
     ON CONFLICT (email) DO UPDATE
       SET crm_person_id = COALESCE(EXCLUDED.crm_person_id, marketing_contacts.crm_person_id),
           crm_company_id = COALESCE(EXCLUDED.crm_company_id, marketing_contacts.crm_company_id),
           first_name = COALESCE(EXCLUDED.first_name, marketing_contacts.first_name),
           last_name = COALESCE(EXCLUDED.last_name, marketing_contacts.last_name),
           company_name = COALESCE(EXCLUDED.company_name, marketing_contacts.company_name),
           source = CASE
             WHEN marketing_contacts.source = 'manual' THEN EXCLUDED.source
             ELSE marketing_contacts.source
           END,
           subscription_status = CASE
             WHEN marketing_contacts.subscription_status IN ('unsubscribed', 'bounced', 'non_marketing', 'suppressed')
               AND EXCLUDED.subscription_status = 'subscribed'
             THEN marketing_contacts.subscription_status
             ELSE EXCLUDED.subscription_status
           END,
           unsubscribe_reason = COALESCE(marketing_contacts.unsubscribe_reason, EXCLUDED.unsubscribe_reason),
           bounced_at = COALESCE(marketing_contacts.bounced_at, EXCLUDED.bounced_at),
           unsubscribed_at = COALESCE(marketing_contacts.unsubscribed_at, EXCLUDED.unsubscribed_at),
           last_synced_at = NOW(),
           metadata = marketing_contacts.metadata || EXCLUDED.metadata,
           updated_at = NOW()
     RETURNING id, subscription_status`,
    [
      input.crmPersonId,
      input.crmCompanyId,
      input.email,
      input.firstName,
      input.lastName,
      input.companyName,
      input.metadata.marketing_sync_source || 'crm_auto_sync',
      input.status,
      input.status === 'unsubscribed' ? input.reason : null,
      bouncedAt,
      unsubscribedAt,
      JSON.stringify(input.metadata),
    ],
  )

  const contact = contactRes.rows[0]
  const audienceRes = await query(
    `SELECT id FROM marketing_audiences WHERE name = 'Media & Partnerships Newsletter' AND is_active = true LIMIT 1`,
  )
  const audience = audienceRes.rows[0]
  const audienceStatus = contact.subscription_status === 'subscribed' && input.newsletterOptIn !== false ? 'active' : 'suppressed'

  if (audience?.id) {
    await query(
      `INSERT INTO marketing_audience_members (audience_id, contact_id, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (audience_id, contact_id) DO UPDATE
         SET status = EXCLUDED.status,
             added_at = CASE
               WHEN EXCLUDED.status = 'active' AND marketing_audience_members.status <> 'active' THEN NOW()
               ELSE marketing_audience_members.added_at
             END`,
      [audience.id, contact.id, audienceStatus],
    )
  }

  return { contactId: contact.id, status: contact.subscription_status, audienceStatus }
}

export async function syncTwentyPeopleToMarketing(opts: {
  limit?: number
  since?: Date | null
  dryRun?: boolean
} = {}): Promise<{ scanned: number; eligible: number; suppressed: number; skipped: number; upserted: number; dryRun: boolean }> {
  if (!TWENTY_API_KEY) throw new Error('TWENTY_API_KEY is not configured')

  const max = Math.max(1, Math.min(opts.limit || 300, 3000))
  const records: Record<string, any>[] = []
  let cursor: string | null = null

  while (records.length < max) {
    const params = new URLSearchParams()
    params.set('limit', String(Math.min(60, max - records.length)))
    params.set('order_by', 'updatedAt[DescNullsLast]')
    if (cursor) params.set('starting_after', cursor)

    const res = await fetch(`${TWENTY_BASE}/rest/people?${params.toString()}`, {
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
    })
    if (!res.ok) throw new Error(`Twenty people sync failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    const json = await res.json()
    const page = json?.data?.people || []
    records.push(...page)
    if (!json?.pageInfo?.hasNextPage || !json.pageInfo.endCursor || page.length === 0) break
    cursor = json.pageInfo.endCursor
  }

  let scanned = 0
  let eligible = 0
  let suppressed = 0
  let skipped = 0
  let upserted = 0

  for (const record of records) {
    const updatedAt = compactString(record.updatedAt || record.createdAt)
    if (opts.since && updatedAt && new Date(updatedAt) < opts.since) continue
    scanned += 1

    const evaluated = evaluateMarketingEligibility(record, 'twenty_crm_auto_sync')
    if (!evaluated) {
      skipped += 1
      continue
    }
    if (evaluated.status === 'subscribed') eligible += 1
    else suppressed += 1

    if (!opts.dryRun) {
      await upsertMarketingEligibility(evaluated)
      upserted += 1
    }
  }

  return { scanned, eligible, suppressed, skipped, upserted, dryRun: Boolean(opts.dryRun) }
}

export async function recordMarketingSyncRun(kind: string, result: Record<string, unknown>, status = 'success') {
  await query(
    `INSERT INTO marketing_sync_runs (sync_type, status, result)
     VALUES ($1, $2, $3::jsonb)`,
    [kind, status, JSON.stringify(result)],
  )
}

export async function suppressMarketingEmail(opts: {
  email: string
  reason: 'bounce' | 'complaint' | 'unsubscribe'
  recipientId?: string | null
  campaignId?: string | null
  rawEvent?: Record<string, unknown>
}) {
  const email = cleanEmail(opts.email)
  if (!email) return { updatedContacts: 0, updatedRecipients: 0 }

  const status = opts.reason === 'bounce' ? 'bounced' : 'unsubscribed'
  const eventType = opts.reason === 'bounce' ? 'bounce' : opts.reason
  const reasonText = opts.reason === 'bounce' ? 'provider bounce webhook' : `provider ${opts.reason} webhook`

  const contacts = await query(
    `UPDATE marketing_contacts
     SET subscription_status = $2,
         unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN COALESCE(unsubscribed_at, NOW()) ELSE unsubscribed_at END,
         bounced_at = CASE WHEN $2 = 'bounced' THEN COALESCE(bounced_at, NOW()) ELSE bounced_at END,
         unsubscribe_reason = COALESCE(unsubscribe_reason, $3),
         metadata = metadata || $4::jsonb,
         updated_at = NOW()
     WHERE email = $1
     RETURNING id`,
    [
      email,
      status,
      reasonText,
      JSON.stringify({
        last_provider_suppression_at: new Date().toISOString(),
        last_provider_suppression_reason: opts.reason,
      }),
    ],
  )

  for (const contact of contacts.rows) {
    await query(
      `UPDATE marketing_audience_members SET status = 'suppressed' WHERE contact_id = $1`,
      [contact.id],
    )
  }

  const recipientParams: any[] = [email, status]
  const recipientWhere = [`email = $1`]
  if (opts.recipientId) {
    recipientParams.push(opts.recipientId)
    recipientWhere.push(`id = $${recipientParams.length}`)
  }
  if (opts.campaignId) {
    recipientParams.push(opts.campaignId)
    recipientWhere.push(`campaign_id = $${recipientParams.length}`)
  }

  const errorParam = recipientParams.length + 1
  const recipients = await query(
    `UPDATE newsletter_campaign_recipients
     SET status = $2,
         bounced_at = CASE WHEN $2 = 'bounced' THEN COALESCE(bounced_at, NOW()) ELSE bounced_at END,
         unsubscribed_at = CASE WHEN $2 = 'unsubscribed' THEN COALESCE(unsubscribed_at, NOW()) ELSE unsubscribed_at END,
         error_text = $${errorParam}
     WHERE (${recipientWhere.join(' OR ')})
     RETURNING id, campaign_id, contact_id`,
    [...recipientParams, reasonText],
  )

  for (const recipient of recipients.rows) {
    await query(
      `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, event_url, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5, NULL, NULL)`,
      [
        recipient.campaign_id,
        recipient.id,
        recipient.contact_id,
        eventType,
        opts.rawEvent ? JSON.stringify(opts.rawEvent).slice(0, 1000) : null,
      ],
    )
  }

  return { updatedContacts: contacts.rowCount || 0, updatedRecipients: recipients.rowCount || 0 }
}
