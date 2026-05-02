import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { loadProviders } from '@/lib/ai/agent'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const providers = loadProviders().map((p) => ({
    name: p.name,
    label: p.label || p.name,
    model: p.model,
    availableModels: p.availableModels && p.availableModels.length > 0 ? p.availableModels : [p.model],
  }))

  return NextResponse.json({ providers })
}
