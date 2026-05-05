import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'

// GET /api/auth/me — returns the current authenticated user.
// The walkthrough form (and others) call this to auto-fill the
// technician name when localStorage hasn't been seeded by the dashboard
// layout (e.g., user signed in but never visited a page that hydrates it).
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ user: null }, { status: 200 })
  return NextResponse.json({
    user: {
      userId: user.userId,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    },
  })
}
