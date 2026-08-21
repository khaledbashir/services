/**
 * ANC-branded previews for CRM links pasted in Slack (Jireh, 2026-08-21:
 * "can you make the links work in slack too").
 *
 * He pastes CRM links into channels all day. Slack shows them as a bare URL —
 * and would show nothing better on its own, because crm.ancsports.net is
 * behind a login: Slack's crawler only ever reaches the sign-in shell, so
 * every link in the workspace unfurls as the same generic card. The fix is the
 * ANC app answering `link_shared` itself with a card it builds.
 *
 * WHAT A CARD MAY SAY. A Slack channel is a wider room than the CRM — a card
 * is visible to everyone in it, including guests. So a card carries what the
 * link already carries plus the labels that make it readable: the record's
 * name, what kind of record it is, its account, its status and its owner.
 * MONEY IS DELIBERATELY LEFT OUT. Revenue, margin, PO value and amount never
 * reach a channel from here.
 *
 * This module is pure and self-contained: the suites import the TypeScript
 * source directly and Node will not follow a path alias. The lookups live in
 * slack-crm-unfurl-handler.ts.
 */

export const CRM_HOST = 'crm.ancsports.net'

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Words that must survive title-casing when a name is read off a slug. */
const ACRONYMS = new Set([
  'ANC', 'LG', 'LED', 'LCD', 'PO', 'RFP', 'SOW', 'AV', 'IT', 'TV', 'OOH',
  'NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'NCAA', 'NWSL', 'WNBA', 'MILB', 'USL',
  'AHL', 'ECHL', 'CFL', 'MSE', 'COAT', 'FC', 'SC', 'HQ', 'AI', 'FY',
])

export type CrmLink =
  | { kind: 'record'; url: string; object: string; id: string; slug: string }
  | { kind: 'report'; url: string; object: string; viewId: string | null; slug: string }
  | { kind: 'page'; url: string; id: string; slug: string }

/**
 * Reads one of ours, or returns null.
 *
 * Both link shapes are accepted — the readable one the CRM now writes into the
 * address bar, and the bare-id one every link sent before today still uses.
 */
export function parseCrmLink(rawUrl: string): CrmLink | null {
  let url: URL
  try {
    url = new URL(String(rawUrl))
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== CRM_HOST) return null

  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[0] === 'object' && segments.length >= 3) {
    const id = (segments[2].match(UUID) || [])[0]
    if (!id) return null
    return {
      kind: 'record',
      url: rawUrl,
      object: segments[1],
      id,
      slug: segments[2].replace(id, '').replace(/-+$/, ''),
    }
  }

  if (segments[0] === 'objects' && segments.length >= 2) {
    return {
      kind: 'report',
      url: rawUrl,
      object: segments[1],
      viewId: url.searchParams.get('viewId'),
      slug: segments[2] || '',
    }
  }

  if (segments[0] === 'page' && segments.length >= 2) {
    const id = (segments[1].match(UUID) || [])[0]
    if (!id) return null
    return {
      kind: 'page',
      url: rawUrl,
      id,
      slug: segments[1].replace(id, '').replace(/-+$/, ''),
    }
  }

  return null
}

/** "lg-alliance-sponsorship-detail" → "LG Alliance Sponsorship Detail". */
export function deslugify(slug: string): string {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase()
      if (ACRONYMS.has(upper)) return upper
      if (/^\d+$/.test(word)) return word
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}

/** "opportunity" → "Opportunity", "accountName" → "Account Name". */
export function objectLabel(name: string): string {
  const spaced = String(name || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return deslugify(spaced.replace(/\s+/g, '-'))
}

/** Plural route segment to something a card can say: "opportunities" → "Opportunities". */
export function reportLabel(objectPlural: string): string {
  return objectLabel(objectPlural)
}

export function humanizeEnum(value?: string | null): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => {
      const upper = word.toUpperCase()
      return ACRONYMS.has(upper) ? upper : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

export function formatCardDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  // Award dates are stored at midnight UTC; reading them in UTC keeps a
  // March 15 value from showing as March 14.
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  }).format(date)
}

export type CardFacts = {
  /** The record's own name. Falls back to the slug when the CRM cannot be reached. */
  title: string
  /** "Opportunity", "Report · Opportunities", "Dashboard". */
  kind: string
  /** The account, status, owner and date lines — money is never among them. */
  facts?: (string | null | undefined)[]
}

/**
 * The Slack card. `unfurls` maps the exact URL Slack sent, so the shape the
 * user pasted is the key — a normalised one silently unfurls nothing.
 */
export function buildUnfurlCard(link: CrmLink, card: CardFacts): Record<string, unknown> {
  const context = [card.kind, ...(card.facts || [])]
    .map((part) => (part == null ? '' : String(part).trim()))
    .filter(Boolean)
    .join('  ·  ')

  return {
    color: '#002C73',
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*<${link.url}|${escapeMrkdwn(card.title)}>*` },
      },
      ...(context
        ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: escapeMrkdwn(context) }] }]
        : []),
    ],
  }
}

/** Slack mrkdwn takes these three literally; a deal name full of them should not. */
export function escapeMrkdwn(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** The card to show when the CRM cannot be reached — the link still says what it is. */
export function fallbackCard(link: CrmLink): CardFacts {
  if (link.kind === 'report') {
    return {
      title: deslugify(link.slug) || reportLabel(link.object),
      kind: `Report · ${reportLabel(link.object)}`,
    }
  }
  if (link.kind === 'page') {
    return { title: deslugify(link.slug) || 'ANC', kind: 'Dashboard' }
  }
  return { title: deslugify(link.slug) || objectLabel(link.object), kind: objectLabel(link.object) }
}
