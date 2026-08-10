import assert from 'node:assert/strict'
import test from 'node:test'
import {
  planPortalAccountUpdate,
  PortalAccountValidationError,
} from '../lib/portal-account-settings.ts'

const CURRENT_NAME = 'Casey Rivera'

function expectRejection(input, currentName = CURRENT_NAME) {
  assert.throws(
    () => planPortalAccountUpdate(input, currentName),
    PortalAccountValidationError,
  )
}

test('renaming alone needs no password fields', () => {
  const plan = planPortalAccountUpdate({ fullName: 'Casey R. Rivera' }, CURRENT_NAME)
  assert.equal(plan.fullName, 'Casey R. Rivera')
  assert.equal(plan.password, null)
})

test('an unchanged name is not written back', () => {
  expectRejection({ fullName: CURRENT_NAME })
})

test('a password change carries the current password and the new one', () => {
  const plan = planPortalAccountUpdate({
    fullName: CURRENT_NAME,
    currentPassword: 'old-password',
    newPassword: 'brand-new-password',
    confirmPassword: 'brand-new-password',
  }, CURRENT_NAME)
  assert.equal(plan.fullName, null)
  assert.deepEqual(plan.password, { current: 'old-password', next: 'brand-new-password' })
})

test('a mismatched confirmation is rejected', () => {
  expectRejection({
    currentPassword: 'old-password',
    newPassword: 'brand-new-password',
    confirmPassword: 'brand-new-passwerd',
  })
})

test('a missing confirmation is rejected rather than silently accepted', () => {
  expectRejection({ currentPassword: 'old-password', newPassword: 'brand-new-password' })
})

test('changing a password requires proving the current one', () => {
  expectRejection({ newPassword: 'brand-new-password', confirmPassword: 'brand-new-password' })
})

test('a short password is rejected', () => {
  expectRejection({
    currentPassword: 'old-password',
    newPassword: 'short',
    confirmPassword: 'short',
  })
})

test('reusing the current password is rejected', () => {
  expectRejection({
    currentPassword: 'same-password',
    newPassword: 'same-password',
    confirmPassword: 'same-password',
  })
})

test('an empty submission is rejected', () => {
  expectRejection({})
})

test('clearing the name is rejected instead of blanking the account', () => {
  expectRejection({ fullName: '   ' })
})

test('passwords keep leading and trailing spaces', () => {
  const plan = planPortalAccountUpdate({
    currentPassword: ' old-password ',
    newPassword: ' spaced password ',
    confirmPassword: ' spaced password ',
  }, CURRENT_NAME)
  assert.equal(plan.password.next, ' spaced password ')
})
