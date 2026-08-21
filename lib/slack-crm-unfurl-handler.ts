/**
 * The lookup half of the Slack CRM link previews (see ./slack-crm-unfurl).
 *
 * Answers Slack's `link_shared` with a card per link. Everything here fails
 * soft: a card that cannot be filled in from the CRM still goes out carrying
 * what the link itself says, because a link that unfurls as a name is already
 * better than a bare URL, and a thrown error would leave the channel with
 * nothing.
 */
import { slackApi } from '@/lib/slack'
import { twentyClient } from '@/lib/twenty-client'
import {
  buildUnfurlCard,
  fallbackCard,
  formatCardDate,
  humanizeEnum,
  objectLabel,
  parseCrmLink,
  reportLabel,
  deslugify,
  type CardFacts,
  type CrmLink,
} from '@/lib/slack-crm-unfurl'

/** Slack sends at most a handful; this bounds a pathological message. */
const MAX_LINKS = 5

async function describeRecord(link: Extract<CrmLink, { kind: 'record' }>): Promise<CardFacts> {
  const fallback = fallbackCard(link)
  try {
    if (link.object === 'opportunity') {
      const deal = await twentyClient.getOpportunity(link.id)
      if (!deal) return fallback
      const account = deal.companyId ? await twentyClient.getCompany(deal.companyId) : null
      return {
        title: deal.name || fallback.title,
        kind: 'Opportunity',
        facts: [
          account?.name || null,
          humanizeEnum(deal.bidStatus || deal.stage),
          deal.closeDate ? `Award date ${formatCardDate(deal.closeDate)}` : null,
        ],
      }
    }

    if (link.object === 'company') {
      const account = await twentyClient.getCompany(link.id)
      if (!account) return fallback
      return { title: account.name || fallback.title, kind: 'Account' }
    }
  } catch (error) {
    console.error('[slack-unfurl] could not read', link.object, link.id, error)
  }
  return fallback
}

async function describe(link: CrmLink): Promise<CardFacts> {
  if (link.kind === 'record') return describeRecord(link)
  if (link.kind === 'report') {
    return {
      title: deslugify(link.slug) || reportLabel(link.object),
      kind: `Report · ${reportLabel(link.object)}`,
    }
  }
  return { title: deslugify(link.slug) || 'ANC', kind: 'Dashboard' }
}

/**
 * Handles one `link_shared` event.
 *
 * Returns how many links it unfurled, so a caller (and the tests) can tell
 * "nothing of ours in this message" from "we tried and Slack refused".
 */
export async function handleSlackLinkShared(event: any): Promise<number> {
  const links: any[] = Array.isArray(event?.links) ? event.links.slice(0, MAX_LINKS) : []
  if (!links.length || !event?.channel || !event?.message_ts) return 0

  const unfurls: Record<string, unknown> = {}
  for (const entry of links) {
    const parsed = parseCrmLink(entry?.url)
    if (!parsed) continue
    // Keyed by the URL exactly as Slack sent it: a normalised key unfurls
    // nothing at all, silently.
    unfurls[entry.url] = buildUnfurlCard(parsed, await describe(parsed))
  }

  const count = Object.keys(unfurls).length
  if (!count) return 0

  const res: any = await slackApi('chat.unfurl', {
    channel: event.channel,
    ts: event.message_ts,
    unfurls,
  })
  if (!res?.ok) {
    console.error('[slack-unfurl] chat.unfurl refused:', res?.error, Object.keys(unfurls))
    return 0
  }
  return count
}
