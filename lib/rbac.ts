import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-in-production')

export interface AuthUser {
  userId: string
  email: string
  fullName: string
  role: 'admin' | 'manager' | 'technician'
}

// Permission levels — higher includes all lower
const ROLE_LEVEL: Record<string, number> = {
  technician: 1,
  manager: 2,
  admin: 3,
}

/**
 * Extract authenticated user from request cookie.
 * Returns null if not authenticated.
 */
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  const token = request.cookies.get('token')?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      fullName: payload.fullName as string,
      role: payload.role as AuthUser['role'],
    }
  } catch {
    return null
  }
}

/**
 * Require authentication. Returns user or 401 response.
 */
export async function requireAuth(request: NextRequest): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(request)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return user
}

/**
 * Require a minimum role level. Returns user or 401/403 response.
 */
export async function requireRole(
  request: NextRequest,
  minRole: 'technician' | 'manager' | 'admin'
): Promise<AuthUser | NextResponse> {
  const result = await requireAuth(request)
  if (result instanceof NextResponse) return result

  const user = result
  if (ROLE_LEVEL[user.role] < ROLE_LEVEL[minRole]) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return user
}

/**
 * Check if a result from requireAuth/requireRole is an error response.
 */
export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse
}
