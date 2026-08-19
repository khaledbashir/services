import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RATE_MIN_ATTEMPTS,
  RATE_THRESHOLD,
  assessNotificationHealth,
  failureRate,
} from '../lib/notification-health-rules.ts'

// The original outage was silent: status notices went Slack-only, anyone without
// a Slack id was skipped with no throw and no log, and it stayed that way for
// months. These rules exist so that can never be quiet again — a healthy verdict
// has to be earned.

const OK = {
  mailConfigured: true,
  windowHours: 24,
  attempts: 100,
  failed: 0,
  unreachableEvents: 0,
  staffWithoutEmail: 0,
}

test('a working system reports no problems', () => {
  assert.deepEqual(assessNotificationHealth(OK), [])
})

test('a missing mail credential is a problem on its own', () => {
  const p = assessNotificationHealth({ ...OK, mailConfigured: false })
  assert.equal(p.length, 1)
  assert.match(p[0], /No mail credential/)
})

test('one person reached on no channel is always named', () => {
  const p = assessNotificationHealth({ ...OK, unreachableEvents: 1 })
  assert.equal(p.length, 1)
  assert.match(p[0], /1 notification in the last 24h reached nobody/)
})

test('the unreachable warning is not hidden by a healthy failure rate', () => {
  // 1 unreachable out of 1000 is a 0.1% rate — invisible as a percentage, and
  // exactly the bug that went unnoticed for months.
  const p = assessNotificationHealth({ ...OK, attempts: 1000, failed: 1, unreachableEvents: 1 })
  assert.ok(
    p.some((x) => /reached nobody/.test(x)),
    'a single unreachable person must survive a good-looking average',
  )
})

test('a high failure rate is flagged once there is enough traffic', () => {
  const p = assessNotificationHealth({ ...OK, attempts: 20, failed: 10 })
  assert.ok(p.some((x) => /50% of notification attempts failed/.test(x)))
})

test('a small sample does not trigger the rate alarm', () => {
  const p = assessNotificationHealth({
    ...OK,
    attempts: RATE_MIN_ATTEMPTS - 1,
    failed: RATE_MIN_ATTEMPTS - 1,
  })
  assert.ok(!p.some((x) => /attempts failed/.test(x)), 'a tiny sample is noise, not signal')
})

test('the rate alarm is exclusive at the threshold', () => {
  const atThreshold = assessNotificationHealth({ ...OK, attempts: 100, failed: RATE_THRESHOLD * 100 })
  assert.ok(!atThreshold.some((x) => /attempts failed/.test(x)), 'exactly at threshold is not over it')
  const over = assessNotificationHealth({ ...OK, attempts: 100, failed: RATE_THRESHOLD * 100 + 1 })
  assert.ok(over.some((x) => /attempts failed/.test(x)))
})

test('zero traffic is not a failure', () => {
  const p = assessNotificationHealth({ ...OK, attempts: 0, failed: 0 })
  assert.deepEqual(p, [], 'a quiet day must not page anyone')
  assert.equal(failureRate(0, 0), 0, 'no divide-by-zero')
})

test('an unreadable log is unhealthy, never silently healthy', () => {
  const p = assessNotificationHealth({ ...OK, logUnreadable: true })
  assert.ok(p.some((x) => /could not be read/.test(x)))
})

test('staff with no email are surfaced before they miss something', () => {
  const p = assessNotificationHealth({ ...OK, staffWithoutEmail: 3 })
  assert.ok(p.some((x) => /3 active staff have no email address/.test(x)))
})

test('problems accumulate rather than masking each other', () => {
  const p = assessNotificationHealth({
    mailConfigured: false,
    windowHours: 24,
    attempts: 40,
    failed: 40,
    unreachableEvents: 5,
    staffWithoutEmail: 2,
    logUnreadable: true,
  })
  assert.equal(p.length, 5, 'every distinct problem is reported')
})

test('the window length is echoed in the message, not hardcoded', () => {
  const p = assessNotificationHealth({ ...OK, windowHours: 168, unreachableEvents: 2 })
  assert.match(p[0], /last 168h/)
  assert.match(p[0], /2 notifications/, 'plural agrees with the count')
})
