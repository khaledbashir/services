import assert from 'node:assert/strict'
import test from 'node:test'
import {
  alternateToken,
  ancWorkspaceToken,
  isChannelId,
  primaryToken,
  rememberChannelToken,
  resetChannelTokenCache,
  sendWithWorkspaceFallback,
  shouldTryAlternate,
  tokenForChannel,
} from '../lib/slack-workspace.ts'

// Chris D, 2026-08-23: "I created a new ticket last night. Ticket 02250. The
// notifications never went out to the slack channel."
//
// Dodger Stadium's channel C023S5DQAFQ lives in the ANC staff workspace; the
// dashboard was posting with the ANC-Project token, which cannot see it. Slack
// said channel_not_found, the sender logged it and returned false, and nothing
// reached anyone. 129 of 132 configured venue channels were in that state.
//
// These tests pin the decision that fixes it: the channel picks the token.

const PRIMARY = 'xoxb-primary-anc-project'
const ANC = 'xoxb-secondary-anc-workspace'

// Always awaited: an env var restored while the body is still suspended would
// change the answer mid-test, which is exactly how this file lied the first time
// it ran.
async function withTokens(primary, anc, fn) {
  const before = [process.env.SLACK_BOT_TOKEN, process.env.SLACK_ANC_WORKSPACE_BOT_TOKEN]
  process.env.SLACK_BOT_TOKEN = primary ?? ''
  process.env.SLACK_ANC_WORKSPACE_BOT_TOKEN = anc ?? ''
  resetChannelTokenCache()
  try {
    return await fn()
  } finally {
    process.env.SLACK_BOT_TOKEN = before[0] ?? ''
    process.env.SLACK_ANC_WORKSPACE_BOT_TOKEN = before[1] ?? ''
    resetChannelTokenCache()
  }
}

/** Records every token the dispatcher tries, answering per a canned script. */
function recorder(script) {
  const tried = []
  return {
    tried,
    send: async (token) => {
      tried.push(token)
      return script[token] ?? { ok: false, error: 'invalid_auth' }
    },
  }
}

test('only real channel ids are re-routed — DMs and user ids are not', () => {
  assert.equal(isChannelId('C023S5DQAFQ'), true)
  assert.equal(isChannelId('G01ABCDEF'), true)
  // A DM belongs to the token that opened it, and only the ANC-Project token
  // can open one at all — re-routing these would break check-in reminders.
  assert.equal(isChannelId('D01ABCDEF'), false)
  assert.equal(isChannelId('U0AMC3XU3PT'), false)
  assert.equal(isChannelId('W0AMC3XU3PT'), false)
  assert.equal(isChannelId(''), false)
  assert.equal(isChannelId(undefined), false)
  assert.equal(isChannelId('#general'), false)
})

test('channel_not_found from the primary retries the staff workspace and delivers', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const r = recorder({
      [PRIMARY]: { ok: false, error: 'channel_not_found' },
      [ANC]: { ok: true, ts: '1787496766.538099' },
    })
    const res = await sendWithWorkspaceFallback('C023S5DQAFQ', r.send)
    assert.equal(res.ok, true)
    assert.deepEqual(r.tried, [PRIMARY, ANC])
  })
})

test('the winning token is remembered, so the second message costs one call', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const first = recorder({
      [PRIMARY]: { ok: false, error: 'channel_not_found' },
      [ANC]: { ok: true, ts: '1' },
    })
    await sendWithWorkspaceFallback('C023S5DQAFQ', first.send)
    assert.deepEqual(first.tried, [PRIMARY, ANC])

    const second = recorder({ [ANC]: { ok: true, ts: '2' } })
    const res = await sendWithWorkspaceFallback('C023S5DQAFQ', second.send)
    assert.equal(res.ok, true)
    assert.deepEqual(second.tried, [ANC], 'must not re-probe the primary')
  })
})

test('a channel the primary can reach never touches the other workspace', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const r = recorder({ [PRIMARY]: { ok: true, ts: '1' } })
    const res = await sendWithWorkspaceFallback('C0AM6KP0EMV', r.send)
    assert.equal(res.ok, true)
    assert.deepEqual(r.tried, [PRIMARY])
  })
})

test('not_in_channel also earns a retry', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const r = recorder({
      [PRIMARY]: { ok: false, error: 'not_in_channel' },
      [ANC]: { ok: true, ts: '1' },
    })
    assert.equal((await sendWithWorkspaceFallback('C06E37X32BX', r.send)).ok, true)
    assert.deepEqual(r.tried, [PRIMARY, ANC])
  })
})

test('an error that is not about the workspace is not retried', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    for (const error of ['invalid_auth', 'account_inactive', 'is_archived', 'ratelimited', 'msg_too_long']) {
      resetChannelTokenCache()
      const r = recorder({ [PRIMARY]: { ok: false, error } })
      const res = await sendWithWorkspaceFallback('C023S5DQAFQ', r.send)
      assert.equal(res.error, error)
      assert.deepEqual(r.tried, [PRIMARY], `${error} must not fan out to the other workspace`)
    }
  })
})

test('when both workspaces refuse, the primary refusal is what the caller sees', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const r = recorder({
      [PRIMARY]: { ok: false, error: 'channel_not_found' },
      [ANC]: { ok: false, error: 'not_in_channel' },
    })
    const res = await sendWithWorkspaceFallback('C0NOWHERE1', r.send)
    assert.equal(res.ok, false)
    assert.equal(res.error, 'channel_not_found')
    assert.deepEqual(r.tried, [PRIMARY, ANC])
  })
})

test('a failed retry is not remembered — the next message tries the primary again', async () => {
  await withTokens(PRIMARY, ANC, async () => {
    const bad = recorder({
      [PRIMARY]: { ok: false, error: 'channel_not_found' },
      [ANC]: { ok: false, error: 'channel_not_found' },
    })
    await sendWithWorkspaceFallback('C0NOWHERE1', bad.send)

    const later = recorder({ [PRIMARY]: { ok: true, ts: '1' } })
    assert.equal((await sendWithWorkspaceFallback('C0NOWHERE1', later.send)).ok, true)
    assert.deepEqual(later.tried, [PRIMARY])
  })
})

test('with only the staff-workspace token configured, it is used directly', async () => {
  await withTokens('', ANC, async () => {
    const r = recorder({ [ANC]: { ok: true, ts: '1' } })
    assert.equal((await sendWithWorkspaceFallback('C023S5DQAFQ', r.send)).ok, true)
    assert.deepEqual(r.tried, [ANC])
  })
})

test('with no token at all it throws rather than reporting a silent success', async () => {
  await withTokens('', '', async () => {
    await assert.rejects(
      () => sendWithWorkspaceFallback('C023S5DQAFQ', async () => ({ ok: true })),
      /SLACK_BOT_TOKEN not set/,
    )
  })
})

test('alternateToken flips between the two, and never returns the token it was given', async () => {
  await withTokens(PRIMARY, ANC, () => {
    assert.equal(primaryToken(), PRIMARY)
    assert.equal(ancWorkspaceToken(), ANC)
    assert.equal(alternateToken(PRIMARY), ANC)
    assert.equal(alternateToken(ANC), PRIMARY)
  })
})

test('with no second workspace configured, behaviour is exactly what it was before', async () => {
  await withTokens(PRIMARY, '', async () => {
    assert.equal(alternateToken(PRIMARY), '')
    const r = recorder({ [PRIMARY]: { ok: false, error: 'channel_not_found' } })
    const res = await sendWithWorkspaceFallback('C023S5DQAFQ', r.send)
    assert.equal(res.error, 'channel_not_found')
    assert.deepEqual(r.tried, [PRIMARY], 'nothing to fall back to, so exactly one attempt')
  })
})

test('shouldTryAlternate only fires on the two cross-workspace errors', () => {
  assert.equal(shouldTryAlternate('channel_not_found'), true)
  assert.equal(shouldTryAlternate('not_in_channel'), true)
  assert.equal(shouldTryAlternate('invalid_auth'), false)
  assert.equal(shouldTryAlternate(undefined), false)
  assert.equal(shouldTryAlternate(null), false)
})

test('a remembered channel does not leak into other channels', async () => {
  await withTokens(PRIMARY, ANC, () => {
    rememberChannelToken('C023S5DQAFQ', ANC)
    assert.equal(tokenForChannel('C023S5DQAFQ'), ANC)
    assert.equal(tokenForChannel('C0AM6KP0EMV'), PRIMARY)
  })
})
