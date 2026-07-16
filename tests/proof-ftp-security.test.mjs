import assert from 'node:assert/strict'
import test from 'node:test'
import {
  archiveSupersededProofDecisions,
  buildFtpAttachmentId,
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

test('same-name proof replacement archives the prior approval and clears the active decision', () => {
  const previous = [{ name: 'review.mp4', size: 100, modifiedAt: '2026-07-09T12:00:00.000Z', kind: 'video', sourceVersion: 'r1', active: true }]
  const current = [{ ...previous[0], size: 120, modifiedAt: '2026-07-10T12:00:00.000Z', sourceVersion: 'r2' }]
  const reconciled = reconcileProofManifest(previous, current, '2026-07-10T12:01:00.000Z')
  const id = buildFtpAttachmentId('review.mp4')
  const archived = archiveSupersededProofDecisions({
    previous,
    manifest: reconciled.manifest,
    fileResponses: { [id]: { response: 'approved', note: 'Approved R1', at: '2026-07-09T15:00:00.000Z' } },
    archivedAt: '2026-07-10T12:01:00.000Z',
  })
  assert.equal(archived.fileResponses[id], undefined)
  assert.equal(archived.manifest[0].approvalHistory.length, 1)
  assert.equal(archived.manifest[0].approvalHistory[0].sourceVersion, 'r1')
  assert.equal(archived.manifest[0].approvalHistory[0].response, 'approved')
})

test('renamed R2 proof preserves R1 approval while the new file remains pending', () => {
  const previous = [{ name: 'review-R1.pdf', size: 100, modifiedAt: '2026-07-09T12:00:00.000Z', kind: 'pdf', sourceVersion: 'r1', active: true }]
  const current = [{ name: 'review-R2.pdf', size: 120, modifiedAt: '2026-07-10T12:00:00.000Z', kind: 'pdf', sourceVersion: 'r2', active: true }]
  const reconciled = reconcileProofManifest(previous, current, '2026-07-10T12:01:00.000Z')
  const oldId = buildFtpAttachmentId('review-R1.pdf')
  const newId = buildFtpAttachmentId('review-R2.pdf')
  const archived = archiveSupersededProofDecisions({
    previous,
    manifest: reconciled.manifest,
    fileResponses: { [oldId]: { response: 'approved', at: '2026-07-09T15:00:00.000Z' } },
    archivedAt: '2026-07-10T12:01:00.000Z',
  })
  assert.equal(archived.fileResponses[oldId], undefined)
  assert.equal(archived.fileResponses[newId], undefined)
  assert.equal(archived.manifest.find((entry) => entry.name === 'review-R1.pdf').approvalHistory[0].response, 'approved')
  assert.equal(archived.manifest.find((entry) => entry.name === 'review-R2.pdf').active, true)
})

test('host key verification accepts only the pinned SHA-256 fingerprint', () => {
  const key = Buffer.from('trusted-test-host-key')
  const fingerprint = fingerprintHostKey(key)
  assert.equal(normalizeFingerprint(`SHA256:${fingerprint}=`), fingerprint)
  assert.equal(verifyPinnedHostKey(key, fingerprint), true)
  assert.equal(verifyPinnedHostKey(Buffer.from('different-key'), fingerprint), false)
})
