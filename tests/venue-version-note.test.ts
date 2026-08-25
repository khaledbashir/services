import test from 'node:test'
import assert from 'node:assert/strict'
import { readVersionsFromNote } from '../lib/venue-reference.ts'

test("Steve's own example is read straight out of the note", () => {
  assert.deepEqual(
    readVersionsFromNote('Swapped the fibre, CMS updated to v4.2 and retested.'),
    { cms_version: '4.2' },
  )
})

test('firmware and CMS in one note both land', () => {
  const out = readVersionsFromNote('Upgraded CMS to 4.2.1 and flashed LED firmware to v3.10')
  assert.equal(out.cms_version, '4.2.1')
  assert.equal(out.led_firmware_version, '3.10')
})

test('a note that only MENTIONS a version does not rewrite the record', () => {
  // "still on 4.1" is a statement of fact, not an upgrade. Writing it into the
  // Software tab as a change would make the timeline lie about what happened.
  assert.deepEqual(readVersionsFromNote('Confirmed the CMS is still on 4.1, issue was the cable'), {})
  assert.deepEqual(readVersionsFromNote('Customer asked whether CMS v4.2 is out yet'), {})
})

test('an empty or missing note is not an upgrade', () => {
  assert.deepEqual(readVersionsFromNote(''), {})
  assert.deepEqual(readVersionsFromNote(null), {})
  assert.deepEqual(readVersionsFromNote('   '), {})
})

test('a close with no version in it writes nothing', () => {
  assert.deepEqual(
    readVersionsFromNote('Reseated the receiving card and the wall came back up.'),
    {},
  )
})

test('common phrasings all read as upgrades', () => {
  assert.equal(readVersionsFromNote('cms now on 5.0').cms_version, '5.0')
  assert.equal(readVersionsFromNote('CMS upgraded 4.3').cms_version, '4.3')
  assert.equal(readVersionsFromNote('installed firmware 2.7 on the senders').led_firmware_version, '2.7')
})
