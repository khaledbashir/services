/**
 * Shared helpers for public form submission → Twenty CRM
 */

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

export async function twentyCreate<T = any>(
  endpoint: string,
  body: Record<string, unknown>
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  if (!TWENTY_API_KEY) {
    return { ok: false, error: 'TWENTY_API_KEY is not configured on the server', status: 500 }
  }
  try {
    const res = await fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TWENTY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) {
      const msg =
        data?.messages?.[0] || data?.error || `Twenty returned ${res.status}`
      return { ok: false, error: String(msg), status: res.status }
    }
    return { ok: true, data }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error', status: 500 }
  }
}

/**
 * Basic server-side validation + sanitization for form submissions
 */
export function requireFields(
  body: Record<string, any>,
  fields: string[]
): { ok: true } | { ok: false; error: string } {
  for (const f of fields) {
    if (body[f] == null || String(body[f]).trim() === '') {
      return { ok: false, error: `Field "${f}" is required` }
    }
  }
  return { ok: true }
}

export function str(v: unknown, max = 500): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s) return undefined
  return s.slice(0, max)
}

/**
 * Look up a company by matching the email's domain against stored domain/venue/name.
 * Returns { id, name } or null if no confident match. Used by intake forms so users
 * don't have to type the client name — just the email.
 */
export async function lookupCompanyByEmail(
  email: string
): Promise<{ id: string; name: string; domain: string } | null> {
  if (!TWENTY_API_KEY) return null
  const at = email.indexOf('@')
  if (at < 0) return null
  const rawDomain = email.slice(at + 1).toLowerCase().trim()
  if (!rawDomain) return null

  // Strip common free-mail domains — those aren't client matches
  const FREE_MAIL = new Set([
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
    'aol.com', 'proton.me', 'protonmail.com', 'me.com',
  ])
  if (FREE_MAIL.has(rawDomain)) return null

  // Try exact domain match first, then root-domain match (e.g. "tickets.mlb.com" → "mlb.com")
  const parts = rawDomain.split('.')
  const candidates: string[] = [rawDomain]
  if (parts.length > 2) candidates.push(parts.slice(-2).join('.'))

  try {
    for (const d of candidates) {
      const res = await fetch(
        `${TWENTY_BASE}/rest/companies?filter=domainName.primaryLinkUrl[ilike]:"%25${d}%25"&limit=5`,
        { headers: { Authorization: `Bearer ${TWENTY_API_KEY}` } }
      )
      if (!res.ok) continue
      const json = await res.json()
      const hit = (json?.data?.companies || [])[0]
      if (hit?.id) return { id: hit.id, name: hit.name || '', domain: d }
    }
  } catch {
    // fall through
  }
  return null
}

/**
 * Given a venue id, return its address + contact info so a form can auto-fill
 * shipping/contact fields. Returns null if not found.
 */
export async function lookupVenueDetails(
  venueId: string
): Promise<{
  id: string
  name: string
  addressStreet1?: string
  addressCity?: string
  addressState?: string
  addressPostcode?: string
  contactName?: string
  contactEmail?: string
} | null> {
  if (!TWENTY_API_KEY) return null
  try {
    const res = await fetch(`${TWENTY_BASE}/rest/venues/${venueId}`, {
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
    })
    if (!res.ok) return null
    const json = await res.json()
    const v = json?.data?.venue
    if (!v?.id) return null
    return {
      id: v.id,
      name: v.name,
      addressStreet1: v.address?.addressStreet1 || undefined,
      addressCity: v.address?.addressCity || undefined,
      addressState: v.address?.addressState || undefined,
      addressPostcode: v.address?.addressPostcode || undefined,
      contactName: v.contactName || undefined,
      contactEmail: v.contactEmail || undefined,
    }
  } catch {
    return null
  }
}
