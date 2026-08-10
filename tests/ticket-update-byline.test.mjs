import assert from 'node:assert/strict'
import test from 'node:test'
import { ticketUpdateByline, formatTicketUpdateTimestamp } from '../lib/ticket-update-byline.ts'

// Fixed instant: 2026-08-10T23:45:00Z === Aug 10 2026, 7:45 PM ET (EDT, UTC-4)
const INSTANT = '2026-08-10T23:45:00.000Z'

test('a comment byline names the author and stamps Eastern time', () => {
  const byline = ticketUpdateByline('Charlie Dinh', INSTANT)
  assert.match(byline, /Charlie Dinh/)
  assert.match(byline, /Aug 10, 2026/)
  assert.match(byline, /7:45/)
  assert.match(byline, /PM ET/)
})

test('the stamp stays Eastern regardless of the host timezone', () => {
  const stamp = formatTicketUpdateTimestamp(INSTANT)
  assert.match(stamp, /^Aug 10, 2026 at 7:45/)
  assert.match(stamp, /PM ET$/)
})

test('a missing author still produces a timestamp', () => {
  const byline = ticketUpdateByline(null, INSTANT)
  assert.match(byline, /Aug 10, 2026/)
  assert.doesNotMatch(byline, /·/)
})

test('a blank author name is not rendered as an empty separator', () => {
  const byline = ticketUpdateByline('   ', INSTANT)
  assert.doesNotMatch(byline, /·/)
})

test('author names are HTML escaped so a name can never inject markup', () => {
  const byline = ticketUpdateByline('<script>alert(1)</script>', INSTANT)
  assert.doesNotMatch(byline, /<script>/)
  assert.match(byline, /&lt;script&gt;/)
})

test('an invalid timestamp degrades to the author alone rather than throwing', () => {
  const byline = ticketUpdateByline('Charlie Dinh', 'not-a-date')
  assert.match(byline, /Charlie Dinh/)
  assert.doesNotMatch(byline, /Invalid/)
})
