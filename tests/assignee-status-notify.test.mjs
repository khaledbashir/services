import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStatusDelivery, renderStatusEmail } from '../lib/assignee-status-email.ts'

// Alexis 2026-08-19, with Joe endorsing: "Can we turn on the notifications
// because things are getting lost... anything is moved from status to status.
// If anyone's assigned to something." Asked for email, explicitly not Slack
// channel alerts.
//
// The bug this pins: status changes went out as a Slack DM only, and anyone
// without a Slack id linked was silently skipped — 99 of 189 active staff, all
// of whom have an email address on file. A missing Slack id must never again
// mean "notify nobody".

test('no Slack id still reaches the person by email', () => {
  const d = resolveStatusDelivery({ slack_user_ids: null, email: 'alexis@anc.com' })
  assert.equal(d.slackUserId, null)
  assert.equal(d.email, 'alexis@anc.com', 'the email must survive a missing Slack id')
})

test('an empty Slack array is the same as no Slack id', () => {
  for (const ids of [[], [''], ['   '], [null], [undefined]]) {
    const d = resolveStatusDelivery({ slack_user_ids: ids, email: 'a@anc.com' })
    assert.equal(d.slackUserId, null, `${JSON.stringify(ids)} must not count as a Slack id`)
    assert.equal(d.email, 'a@anc.com')
  }
})

test('someone with both is reachable on both — Slack was not taken away', () => {
  const d = resolveStatusDelivery({ slack_user_ids: ['U123'], email: 'both@anc.com' })
  assert.equal(d.slackUserId, 'U123')
  assert.equal(d.email, 'both@anc.com')
})

test('the first usable Slack id wins, not the first array slot', () => {
  const d = resolveStatusDelivery({ slack_user_ids: ['', '  ', 'U999'], email: null })
  assert.equal(d.slackUserId, 'U999')
})

test('a blank or malformed address is not an address', () => {
  for (const email of ['', '   ', null, undefined, 'not-an-email', 42]) {
    const d = resolveStatusDelivery({ slack_user_ids: [], email })
    assert.equal(d.email, null, `${JSON.stringify(email)} must not be treated as reachable`)
  }
})

test('addresses are trimmed so whitespace does not defeat the send', () => {
  assert.equal(resolveStatusDelivery({ email: '  who@anc.com  ' }).email, 'who@anc.com')
})

test('a person with neither channel is genuinely unreachable', () => {
  const d = resolveStatusDelivery({ slack_user_ids: [], email: '' })
  assert.equal(d.slackUserId, null)
  assert.equal(d.email, null)
})

test('the email names the ticket, both statuses, and links to it', () => {
  const { subject, bodyHtml: html } = renderStatusEmail({
    fullName: 'Alexis Ventarola',
    kind: 'Design Request',
    title: 'Titans Headshots 2026',
    statusLabel: 'In Qc',
    previousLabel: 'In Progress',
    url: 'https://services.ancsports.net/designs/abc',
  })
  assert.match(subject, /Design Request status: Titans Headshots 2026 — In Qc/)
  assert.match(html, /Hi Alexis,/, 'greets by first name only')
  assert.match(html, /moved from <strong>In Progress<\/strong> to <strong>In Qc<\/strong>/)
  assert.match(html, /https:\/\/services\.ancsports\.net\/designs\/abc/)
})

test('with no previous status it reads as a statement, not a move', () => {
  const { bodyHtml: html } = renderStatusEmail({
    fullName: null,
    kind: 'CG Request',
    title: 'Kia Courtside',
    statusLabel: 'Client Review',
    previousLabel: null,
    url: 'https://services.ancsports.net/cg-designs/1',
  })
  assert.match(html, /Hi there,/, 'falls back to a neutral greeting')
  assert.match(html, /is now <strong>Client Review<\/strong>/)
  assert.doesNotMatch(html, /moved from/)
})

test('a ticket title cannot inject markup into the email', () => {
  const { bodyHtml: html } = renderStatusEmail({
    fullName: '<script>x</script>',
    kind: 'Design Request',
    title: '<img src=x onerror=alert(1)>',
    statusLabel: 'Done',
    previousLabel: null,
    url: 'https://services.ancsports.net/designs/1',
  })
  assert.doesNotMatch(html, /<img src=x/, 'ticket titles are escaped')
  assert.doesNotMatch(html, /<script>/, 'names are escaped')
  assert.match(html, /&lt;img src=x/)
})
