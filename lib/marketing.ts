import { NextRequest } from 'next/server'

export function cleanEmail(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

export function splitName(fullName: string): { firstName: string | null; lastName: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  if (parts.length === 1) return { firstName: parts[0], lastName: null }
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] }
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

export function normalizeHtml(input: string): string {
  const value = input.trim()
  if (!value) return ''
  if (/<[a-z][\s\S]*>/i.test(value)) return value
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p style="margin:0 0 16px;line-height:1.55">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

export function publicBaseUrl(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'services.ancsports.net'
  return `${proto}://${host}`.replace(/\/$/, '')
}

export function requestIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip')
}

export function buildNewsletterHtml(opts: {
  bodyHtml: string
  previewText?: string | null
  recipientId?: string
  baseUrl?: string
}): string {
  const preview = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.previewText)}</div>`
    : ''
  const tracking = opts.recipientId && opts.baseUrl
    ? `<img src="${opts.baseUrl}/api/marketing/track/open/${opts.recipientId}.png" width="1" height="1" alt="" style="display:none;width:1px;height:1px" />`
    : ''
  const unsubscribe = opts.recipientId && opts.baseUrl
    ? `<p style="margin:24px 0 0;font-size:11px;line-height:1.5;color:#64748b">You are receiving this because you are on an ANC Sports marketing list. <a href="${opts.baseUrl}/api/marketing/unsubscribe/${opts.recipientId}" style="color:#0A52EF">Unsubscribe</a></p>`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827">
    ${preview}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;padding:24px 0">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:640px;max-width:94%;background:#ffffff;border:1px solid #e5e7eb">
            <tr>
              <td style="background:#0b0b0d;color:#ffffff;padding:18px 22px;border-bottom:4px solid #e21b2d">
                <div style="font-size:20px;font-weight:700;letter-spacing:0">ANC Sports</div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:4px">Media & Partnerships</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 22px;font-size:15px;line-height:1.55;color:#1f2937">
                ${normalizeHtml(opts.bodyHtml)}
                ${unsubscribe}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    ${tracking}
  </body>
</html>`
}
