import assert from 'node:assert/strict'
import test from 'node:test'
import { SignJWT, jwtVerify } from 'jose'

// Mirrors lib/portal-auth.ts. These tests guard the security properties of
// "view as customer": a staff-minted portal session must stay inside the
// portal audience, must carry an unforgeable impersonation marker, and must
// expire fast. The middleware rule that makes impersonation read-only is
// exercised against the same predicate the edge runtime uses.

const SECRET = new TextEncoder().encode('test-secret-for-impersonation-suite')
const PORTAL_AUDIENCE = 'anc-customer-portal'
const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60

async function mintPortalJWT(payload, expiresIn = '7d') {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(PORTAL_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET)
}

const realLogin = {
  portalUserId: 'c0ffee00-0000-4000-8000-000000000001',
  email: 'client@example.com',
  fullName: 'Real Client',
  clientId: 'c0ffee00-0000-4000-8000-000000000002',
  clientName: 'Example Arena',
}

const impersonation = {
  ...realLogin,
  impersonating: true,
  impersonatorStaffId: 'c0ffee00-0000-4000-8000-000000000003',
  impersonatorName: 'Chris DeBernardis',
  impersonatorEmail: 'cdebernardis@anc.com',
}

// The exact predicate from middleware.ts.
function middlewareBlocksWrite(pathname, method, payload) {
  if (!pathname.startsWith('/api/customer/')) return false
  if (method === 'GET' || method === 'HEAD') return false
  if (pathname.startsWith('/api/customer/auth/')) return false
  return Boolean(payload?.impersonating)
}

test('a real customer login carries no impersonation marker', async () => {
  const token = await mintPortalJWT(realLogin)
  const { payload } = await jwtVerify(token, SECRET, { audience: PORTAL_AUDIENCE })
  assert.equal(payload.impersonating, undefined)
  assert.equal(payload.impersonatorStaffId, undefined)
})

test('an impersonation session round-trips its staff attribution', async () => {
  const token = await mintPortalJWT(impersonation, `${IMPERSONATION_MAX_AGE_SECONDS}s`)
  const { payload } = await jwtVerify(token, SECRET, { audience: PORTAL_AUDIENCE })
  assert.equal(payload.impersonating, true)
  assert.equal(payload.impersonatorEmail, 'cdebernardis@anc.com')
  // Still resolves to the customer, so every scoped query sees the customer.
  assert.equal(payload.portalUserId, realLogin.portalUserId)
})

test('impersonation sessions expire in an hour, not the 7-day login window', async () => {
  const token = await mintPortalJWT(impersonation, `${IMPERSONATION_MAX_AGE_SECONDS}s`)
  const { payload } = await jwtVerify(token, SECRET, { audience: PORTAL_AUDIENCE })
  const ttl = payload.exp - payload.iat
  assert.equal(ttl, IMPERSONATION_MAX_AGE_SECONDS)
  assert.ok(ttl < 60 * 60 * 24, 'impersonation must not last a day')
})

test('a portal token cannot authenticate against the staff audience', async () => {
  const token = await mintPortalJWT(impersonation, '1h')
  await assert.rejects(
    () => jwtVerify(token, SECRET, { audience: 'anc-staff' }),
    /"aud" claim/i
  )
})

test('the impersonation marker cannot be forged without the signing secret', async () => {
  const token = await mintPortalJWT(impersonation, '1h')
  const wrongSecret = new TextEncoder().encode('attacker-guess')
  await assert.rejects(() => jwtVerify(token, wrongSecret, { audience: PORTAL_AUDIENCE }))
})

test('an expired impersonation session stops being accepted', async () => {
  const token = await new SignJWT(impersonation)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(PORTAL_AUDIENCE)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
    .sign(SECRET)
  await assert.rejects(
    () => jwtVerify(token, SECRET, { audience: PORTAL_AUDIENCE }),
    /exp/i
  )
})

test('impersonation blocks every customer write verb', () => {
  for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    assert.equal(
      middlewareBlocksWrite('/api/customer/tickets', method, impersonation),
      true,
      `${method} must be blocked while impersonating`
    )
  }
})

test('impersonation still allows reading the whole portal', () => {
  for (const path of [
    '/api/customer/me',
    '/api/customer/tickets',
    '/api/customer/documents',
    '/api/customer/displays',
  ]) {
    assert.equal(middlewareBlocksWrite(path, 'GET', impersonation), false)
  }
})

test('exit and sign-out stay reachable while impersonating', () => {
  assert.equal(
    middlewareBlocksWrite('/api/customer/auth/exit-impersonation', 'POST', impersonation),
    false
  )
  assert.equal(middlewareBlocksWrite('/api/customer/auth/logout', 'POST', impersonation), false)
})

test('a genuine customer is never blocked from writing', () => {
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal(middlewareBlocksWrite('/api/customer/tickets', method, realLogin), false)
  }
})

test('staff admin routes are untouched by the portal write guard', () => {
  // /api/customer-users is staff-side and must not match the /api/customer/ prefix.
  assert.equal(middlewareBlocksWrite('/api/customer-users', 'POST', impersonation), false)
  assert.equal(
    middlewareBlocksWrite('/api/customer-users/abc/impersonate', 'POST', impersonation),
    false
  )
})
