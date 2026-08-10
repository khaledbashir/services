import assert from 'node:assert/strict'
import test from 'node:test'
import { presentDesignRequest } from '../lib/design-request-client-view.ts'
import {
  CUSTOMER_PORTAL_TABS,
  isCustomerPortalTabPendingApproval,
  normalizeCustomerPortalTabs,
} from '../lib/customer-portal-tabs.ts'

test('a job still with ANC reads as in progress', () => {
  const view = presentDesignRequest({ status: 'in_progress' })
  assert.equal(view.state, 'in_progress')
  assert.equal(view.needsClientAction, false)
})

test('a job in client review asks the client to act', () => {
  const view = presentDesignRequest({ status: 'client_review' })
  assert.equal(view.state, 'awaiting_your_review')
  assert.equal(view.needsClientAction, true)
})

test('an open job with a proof out asks the client to act', () => {
  const view = presentDesignRequest({ status: 'in_progress', hasProof: true })
  assert.equal(view.state, 'awaiting_your_review')
})

test('a client approval wins over the internal pipeline state', () => {
  // The internal status often lags the client's decision — a request they
  // already approved must never read back to them as "awaiting your review".
  const view = presentDesignRequest({ status: 'client_review', proofResponse: 'approved', hasProof: true })
  assert.equal(view.state, 'approved')
  assert.equal(view.needsClientAction, false)
})

test('a change request puts the job back with ANC, not with the client', () => {
  const view = presentDesignRequest({ status: 'client_review', proofResponse: 'changes_requested', hasProof: true })
  assert.equal(view.state, 'in_progress')
  assert.equal(view.needsClientAction, false)
})

test('a finished job reads as complete', () => {
  assert.equal(presentDesignRequest({ status: 'done' }).state, 'complete')
})

test('a done job with an old proof does not reopen for review', () => {
  assert.equal(presentDesignRequest({ status: 'done', hasProof: true }).state, 'complete')
})

test('an unknown status degrades to in progress rather than blank', () => {
  assert.equal(presentDesignRequest({ status: 'something_new' }).state, 'in_progress')
  assert.equal(presentDesignRequest({ status: null }).state, 'in_progress')
})

test('the new tabs are selectable in portal setup', () => {
  const keys = CUSTOMER_PORTAL_TABS.map((tab) => tab.key)
  for (const key of ['events', 'designs', 'assistant']) {
    assert.ok(keys.includes(key), `${key} missing from the tab registry`)
  }
})

test('selected tabs survive normalization', () => {
  assert.deepEqual(
    normalizeCustomerPortalTabs(['assistant', 'events', 'overview', 'designs']),
    ['overview', 'events', 'designs', 'assistant'],
  )
})

test('the assistant stays gated until ANC signs it off', () => {
  assert.equal(isCustomerPortalTabPendingApproval('assistant'), true)
  assert.equal(isCustomerPortalTabPendingApproval('events'), false)
  assert.equal(isCustomerPortalTabPendingApproval('designs'), false)
})
