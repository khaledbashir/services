/**
 * The history block on ticket notification emails (Jireh, 2026-08-21).
 *
 * The rule these tests exist to hold: a notification goes to the venue's
 * distribution list, so the trail may only repeat what that list was already
 * emailed — public comments and status changes. An internal note reaching a
 * client is the failure mode worth a test suite.
 *
 *   npm run test:ticket-history
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HISTORY_LIMIT,
  buildTicketHistory,
  describeStatusChange,
  humanizeTicketStatus,
  summarizeComment,
  formatHistoryTimestamp,
  ticketHistoryHtml,
} from '../lib/ticket-history.ts'
import { formatTicketUpdateTimestamp } from '../lib/ticket-update-byline.ts'

// ------------------------------------------------------------------ wording
test('a status reads as English, not as a column value', () => {
  assert.equal(humanizeTicketStatus('in_progress'), 'In Progress')
  assert.equal(humanizeTicketStatus('on_hold'), 'On Hold')
  assert.equal(humanizeTicketStatus('new'), 'New')
  assert.equal(humanizeTicketStatus(''), '')
  assert.equal(humanizeTicketStatus(null), '')
})

// The exact line from the Capital One Arena email he forwarded.
test('rewrites the line that went out as "new → in_progress"', () => {
  assert.equal(describeStatusChange('new', 'in_progress'), 'Status updated: New → In Progress')
})

test('says where it landed even when it does not know where it came from', () => {
  assert.equal(describeStatusChange(null, 'closed'), 'Status updated: Closed')
  assert.equal(describeStatusChange('new', null), '')
})

// ----------------------------------------------------------------- comments
test('a comment is summarised on one line, without its markup', () => {
  assert.equal(
    summarizeComment('<p>Ticker is back up.</p>\n\n  <b>Rebooted</b> the processor.'),
    'Ticker is back up. Rebooted the processor.',
  )
})

test('a long comment is cut on a word, not mid-word', () => {
  const long = `${'word '.repeat(120)}end`
  const out = summarizeComment(long)
  assert.ok(out.length <= 244, out.length)
  assert.ok(out.endsWith('…'), out.slice(-20))
  assert.ok(!out.includes('  '))
})

// -------------------------------------------------------------- the trail
const COMMENTS = [
  { body: 'Tech dispatched, ETA 40 minutes.', author_name: 'Chris DeBernardis', created_at: '2026-08-21T13:30:00Z' },
  { body: 'Confirmed the ticker is dark on the east side.', author_name: 'Jireh Billings', created_at: '2026-08-20T21:00:00Z' },
]
const ACTIVITY = [
  { action: 'ticket_status_change', details: { old_status: 'new', new_status: 'in_progress' }, author_name: 'Chris DeBernardis', created_at: '2026-08-21T14:03:00Z' },
  { action: 'ticket_priority_change', details: { old_priority: 'low', new_priority: 'high' }, created_at: '2026-08-21T13:00:00Z' },
  { action: 'ticket_category_change', details: { old_category: 'a', new_category: 'b' }, created_at: '2026-08-20T22:00:00Z' },
]

test('reads newest first, across both sources', () => {
  const entries = buildTicketHistory(COMMENTS, ACTIVITY)
  assert.deepEqual(entries.map((e) => e.what), [
    'Status updated: New → In Progress',
    'Tech dispatched, ETA 40 minutes.',
    'Confirmed the ticker is dark on the east side.',
  ])
})

// The whole safety argument: only what already emailed this list.
test('carries no activity the client was never emailed about', () => {
  const entries = buildTicketHistory([], ACTIVITY)
  assert.equal(entries.length, 1)
  assert.ok(!JSON.stringify(entries).includes('priority'))
  assert.ok(!JSON.stringify(entries).includes('category'))
})

test('does not repeat the update the email is announcing', () => {
  const entries = buildTicketHistory(COMMENTS, ACTIVITY, {
    exclude: 'Status updated: New → In Progress',
  })
  assert.deepEqual(entries.map((e) => e.what), [
    'Tech dispatched, ETA 40 minutes.',
    'Confirmed the ticker is dark on the east side.',
  ])
})

test('stops at the limit rather than reprinting the whole ticket', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    body: `Comment ${i}`,
    author_name: 'Chris DeBernardis',
    created_at: new Date(Date.UTC(2026, 7, 1 + i)).toISOString(),
  }))
  assert.equal(buildTicketHistory(many, []).length, HISTORY_LIMIT)
})

test('an entry with an unreadable body is dropped, not rendered blank', () => {
  const entries = buildTicketHistory([{ body: '   ', author_name: 'X', created_at: '2026-08-21T10:00:00Z' }], [])
  assert.deepEqual(entries, [])
})

test('parses details that arrive as a JSON string', () => {
  const entries = buildTicketHistory([], [
    { action: 'ticket_status_change', details: JSON.stringify({ old_status: 'in_progress', new_status: 'closed' }), created_at: '2026-08-21T15:00:00Z' },
  ])
  assert.equal(entries[0].what, 'Status updated: In Progress → Closed')
})

// ------------------------------------------------------------------- render
test('renders nothing at all when there is no history', () => {
  assert.equal(ticketHistoryHtml([]), '')
  assert.equal(ticketHistoryHtml(null), '')
})

test('renders the trail under a heading, newest first', () => {
  const html = ticketHistoryHtml(buildTicketHistory(COMMENTS, ACTIVITY))
  assert.ok(html.includes('Earlier on this ticket'))
  assert.ok(html.indexOf('Status updated: New → In Progress') < html.indexOf('Tech dispatched'))
  assert.ok(html.includes('Chris DeBernardis'))
})

test('escapes what a person typed', () => {
  const html = ticketHistoryHtml([
    { at: '2026-08-21T10:00:00Z', who: '<script>x</script>', what: 'Ticker & board <b>down</b>' },
  ])
  assert.ok(!html.includes('<script>'))
  assert.ok(html.includes('&amp;'))
  assert.ok(html.includes('&lt;b&gt;down&lt;/b&gt;'))
})

test('says how much it left out, and only when it left something out', () => {
  const entries = buildTicketHistory(COMMENTS, ACTIVITY)
  assert.ok(ticketHistoryHtml(entries, { more: 3 }).includes('and 3 earlier updates.'))
  assert.ok(ticketHistoryHtml(entries, { more: 1 }).includes('and 1 earlier update.'))
  assert.ok(!ticketHistoryHtml(entries, { more: 0 }).includes('earlier update'))
})

// The heading and the trail below it must stamp a time the same way, or one
// email carries two date formats.
test('stamps a time exactly as the update heading does', () => {
  for (const at of ['2026-08-21T14:03:00Z', '2026-01-02T05:00:00Z', '2026-07-04T23:59:00Z']) {
    assert.equal(formatHistoryTimestamp(at), formatTicketUpdateTimestamp(at))
  }
  assert.equal(formatHistoryTimestamp('not a date'), '')
})
