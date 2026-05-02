import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { loadProviders } from '@/lib/ai/agent'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  // Featured providers (Mercury, MiMo) sort to the top so they're not buried
  // under the long AI_PROVIDERS_JSON list. Within each tier, preserve the
  // input order (which already runs through providerPriority for the bulk
  // pool).
  const all = loadProviders()
  const featured = all.filter(p => p.featured)
  const rest = all.filter(p => !p.featured)
  const ordered = [...featured, ...rest]

  const providers = ordered.map((p) => ({
    name: p.name,
    label: p.label || p.name,
    model: p.model,
    availableModels: p.availableModels && p.availableModels.length > 0 ? p.availableModels : [p.model],
    featured: !!p.featured,
  }))

  return NextResponse.json({ providers })
}
