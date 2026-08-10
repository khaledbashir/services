import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { scopePortalVenueIds } from '../lib/customer-portal-scope.ts'
import { selectPortalAccessClient } from '../lib/portal-user-access.ts'
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

test('portal access can span venues owned by different active clients', () => {
  const selectedClient = selectPortalAccessClient(
    ['venue-a', 'venue-b'],
    [
      { venue_id: 'venue-a', client_id: 'client-a', client_name: 'Alpha', relation_type: 'primary' },
      { venue_id: 'venue-b', client_id: 'client-b', client_name: 'Bravo', relation_type: 'primary' },
    ]
  )

  assert.deepEqual(selectedClient, { id: 'client-a', name: 'Alpha' })
})

test('portal access accepts a venue associated with multiple active clients', () => {
  const selectedClient = selectPortalAccessClient(
    ['venue-a'],
    [
      { venue_id: 'venue-a', client_id: 'client-b', client_name: 'Bravo', relation_type: 'secondary' },
      { venue_id: 'venue-a', client_id: 'client-a', client_name: 'Alpha', relation_type: 'primary' },
    ]
  )

  assert.deepEqual(selectedClient, { id: 'client-a', name: 'Alpha' })
})

test('editing portal access preserves the current client label when still represented', () => {
  const selectedClient = selectPortalAccessClient(
    ['venue-a', 'venue-b'],
    [
      { venue_id: 'venue-a', client_id: 'client-a', client_name: 'Alpha', relation_type: 'primary' },
      { venue_id: 'venue-b', client_id: 'client-b', client_name: 'Bravo', relation_type: 'primary' },
    ],
    'client-b'
  )

  assert.deepEqual(selectedClient, { id: 'client-b', name: 'Bravo' })
})

test('portal access still rejects an active venue with no active client association', () => {
  assert.throws(
    () => selectPortalAccessClient(['venue-a', 'venue-b'], [
      { venue_id: 'venue-a', client_id: 'client-a', client_name: 'Alpha', relation_type: 'primary' },
    ]),
    /CLIENT_NOT_FOUND/
  )
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
