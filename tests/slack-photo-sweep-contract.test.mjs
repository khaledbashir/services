import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { buildPhotoSweepSummary } from '../lib/photo-sweep-notifications.ts'

test('photo sweep announces only the shared Sales destination', () => {
  assert.equal(
    buildPhotoSweepSummary(4, 2, 'https://ancny.sharepoint.com/sites/ANC/Sales/Slack-images'),
    '📸 Weekly photo sweep: filed 4 technician photos from 2 venues to the shared Sales library → https://ancny.sharepoint.com/sites/ANC/Sales/Slack-images',
  )
})

test('photo sweep cannot fan filing confirmations into venue channels', async () => {
  const source = await readFile(new URL('../lib/slack-photo-sweep.ts', import.meta.url), 'utf8')
  assert.equal((source.match(/await sendSlackMessage\(\{/g) || []).length, 1)
  assert.doesNotMatch(source, /Confirm in each swept channel/i)
  assert.match(source, /SLACK_DEFAULT_CHANNEL/)
})
