import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildSourceVersion,
  fingerprintHostKey,
  isPathWithinRoots,
  isRegularListingType,
  normalizeFingerprint,
  parseAllowedRoots,
  reconcileProofManifest,
  validateProofFile,
  verifyPinnedHostKey,
} from '../lib/proof-ftp.ts'

test('allowed roots are explicit, normalized, and never accept server root', () => {
  assert.deepEqual(parseAllowedRoots('/A, /T/TIN/;\\T\\TWO\n/'), ['/A', '/T/TIN', '/T/TWO'])
})

test('path allowlisting rejects sibling prefixes and traversal', () => {
  const roots = ['/A', '/T/TIN']
  assert.equal(isPathWithinRoots('/A/client/proofs', roots), true)
  assert.equal(isPathWithinRoots('/T/TIN', roots), true)
  assert.equal(isPathWithinRoots('/T/TIN-NYC', roots), false)
  assert.equal(isPathWithinRoots('/A/../administrator', roots), false)
  assert.equal(isPathWithinRoots('/administrator', roots), false)
})

test('directory listings reject symlinks and unknown node types', () => {
  assert.equal(isRegularListingType('d'), true)
  assert.equal(isRegularListingType('-'), true)
  assert.equal(isRegularListingType('l'), false)
  assert.equal(isRegularListingType('s'), false)
})

test('proof file policy rejects unsafe names, formats, and sizes', () => {
  assert.deepEqual(validateProofFile('review.mp4', 20_000_000, 50_000_000), { ok: true, kind: 'video' })
  assert.equal(validateProofFile('../private.mp4', 10, 100).ok, false)
  assert.equal(validateProofFile('archive.zip', 10, 100).ok, false)
  assert.equal(validateProofFile('oversized.pdf', 101, 100).ok, false)
  assert.equal(validateProofFile('empty.png', 0, 100).ok, false)
})

test('source version deduplicates unchanged metadata and changes on revision', () => {
  const first = buildSourceVersion('review.mp4', 100, '2026-07-09T12:00:00.000Z')
  assert.equal(first, buildSourceVersion('review.mp4', 100, '2026-07-09T12:00:00.000Z'))
  assert.notEqual(first, buildSourceVersion('review.mp4', 101, '2026-07-09T12:00:00.000Z'))
  assert.notEqual(first, buildSourceVersion('review.mp4', 100, '2026-07-10T12:00:00.000Z'))
})

test('manual sync deduplicates, versions replacements, and soft-unpublishes missing files', () => {
  const previous = [
    { name: 'same.mp4', size: 100, modifiedAt: '2026-07-09T12:00:00.000Z', kind: 'video', sourceVersion: 'same', active: true },
    { name: 'changed.pdf', size: 100, modifiedAt: '2026-07-09T12:00:00.000Z', kind: 'pdf', sourceVersion: 'old', active: true },
    { name: 'gone.png', size: 100, modifiedAt: '2026-07-09T12:00:00.000Z', kind: 'image', sourceVersion: 'gone', active: true },
  ]
  const current = [
    { ...previous[0], active: true },
    { ...previous[1], sourceVersion: 'new', active: true },
    { name: 'added.mp4', size: 200, modifiedAt: '2026-07-10T12:00:00.000Z', kind: 'video', sourceVersion: 'added', active: true },
  ]
  const result = reconcileProofManifest(previous, current, '2026-07-12T12:00:00.000Z')
  assert.deepEqual(
    { added: result.added, updated: result.updated, removed: result.removed, unchanged: result.unchanged },
    { added: 1, updated: 1, removed: 1, unchanged: 1 }
  )
  assert.equal(result.manifest.find((entry) => entry.name === 'changed.pdf').previousSourceVersion, 'old')
  assert.equal(result.manifest.find((entry) => entry.name === 'gone.png').active, false)
  assert.equal(result.manifest.find((entry) => entry.name === 'gone.png').removedAt, '2026-07-12T12:00:00.000Z')
})

test('host key verification accepts only the pinned SHA-256 fingerprint', () => {
  const key = Buffer.from('trusted-test-host-key')
  const fingerprint = fingerprintHostKey(key)
  assert.equal(normalizeFingerprint(`SHA256:${fingerprint}=`), fingerprint)
  assert.equal(verifyPinnedHostKey(key, fingerprint), true)
  assert.equal(verifyPinnedHostKey(Buffer.from('different-key'), fingerprint), false)
})
