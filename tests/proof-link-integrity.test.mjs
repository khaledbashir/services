import assert from 'node:assert/strict'
import test from 'node:test'
import { isManagedProofUrl, selectLegacyProofUrl } from '../lib/proof-url.ts'

// Regression guard for the Citizens Bank 2026 / FIFA 2026 - New York failure
// (reported 2026-08-24). Moving that ticket to Client Review minted a managed
// proof share with no files behind it and overwrote the ticket's working
// workspace link. The client-facing page then fell back to `ftp_proof_link`,
// which by then held the proof page's OWN url — so the only card on the page
// linked to the page the client was already on, and the proof read as dead.

test('managed proof pages are recognised across every host we serve from', () => {
  assert.equal(isManagedProofUrl('https://services.ancsports.net/proof/omDxc9XoG9Eie5f9e-DQI9MyD4mJTzil'), true)
  assert.equal(isManagedProofUrl('https://abc-anc-services.izcgmb.easypanel.host/proof/abc123'), true)
  assert.equal(isManagedProofUrl('http://localhost:44389/proof/abc123'), true)
  assert.equal(isManagedProofUrl('https://services.ancsports.net/proof/abc123/'), true)
})

test('anything that is not a managed proof page is left alone', () => {
  assert.equal(isManagedProofUrl('https://workspace.anc.com/File?path=9bf1fbe3-0c40-4ae9-bc4d-5270b76acfa6'), false)
  assert.equal(isManagedProofUrl('https://services.ancsports.net/designs/6193e8fd'), false)
  assert.equal(isManagedProofUrl('https://services.ancsports.net/proof/abc/extra'), false)
  assert.equal(isManagedProofUrl('T:\\M\\MET\\MET-NYG\\Approved\\2026\\Citizens Bank 2026'), false)
  assert.equal(isManagedProofUrl(''), false)
  assert.equal(isManagedProofUrl(null), false)
  assert.equal(isManagedProofUrl(undefined), false)
})

test('a converted ticket falls back to the stashed workspace link, never to itself', () => {
  // Exactly the Citizens Bank row: managed url in ftp_proof_link, the real
  // workspace link moved aside into legacy_ftp_proof_link.
  assert.equal(
    selectLegacyProofUrl(
      'https://workspace.anc.com/File?path=9bf1fbe3-0c40-4ae9-bc4d-5270b76acfa6',
      'https://services.ancsports.net/proof/omDxc9XoG9Eie5f9e-DQI9MyD4mJTzil'
    ),
    'https://workspace.anc.com/File?path=9bf1fbe3-0c40-4ae9-bc4d-5270b76acfa6'
  )
})

test('an unconverted ticket still serves the workspace link sitting in ftp_proof_link', () => {
  // The ~12k tickets that never went through a Client Review transition.
  assert.equal(
    selectLegacyProofUrl(null, 'https://workspace.anc.com/File?path=235b211a-1671-4fbc-ba50-0bec72b2da17'),
    'https://workspace.anc.com/File?path=235b211a-1671-4fbc-ba50-0bec72b2da17'
  )
})

test('a ticket whose only link is the managed page offers no fallback card', () => {
  // The self-referential loop. Returning the managed url here is the bug.
  assert.equal(
    selectLegacyProofUrl(null, 'https://services.ancsports.net/proof/omDxc9XoG9Eie5f9e-DQI9MyD4mJTzil'),
    null
  )
  assert.equal(selectLegacyProofUrl(null, null), null)
  assert.equal(selectLegacyProofUrl('', ''), null)
})

test('a managed url stashed in the legacy column is still refused', () => {
  // Defensive: a double conversion must not resurrect the self-link.
  assert.equal(
    selectLegacyProofUrl(
      'https://services.ancsports.net/proof/aaa',
      'https://services.ancsports.net/proof/bbb'
    ),
    null
  )
})
