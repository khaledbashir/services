import assert from 'node:assert/strict'
import { classifyAhmadSyncSlackMessage } from '../lib/ahmad-sync-slack-classifier'

const bot = 'U0BRU8X1NT0'
const ahmad = 'U0A92M2DA13'
const other = 'U12345678'
const event = (user: string, text: string, extra: Record<string, unknown> = {}) => ({ type: 'message', user, text, channel: 'C1', ts: '1.1', ...extra })

assert.equal(classifyAhmadSyncSlackMessage(event(other, 'Morning everyone')), null)
assert.equal(classifyAhmadSyncSlackMessage(event(other, `<@${ahmad}> the forecast export is missing the margin column`)), 'request_received')
assert.equal(classifyAhmadSyncSlackMessage(event(other, 'Can you add the award date to the LG report?')), 'request_received')
assert.equal(classifyAhmadSyncSlackMessage(event(other, `<@${bot}> confirm you received this`)), 'request_received')
assert.equal(classifyAhmadSyncSlackMessage(event(ahmad, 'Fixed. It is live now.')), 'shipped')
assert.equal(classifyAhmadSyncSlackMessage(event(ahmad, 'This is not live yet.')), null)
assert.equal(classifyAhmadSyncSlackMessage(event(other, 'please update this', { bot_id: 'B1' })), null)
assert.equal(classifyAhmadSyncSlackMessage(event(other, 'Updated the client record.')), null)

console.log('ahmad-sync-slack: 8 checks passed')
