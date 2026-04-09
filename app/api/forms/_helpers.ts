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
