import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export interface VoiceStaff {
  id: string
  email: string
  fullName: string
  role: string
}

export interface VoiceAuthOk {
  ok: true
  staff: VoiceStaff | null
}

export interface VoiceAuthFail {
  ok: false
  response: NextResponse
}

export type VoiceAuthResult = VoiceAuthOk | VoiceAuthFail

function readSecretCandidates(request: NextRequest): string[] {
  const out: string[] = []
  const direct = request.headers.get('x-webhook-secret')
  if (direct) out.push(direct)
  const bearer = request.headers.get('authorization')
  if (bearer?.startsWith('Bearer ')) out.push(bearer.slice(7))
  // ElevenLabs sometimes swaps secret label and value; accept any header value match.
  for (const [, value] of request.headers.entries()) out.push(value)
  return out
}

function readStaffEmail(request: NextRequest, fallback: string | null): string | null {
  const headerEmail = request.headers.get('x-staff-email')
  if (headerEmail) return headerEmail.trim().toLowerCase()
  if (fallback) return fallback.trim().toLowerCase()
  return null
}

const VOICE_FALLBACK_EMAIL = 'voice-agent@ancsports.net'

async function resolveStaff(email: string | null): Promise<VoiceStaff | null> {
  // Fall back to the Voice Agent system identity when no email is provided
  // OR the supplied email isn't a real staff member (dashboard testing path).
  // Production embed should override with the logged-in user's email so
  // tickets attribute correctly; this just keeps the agent functional.
  const lookup = email
    ? await query(
        `SELECT id, full_name, email, role FROM staff WHERE LOWER(email) = $1 AND is_active = true LIMIT 1`,
        [email]
      )
    : { rows: [] as Array<{ id: string; full_name: string; email: string; role: string }> }

  let row = lookup.rows[0]
  if (!row) {
    const fallback = await query(
      `SELECT id, full_name, email, role FROM staff WHERE email = $1 AND is_active = true LIMIT 1`,
      [VOICE_FALLBACK_EMAIL]
    )
    row = fallback.rows[0]
  }
  if (!row) return null
  return { id: row.id, fullName: row.full_name, email: row.email, role: row.role }
}

export async function authorizeVoiceCall(
  request: NextRequest,
  bodyStaffEmail: string | null = null
): Promise<VoiceAuthResult> {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET
  if (!secret) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'webhook_secret_not_configured' }, { status: 503 }),
    }
  }

  const candidates = readSecretCandidates(request)
  if (!candidates.some(c => c === secret || c === `Bearer ${secret}`)) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }),
    }
  }

  const staff = await resolveStaff(readStaffEmail(request, bodyStaffEmail))
  return { ok: true, staff }
}

export function moneyLabel(value?: { amountMicros: number; currencyCode: string } | null): string | null {
  if (!value || typeof value.amountMicros !== 'number') return null
  const amount = value.amountMicros / 1_000_000
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: value.currencyCode || 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function compactDate(value?: string | null): string | null {
  if (!value) return null
  return value.slice(0, 10)
}

export function containsFilter(field: string, value: string): string {
  const safe = encodeURIComponent(value.replace(/"/g, '').replace(/%/g, ''))
  return `${field}[ilike]:"%25${safe}%25"`
}

export function cleanQuery(value: string | null | undefined, max = 120): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}
