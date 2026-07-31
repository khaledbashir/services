import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { scopePortalVenueIds } from '../lib/customer-portal-scope.ts'
import { buildProofEmailHtml } from '../lib/proof-share.ts'

test('customer venue scope defaults to all grants and narrows to one authorized venue', () => {
  const grants = ['venue-a', 'venue-b']
  assert.deepEqual(scopePortalVenueIds(grants), grants)
  assert.deepEqual(scopePortalVenueIds(grants, 'all'), grants)
  assert.deepEqual(scopePortalVenueIds(grants, 'venue-b'), ['venue-b'])
})

test('customer venue scope never widens to an unauthorized venue', () => {
  assert.deepEqual(scopePortalVenueIds(['venue-a'], 'venue-b'), [])
})

test('proof email contains the permanent review URL without expiration language', () => {
  const html = buildProofEmailHtml({
    recordName: 'Kia Center Ribbon Proof',
    proofUrl: 'https://services.ancsports.net/proof/permanent-token',
  })
  assert.match(html, /permanent-token/)
  assert.doesNotMatch(html, /expir(?:e|es|ed|ation)/i)
})

test('public proof access paths contain no expiration gate', async () => {
  const files = [
    '../app/api/proof-share/[token]/route.ts',
    '../app/api/proof-share/[token]/view/route.ts',
    '../app/api/proof-share/[token]/respond/route.ts',
    '../app/api/proof-share/[token]/client-upload/route.ts',
    '../app/api/proof-share/[token]/file/[attachmentId]/route.ts',
  ]
  for (const relative of files) {
    const source = await readFile(new URL(relative, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /expires_at\s+IS\s+NULL|proof link has expired|link expired/i, relative)
  }
})
