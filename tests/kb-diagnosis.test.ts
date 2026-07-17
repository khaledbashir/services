import test from 'node:test'
import assert from 'node:assert/strict'
import { extractKBDiagnosis, normalizeKBDiagnosis } from '../lib/kb-diagnosis.ts'

const complete = {
  title: 'Partial Ribbon Signal Loss',
  issue_type: 'Signal Loss',
  description: 'A white block is visible across several cabinets on the left ribbon display.',
  likely_cause: 'The affected cabinets have lost their incoming data feed.',
  suggested_fix: 'Inspect the upstream data cable, reseat each connector, and test the receiving card.',
  urgency: 'Medium',
}

test('accepts and normalizes a complete diagnosis', () => {
  assert.deepEqual(normalizeKBDiagnosis({
    ...complete,
    urgency: 'Medium (noticeable but functional)',
  }), complete)
})

test('rejects diagnoses with blank or half-written technician guidance', () => {
  assert.equal(normalizeKBDiagnosis({ ...complete, likely_cause: 'A faulty', suggested_fix: '' }), null)
})

test('extracts a complete diagnosis from a fenced response', () => {
  const extracted = extractKBDiagnosis(`\`\`\`json\n${JSON.stringify(complete)}\n\`\`\``)
  assert.deepEqual(extracted, complete)
})
