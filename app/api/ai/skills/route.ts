export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getSkills } from '@/lib/ai/registry'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const skills = await getSkills(auth.role)
  return NextResponse.json({
    skills: skills.map(s => ({
      name: s.name,
      description: s.description,
      category: s.category || 'Other',
      icon: s.icon || '⚙️',
      role: s.role || 'any',
    })),
  })
}
