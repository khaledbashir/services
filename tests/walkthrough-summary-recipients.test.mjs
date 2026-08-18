import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeSummaryRecipients, parseRecipientList } from '../lib/venue-walkthroughs.ts'

// Joe 2026-08-17: "once a walk-thru is submitted a summary gets received by the
// same emails in the ticket system." That is the venue's own distribution list —
// the one every Case email goes to — with ops leadership merged on top, because
// most venues have no list yet and a submitted walk must never reach nobody.

test('venue list leads, ops list follows', () => {
  assert.deepEqual(
    mergeSummaryRecipients(['ops@ravens.com'], ['joeo@anc.com', 'cdinh@anc.com']),
    ['ops@ravens.com', 'joeo@anc.com', 'cdinh@anc.com'],
  )
})

test('a venue with no list still reaches ops', () => {
  assert.deepEqual(
    mergeSummaryRecipients([], ['joeo@anc.com']),
    ['joeo@anc.com'],
  )
})

test('someone on both lists is mailed once, in the spelling seen first', () => {
  assert.deepEqual(
    mergeSummaryRecipients(['Joe.O@anc.com', 'ops@ravens.com'], ['joe.o@anc.com', 'cdinh@anc.com']),
    ['Joe.O@anc.com', 'ops@ravens.com', 'cdinh@anc.com'],
  )
})

test('a duplicate inside one list is collapsed too', () => {
  assert.deepEqual(
    mergeSummaryRecipients(['ops@ravens.com', 'ops@ravens.com'], []),
    ['ops@ravens.com'],
  )
})

test('blanks and non-addresses in a stored list are dropped, not mailed', () => {
  assert.deepEqual(
    mergeSummaryRecipients(['', '  ', 'not-an-email', ' ops@ravens.com '], []),
    ['ops@ravens.com'],
  )
})

test('recipient strings split on commas, semicolons and whitespace alike', () => {
  assert.deepEqual(
    parseRecipientList('a@anc.com, b@anc.com;c@anc.com  d@anc.com'),
    ['a@anc.com', 'b@anc.com', 'c@anc.com', 'd@anc.com'],
  )
})

test('an empty override string yields nobody — a deliberate opt-out, not a fallback', () => {
  assert.deepEqual(parseRecipientList(''), [])
  assert.deepEqual(parseRecipientList(null), [])
})
