import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

// Edge runtime compatible JWT verification
async function verifyJWT(token: string): Promise<any | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const verified = await jwtVerify(token, secret)
    return verified.payload
  } catch (err) {
    return null
  }
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Normalize accidental double slashes before Next.js routing kicks in.
  // Without this, paths like //events/discovery-log can be treated like
  // protocol-relative URLs during client navigation and trigger SecurityError.
  const normalizedPathname = pathname.replace(/\/{2,}/g, '/')
  if (normalizedPathname !== pathname) {
    const url = request.nextUrl.clone()
    url.pathname = normalizedPathname
    return NextResponse.redirect(url)
  }
  
  // Public routes that don't require auth
  const publicRoutes = ['/login', '/api/auth/login', '/workflow', '/api/workflow', '/portal', '/api/portal', '/api/webhooks', '/api/showcase', '/api/cron', '/api/schedule/export', '/api/slack', '/api/internal', '/api/kb', '/presentation', '/proof', '/api/proof-share', '/_next', '/favicon', '/ANC_Logo_2023_blue.png', '/ANC_Logo_2023_white.png']
  
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next()
  }
  
  // Protected routes - require authentication
  const token = request.cookies.get('token')?.value
  
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  const payload = await verifyJWT(token)
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
