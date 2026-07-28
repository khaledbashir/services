import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

const ALLOWED_CORS_ORIGINS = new Set([
  'https://crm.ancsports.net',
  'https://crm.basheer.app',
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
  // `/customer` + `/api/customer` bypass the staff-token gate and enforce
  // their own portal_session auth inside each route (lib/portal-auth.ts).
  // `/api/customer-users` (staff admin) is intentionally NOT listed here so
  // it stays behind the staff gate — note `/api/customer` uses a
  // route + '/' prefix match, so it does not leak onto `/api/customer-users`.
  const publicRoutes = ['/customer', '/api/customer', '/login', '/api/auth/login', '/api/auth/microsoft', '/api/auth/callback/microsoft-entra-id', '/workflow', '/api/workflow', '/portal', '/api/portal', '/portals', '/api/portals', '/client-portals/p', '/dealdeck', '/marketing-hub/concepts', '/brand-2026', '/api/forms', '/api/print-shipping-addresses', '/api/webhooks', '/api/showcase', '/api/cron', '/api/schedule/export', '/api/slack', '/api/codex', '/api/internal', '/api/elevenlabs', '/api/kb', '/api/walkthroughs/nocodb/hook', '/api/twenty-bridge', '/presentation', '/wrike-airtable-scope', '/anc-live-command', '/live', '/api/live-showcase', '/live-app.js', '/globe', '/leaflet', '/us-states.geojson', '/proof', '/api/proof-share', '/samples', '/api/public', '/transparency', '/dashboard/ops-overview', '/dashboard/design-content', '/d', '/api/dashboards', '/api/gamification', '/_next', '/favicon', '/ANC_Logo_2023_blue.png', '/ANC_Logo_2023_white.png', '/anc-wordmark-white.png', '/anc-wordmark-blue.png', '/api/marketing/track', '/api/marketing/unsubscribe', '/api/request-hub/intake', '/feature-vote.html', '/hub', '/api/hub', '/newsletter/view', '/ad-library', '/dealdeck', '/api/photos/shared', '/story', '/api/story', '/orientation-videos']
  
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return withCors(request, NextResponse.next())
  }
  
  // Protected routes - require authentication
  const token = request.cookies.get('token')?.value
  
  // Preserve the destination through the login bounce — a deep link into a
  // ticket/event/report must land THERE after sign-in, not on the dashboard.
  const loginWithReturn = () => {
    const url = new URL('/login', request.url)
    url.searchParams.set('redirect', pathname + (request.nextUrl.search || ''))
    return NextResponse.redirect(url)
  }

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return withCors(request, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return loginWithReturn()
  }

  const payload = await verifyJWT(token)
  if (!payload) {
    if (pathname.startsWith('/api/')) {
      return withCors(request, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
    }
    return loginWithReturn()
  }
  
  return withCors(request, NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|feature-vote\\.html).*)'],
}
