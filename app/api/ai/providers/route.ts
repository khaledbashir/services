import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'

interface ProviderConfig { name: string; baseUrl: string; apiKey: string; model: string }

function loadProviders(): Array<{ name: string; model: string }> {
  const raw = process.env.AI_PROVIDERS_JSON || ''
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as ProviderConfig[]
      const valid = parsed.filter(p => p?.baseUrl && p?.apiKey && p?.model)
      if (valid.length > 0) return valid.map(p => ({ name: p.name, model: p.model }))
    } catch {}
  }
  const model = process.env.AI_MODEL || 'default'
  return [{ name: 'default', model }]
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  return NextResponse.json({ providers: loadProviders() })
}
