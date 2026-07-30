// The open pixel is requested by mail clients as `<recipientId>.png`. For months
// that extension reached the UUID comparison verbatim, Postgres rejected it, the
// catch swallowed the error and the pixel still returned 200 — so every open
// across 7,603 delivered emails was recorded as "not opened".
//
// This locks the parsing contract: whatever image extension a mail proxy asks
// for, the id we query with is the bare UUID.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROUTE = new URL('../app/api/marketing/track/open/[recipientId]/route.ts', import.meta.url);

// The route is TypeScript inside a Next.js app; lift the pure parser out of the
// source rather than standing up the whole framework to assert one regex.
const src = readFileSync(ROUTE, 'utf8');
const body = src.match(/function recipientIdFrom\(segment: string\): string \{([\s\S]*?)\n\}/);
assert.ok(body, 'recipientIdFrom must exist in the open-pixel route');
const recipientIdFrom = new Function('segment', body[1].replace(/\breturn\b/, 'return'));

const UUID = '2462d27a-800b-492e-b7ee-8dc33f7a5209';

test('strips the .png the mail client actually requests', () => {
  assert.equal(recipientIdFrom(`${UUID}.png`), UUID);
});

test('accepts the other image extensions a proxy may rewrite to', () => {
  for (const ext of ['gif', 'jpg', 'jpeg', 'PNG', 'GIF']) {
    assert.equal(recipientIdFrom(`${UUID}.${ext}`), UUID, `failed for .${ext}`);
  }
});

test('leaves a bare uuid untouched', () => {
  assert.equal(recipientIdFrom(UUID), UUID);
});

test('does not mangle a uuid that has no extension but contains dots in the query form', () => {
  assert.equal(recipientIdFrom(encodeURIComponent(UUID)), UUID);
});
