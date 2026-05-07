import crypto from 'crypto'

// Transparency dashboard tokens — signed HMAC payload that goes in the URL.
// One canonical link per stakeholder; revocable by rotating the secret or by
// embedding an `expires` timestamp.
//
// Token format: <payload_base64url>.<hmac_base64url>
//   payload = JSON { label, issued, expires? }

export interface TransparencyTokenPayload {
  label: string         // human-readable name for the link, e.g. "anc-team", "natalia-only"
  issued: number        // unix seconds when the link was minted
  expires?: number      // unix seconds when the link should stop working; omit for no expiry
}

function getSecret(): string {
  const s = process.env.TRANSPARENCY_LINK_SECRET
  if (!s) throw new Error('TRANSPARENCY_LINK_SECRET is not set')
  if (s.length < 32) throw new Error('TRANSPARENCY_LINK_SECRET must be at least 32 chars')
  return s
}

function b64urlEncode(buf: Buffer | string): string {
  const b = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf
  return b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

export function mintTransparencyToken(payload: TransparencyTokenPayload): string {
  const json = JSON.stringify(payload)
  const payloadPart = b64urlEncode(json)
  const sig = crypto.createHmac('sha256', getSecret()).update(payloadPart).digest()
  const sigPart = b64urlEncode(sig)
  return `${payloadPart}.${sigPart}`
}

export function verifyTransparencyToken(token: string): TransparencyTokenPayload | null {
  if (!token || typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot < 0) return null
  const payloadPart = token.slice(0, dot)
  const sigPart = token.slice(dot + 1)

  let expectedSig: Buffer
  try {
    expectedSig = crypto.createHmac('sha256', getSecret()).update(payloadPart).digest()
  } catch {
    return null
  }

  let providedSig: Buffer
  try {
    providedSig = b64urlDecode(sigPart)
  } catch {
    return null
  }

  if (providedSig.length !== expectedSig.length) return null
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) return null

  let payload: TransparencyTokenPayload
  try {
    payload = JSON.parse(b64urlDecode(payloadPart).toString('utf8'))
  } catch {
    return null
  }

  if (typeof payload.label !== 'string' || typeof payload.issued !== 'number') return null

  if (typeof payload.expires === 'number' && payload.expires > 0) {
    const now = Math.floor(Date.now() / 1000)
    if (now > payload.expires) return null
  }

  return payload
}
