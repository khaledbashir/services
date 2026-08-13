import assert from 'node:assert/strict'
import test from 'node:test'
import {
  NO_UPDATE_TEXT,
  UNASSIGNED_ASSIGNEE,
  daysLabel,
  daysSince,
  escapeHtml,
  escapeSlack,
  renderActivityEmail,
  renderOpenReviewEmail,
  renderOpenReviewSlack,
  sortForReview,
  summariseReview,
  summariseUpdate,
} from '../lib/ticket-digest-format.ts'

const NOW = new Date('2026-08-13T15:00:00Z') // 11:00 AM New York
const CTX = { dateLabel: 'Thursday, August 13, 2026', baseUrl: 'https://services.ancsports.net' }

function ticket(over = {}) {
  return {
    id: 'id-1',
    ticketNumber: 2073,
    title: 'No power reaching the screens',
    status: 'escalated',
    priority: 'high',
    venue: 'WMATA',
    assignee: 'Michael Lewis',
    lastUpdateAt: '2026-08-12T20:29:52Z',
    lastUpdateDate: 'Aug 12, 2026',
    daysSinceUpdate: 1,
    latestUpdate: 'No power reaching the screens',
    latestUpdateAuthor: 'Michael Lewis',
    latestUpdateSource: 'note',
    createdDate: 'Aug 10, 2026',
    url: 'https://services.ancsports.net/tickets/id-1',
    ...over,
  }
}

test('days since last update floors to whole days and never goes negative', () => {
  assert.equal(daysSince('2026-08-13T14:00:00Z', NOW), 0)
  assert.equal(daysSince('2026-08-12T14:00:00Z', NOW), 1)
  // 36 days and change back, but 23h short of the 36th full day — a partial
  // day never rounds up, so an 8 AM run cannot inflate the age of a ticket.
  assert.equal(daysSince('2026-07-08T15:23:12Z', NOW), 35)
  // A future timestamp (clock skew on an imported ticket) reads as Today,
  // never as a negative age.
  assert.equal(daysSince('2026-09-01T00:00:00Z', NOW), 0)
  assert.equal(daysSince(null, NOW), 0)
  assert.equal(daysSince('not a date', NOW), 0)
})

test('day labels read the way Joe would say them', () => {
  assert.equal(daysLabel(0), 'Today')
  assert.equal(daysLabel(1), '1 day')
  assert.equal(daysLabel(36), '36 days')
})

test('the review is ordered quietest first, then by urgency, then stably', () => {
  const rows = [
    ticket({ ticketNumber: 10, daysSinceUpdate: 1, status: 'new' }),
    ticket({ ticketNumber: 20, daysSinceUpdate: 36, status: 'escalated' }),
    ticket({ ticketNumber: 30, daysSinceUpdate: 1, status: 'escalated' }),
    ticket({ ticketNumber: 5, daysSinceUpdate: 1, status: 'escalated' }),
  ]
  assert.deepEqual(sortForReview(rows).map((r) => r.ticketNumber), [20, 5, 30, 10])
  // Sorting is a copy, not a mutation — the caller's array order survives.
  assert.equal(rows[0].ticketNumber, 10)
})

test('summary counts the things the morning email leads with', () => {
  const s = summariseReview([
    ticket({ daysSinceUpdate: 36, status: 'escalated' }),
    ticket({ daysSinceUpdate: 8, status: 'on_hold', assignee: UNASSIGNED_ASSIGNEE }),
    ticket({ daysSinceUpdate: 14, status: 'in_progress' }),
    ticket({ daysSinceUpdate: 0, status: 'new' }),
  ])
  assert.deepEqual(s, { total: 4, stale7: 3, stale14: 2, unassigned: 1, escalated: 1, untouchedToday: 1 })
})

test('an update is collapsed to one readable line without losing the substance', () => {
  const body = 'Network switch found\n   to be   offline,\n\nbeen forwarded'
  assert.equal(summariseUpdate(body), 'Network switch found to be offline, been forwarded')
})

test('quoted email history is cut off so the update is the reply, not the thread', () => {
  const body = [
    'Mitch was able to go out to Arlington to check on the camera issue.',
    '',
    'On Mon, Aug 11, 2026 at 9:14 AM Someone Else wrote:',
    '> Please advise on the camera at Arlington.',
    '> Thanks',
  ].join('\n')
  assert.equal(summariseUpdate(body), 'Mitch was able to go out to Arlington to check on the camera issue.')

  const outlookStyle = 'Short answer here.\nFrom: someone@anc.com\nSent: Monday, August 11\nSubject: RE: camera'
  assert.equal(summariseUpdate(outlookStyle), 'Short answer here.')
})

test('mailing-list and signature boilerplate never reaches the digest', () => {
  const listMail = [
    'Confirmed the data cables are seated correctly on G10 and G11.',
    '',
    'You received this message because you are subscribed to the ANC Video Board group.',
    'To unsubscribe from this group and stop receiving emails from it, send an email to anc-video-board-list+unsubscribe@nd.edu.',
  ].join('\n')
  assert.equal(summariseUpdate(listMail), 'Confirmed the data cables are seated correctly on G10 and G11.')

  const signed = 'Two replacement PCs ship tomorrow.\n-- \nStephen Trefnoff\nOBM'
  assert.equal(summariseUpdate(signed), 'Two replacement PCs ship tomorrow.')

  const legal = 'Please investigate.\nThis email and any files transmitted with it are confidential.'
  assert.equal(summariseUpdate(legal), 'Please investigate.')
})

test('Outlook inline-image and duplicated-link artifacts are stripped', () => {
  const body = 'Greetings, please investigate incident IN/RQ1517550. [cid:image001.png@01DD2AE9.DB61A8E0] Contact kbaker@wmata.com<mailto:kbaker@wmata.com> or see https://wmata.com<https://wmata.com>.'
  assert.equal(
    summariseUpdate(body),
    'Greetings, please investigate incident IN/RQ1517550. Contact kbaker@wmata.com or see https://wmata.com .'
  )
})

test('a long update truncates on a word boundary and says so', () => {
  const body = 'word '.repeat(400)
  const out = summariseUpdate(body, 100)
  assert.ok(out.length <= 101, `expected <=101 chars, got ${out.length}`)
  assert.ok(out.endsWith('…'))
  assert.ok(!out.includes('wor…'))
})

test('a short update is returned untouched, with no ellipsis', () => {
  assert.equal(summariseUpdate('Awaiting parts'), 'Awaiting parts')
  assert.equal(summariseUpdate(''), '')
  assert.equal(summariseUpdate(null), '')
})

test('venue and update text are escaped so a ticket cannot break the email', () => {
  assert.equal(escapeHtml('Levi\'s <b>"Stadium"</b> & Co'), 'Levi\'s &lt;b&gt;&quot;Stadium&quot;&lt;/b&gt; &amp; Co')
  assert.equal(escapeSlack('a <b> & c'), 'a &lt;b&gt; &amp; c')
})

test('the open review email carries every column Joe asked for', () => {
  const html = renderOpenReviewEmail([ticket({ daysSinceUpdate: 36, lastUpdateDate: 'Jul 08, 2026' })], CTX)
  assert.ok(html.includes('Open Ticket Review'))
  assert.ok(html.includes('>Venue<'))
  assert.ok(html.includes('>Assignee<'))
  assert.ok(html.includes('>Since last update<'))
  assert.ok(html.includes('>Latest update<'))
  assert.ok(html.includes('WMATA'))
  assert.ok(html.includes('Michael Lewis'))
  assert.ok(html.includes('36 days'))
  assert.ok(html.includes('Jul 08, 2026'), 'the update carries its own date')
  assert.ok(html.includes('https://services.ancsports.net/tickets/id-1'))
  assert.ok(html.includes('T-02073'))
})

test('a ticket with no notes says so instead of showing an empty cell', () => {
  const html = renderOpenReviewEmail([ticket({ latestUpdateSource: 'none', latestUpdate: NO_UPDATE_TEXT })], CTX)
  assert.ok(html.includes(NO_UPDATE_TEXT))
})

test('an empty board still sends a recap rather than a blank page', () => {
  const html = renderOpenReviewEmail([], CTX)
  assert.ok(html.includes('No open tickets this morning'))
  assert.ok(html.includes('/tickets/open-review'))
})

test('the Slack recap discloses how many tickets it left off the list', () => {
  const rows = Array.from({ length: 22 }, (_, i) => ticket({ id: `id-${i}`, ticketNumber: 2000 + i, daysSinceUpdate: 22 - i }))
  const msg = renderOpenReviewSlack(rows, CTX, 15)
  const rendered = JSON.stringify(msg.blocks)
  assert.ok(rendered.includes('Showing the 15 quietest of 22 open tickets — 7 more'))
  assert.ok(msg.text.includes('22 open tickets'))
  // Slack rejects any section over 3000 characters — the list is chunked, so
  // no single block may exceed that even with 22 verbose updates.
  for (const block of msg.blocks) {
    if (block.type === 'section') assert.ok(block.text.text.length <= 3000, 'section block exceeds Slack limit')
  }
})

test('the Slack recap does not claim a cap it did not apply', () => {
  const msg = renderOpenReviewSlack([ticket()], CTX, 15)
  assert.ok(!JSON.stringify(msg.blocks).includes('Showing the'))
})

test('the closed-24h report dates rows by when they closed, not when they opened', () => {
  const html = renderActivityEmail(
    'closed-24h',
    [ticket({ status: 'closed', createdDate: 'Jan 02, 2026', closedDate: 'Aug 13, 2026' })],
    CTX
  )
  assert.ok(html.includes('Tickets Closed — Last 24 Hours'))
  assert.ok(html.includes('Aug 13, 2026'))
  assert.ok(!html.includes('Jan 02, 2026'))
})

test('the new and escalated reports name themselves and handle a quiet day', () => {
  assert.ok(renderActivityEmail('new-24h', [ticket()], CTX).includes('New Tickets — Last 24 Hours'))
  assert.ok(renderActivityEmail('escalated', [], CTX).includes('Nothing is sitting at escalated right now.'))
  assert.ok(renderActivityEmail('new-24h', [], CTX).includes('No new tickets were opened in the last 24 hours.'))
})
