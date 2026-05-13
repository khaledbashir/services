import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const ALLOWED_CORS_ORIGINS = new Set([
  'https://crm.ancsports.net',
  'https://services.ancsports.net',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
])

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

function withCors(request: NextRequest, response: NextResponse) {
  if (!request.nextUrl.pathname.startsWith('/api/')) return response

  const origin = request.headers.get('origin')
  if (!origin || !ALLOWED_CORS_ORIGINS.has(origin)) return response

  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  response.headers.set('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept')
  response.headers.set('Vary', 'Origin')
  return response
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (request.method === 'OPTIONS' && pathname.startsWith('/api/')) {
    return withCors(request, new NextResponse(null, { status: 204 }))
  }

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
  // `/portals` is bypassed here; the page component at app/portals/[slug]/page.tsx
  // gates the admin (UUID slug) flow via getSession() and serves the public
  // (token slug) flow auth-less — which is the whole point of Nick's client portals.
  const publicRoutes = ['/login', '/api/auth/login', '/api/auth/microsoft', '/api/auth/callback/microsoft-entra-id', '/workflow', '/api/workflow', '/portal', '/api/portal', '/portals', '/api/portals', '/api/webhooks', '/api/showcase', '/api/cron', '/api/schedule/export', '/api/slack', '/api/internal', '/api/elevenlabs', '/api/kb', '/api/walkthroughs/nocodb/hook', '/presentation', '/wrike-airtable-scope', '/proof', '/api/proof-share', '/samples', '/api/public', '/transparency', '/dashboard/ops-overview', '/dashboard/design-content', '/d', '/api/dashboards', '/_next', '/favicon', '/ANC_Logo_2023_blue.png', '/ANC_Logo_2023_white.png']
  
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return withCors(request, NextResponse.next())
  }
  
  // Protected routes - require authentication
  const token = request.cookies.get('token')?.value
  
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return withCors(request, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  const payload = await verifyJWT(token)
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return withCors(request, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return NextResponse.redirect(new URL('/login', request.url))
  }
  
  return withCors(request, NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
