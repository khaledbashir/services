import assert from 'node:assert/strict'
import test from 'node:test'
import { buildEventReadiness } from '../lib/event-readiness.ts'

test('an event with no submissions reads as not started', () => {
  const r = buildEventReadiness([])
  assert.equal(r.completed, 0)
  assert.equal(r.total, 3)
  assert.equal(r.label, 'Not started')
  assert.deepEqual(r.steps.map(s => s.complete), [false, false, false])
})

test('the three milestones always appear in game-day order', () => {
  const r = buildEventReadiness([{ type: 'post_game_report', submitted_at: '2026-08-04T17:30:00Z' }])
  assert.deepEqual(r.steps.map(s => s.key), ['check_in', 'game_ready', 'post_game_report'])
})

test('a partly-run event reports the latest milestone reached', () => {
  const r = buildEventReadiness([
    { type: 'check_in', submitted_at: '2026-08-04T12:00:00Z' },
    { type: 'game_ready', submitted_at: '2026-08-04T13:00:00Z' },
  ])
  assert.equal(r.completed, 2)
  assert.equal(r.label, 'Game ready')
})

test('all three milestones read as complete', () => {
  const r = buildEventReadiness([
    { type: 'check_in', submitted_at: '2026-08-04T12:00:00Z' },
    { type: 'game_ready', submitted_at: '2026-08-04T13:00:00Z' },
    { type: 'post_game_report', submitted_at: '2026-08-04T17:00:00Z' },
  ])
  assert.equal(r.completed, 3)
  assert.equal(r.label, 'Complete')
})

test('when several technicians file the same step, the earliest time is shown', () => {
  const r = buildEventReadiness([
    { type: 'check_in', submitted_at: '2026-08-04T12:30:00Z' },
    { type: 'check_in', submitted_at: '2026-08-04T12:00:00Z' },
  ])
  assert.equal(r.steps[0].completed_at, '2026-08-04T12:00:00.000Z')
})

test('Date objects from the driver are handled as well as strings', () => {
  const r = buildEventReadiness([{ type: 'check_in', submitted_at: new Date('2026-08-04T12:00:00Z') }])
  assert.equal(r.steps[0].complete, true)
  assert.equal(r.steps[0].completed_at, '2026-08-04T12:00:00.000Z')
})

test('no technician identity or submission payload can leak through', () => {
  const r = buildEventReadiness([
    { type: 'check_in', submitted_at: '2026-08-04T12:00:00Z', staff_id: 'staff-1', data: { auditor: 'N/A' } },
  ])
  const serialized = JSON.stringify(r)
  assert.doesNotMatch(serialized, /staff/i)
  assert.doesNotMatch(serialized, /auditor/i)
})

test('an unrecognised submission type is ignored rather than shown', () => {
  const r = buildEventReadiness([{ type: 'something_else', submitted_at: '2026-08-04T12:00:00Z' }])
  assert.equal(r.completed, 0)
  assert.equal(r.steps.length, 3)
})
