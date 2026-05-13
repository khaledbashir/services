export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { query } from '@/lib/db'

// Public endpoint — the AnythingLLM agent skill calls this with an X-API-Key
// header (shared secret) since the chat session has no JWT. Default key
// is wired to the existing internal-AI bridge token so we don't add new env.
const API_KEY = process.env.ANC_DASHBOARD_API_KEY
  || process.env.OPENCLAW_INVOKE_TOKEN
  || ''

interface DashboardSpec {
  title: string
  subtitle?: string
  blocks: unknown[]
  theme?: 'light' | 'dark' | 'auto'
}

export async function POST(request: NextRequest) {
  const provided = request.headers.get('x-api-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!API_KEY || !provided || provided !== API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as Partial<DashboardSpec> & { spec?: DashboardSpec; createdBy?: string }
  // Allow either a top-level spec or a wrapped { spec } payload
  const spec: DashboardSpec = (body.spec || body) as DashboardSpec
  if (!spec || !spec.title || !Array.isArray(spec.blocks)) {
    return NextResponse.json({ error: 'Spec needs title + blocks[]' }, { status: 400 })
  }
  if (spec.blocks.length > 60) {
    return NextResponse.json({ error: 'Too many blocks (max 60)' }, { status: 400 })
  }

  const token = randomBytes(12).toString('base64url')
  const createdBy = (body.createdBy || 'anc-advisor').slice(0, 80)
  // 30-day default expiry
  const expiresAt = new Date(Date.now() + 30 * 86_400_000)

  await query(
    `INSERT INTO ai_dashboards (token, title, subtitle, spec, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [token, spec.title.slice(0, 200), spec.subtitle?.slice(0, 300) || null, JSON.stringify(spec), createdBy, expiresAt]
  )

  const origin = process.env.PUBLIC_BASE_URL || 'https://services.ancsports.net'
  return NextResponse.json({
    token,
    url: `${origin}/d/${token}`,
    expires_at: expiresAt.toISOString(),
  })
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: 'POST a {title, subtitle, blocks[]} spec with X-API-Key header' })
}
