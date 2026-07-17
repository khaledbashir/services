import assert from 'node:assert/strict'
import test from 'node:test'

import { getGeminiApiKeys } from '../lib/gemini-key-pool.ts'

test('builds a deterministic Gemini key pool and removes duplicates', () => {
  const keys = getGeminiApiKeys({
    GEMINI_API_KEY: 'primary',
    GEMINI_API_KEYS: 'secondary, tertiary\nprimary',
    GEMINI_API_KEY_10: 'tenth',
    GEMINI_API_KEY_2: 'second-numbered',
    GOOGLE_API_KEY: 'google',
  })

  assert.deepEqual(keys, [
    'primary',
    'secondary',
    'tertiary',
    'second-numbered',
    'tenth',
    'google',
  ])
})

test('ignores blank Gemini key values', () => {
  assert.deepEqual(getGeminiApiKeys({
    GEMINI_API_KEY: '  ',
    GEMINI_API_KEYS: ' , ;\n',
    GOOGLE_API_KEY: 'working',
  }), ['working'])
})
