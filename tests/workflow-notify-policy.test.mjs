import assert from 'node:assert/strict'
import test from 'node:test'
import { parseStepList, resolveStepDelivery } from '../lib/workflow-notify-policy.ts'

// Joe 2026-08-19: "I'm getting emails for check ins. Don't think that's
// necessary." Two days earlier he had asked to be told about check-ins at all,
// so the rule that survives is narrow — a check-in still reaches the venue's
// own lead, as a Slack DM, and reaches nobody's inbox.

test('a check-in reaches the venue leads by Slack and nobody by email', () => {
  assert.deepEqual(resolveStepDelivery('check_in'), {
    notifyLeads: true,
    allowEmail: false,
    notifyLeadership: false,
  })
})

test('game-ready and the post-game report still mail leadership', () => {
  for (const step of ['game_ready', 'post_game_report']) {
    assert.deepEqual(
      resolveStepDelivery(step),
      { notifyLeads: true, allowEmail: true, notifyLeadership: true },
      `${step} must be unchanged by the check-in fix`,
    )
  }
})

test('a step switched off tells nobody down any channel', () => {
  assert.deepEqual(
    resolveStepDelivery('game_ready', { notifySteps: 'check_in,post_game_report' }),
    { notifyLeads: false, allowEmail: false, notifyLeadership: false },
  )
})

test('leadership can be handed the check-in email back with one row', () => {
  const delivery = resolveStepDelivery('check_in', {
    emailSteps: 'check_in,game_ready,post_game_report',
    alwaysSteps: 'check_in,game_ready,post_game_report',
  })
  assert.deepEqual(delivery, { notifyLeads: true, allowEmail: true, notifyLeadership: true })
})

test('an empty stored list is a deliberate opt-out, not a fallback', () => {
  assert.deepEqual(parseStepList('', ['check_in', 'game_ready']), new Set())
  assert.deepEqual(
    resolveStepDelivery('post_game_report', { notifySteps: '' }),
    { notifyLeads: false, allowEmail: false, notifyLeadership: false },
  )
})

test('an absent row means the default, which is not the same as an empty one', () => {
  assert.deepEqual(parseStepList(null, ['game_ready']), new Set(['game_ready']))
  assert.deepEqual(parseStepList(undefined, ['game_ready']), new Set(['game_ready']))
})

test('a row naming only unknown steps falls back rather than silently muting', () => {
  assert.deepEqual(parseStepList('post_game, checkin', ['post_game_report']), new Set(['post_game_report']))
})

test('stored lists split on commas, semicolons and whitespace alike', () => {
  assert.deepEqual(
    parseStepList('check_in, game_ready;post_game_report', []),
    new Set(['check_in', 'game_ready', 'post_game_report']),
  )
})
