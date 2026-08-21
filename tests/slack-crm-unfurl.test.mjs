/**
 * CRM link previews in Slack (Jireh, 2026-08-21).
 *
 * Two rules worth a suite: only ANC CRM links are ever touched, and a card
 * never carries money into a channel.
 *
 *   npm run test:slack-unfurl
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildUnfurlCard,
  deslugify,
  escapeMrkdwn,
  fallbackCard,
  formatCardDate,
  humanizeEnum,
  objectLabel,
  parseCrmLink,
} from '../lib/slack-crm-unfurl.ts'

const RAVENS = '69f784f4-4e61-4f3c-8d15-61dfe4ae6c3a'
const LG_VIEW = 'ee5690f5-c80c-4f8c-b0f5-53f5e664eba0'

// ------------------------------------------------------------------ parsing
test('reads the readable record link the CRM now writes', () => {
  const link = parseCrmLink(
    `https://crm.ancsports.net/object/opportunity/baltimore-ravens-film-breakdown-show--${RAVENS}`,
  )
  assert.equal(link.kind, 'record')
  assert.equal(link.object, 'opportunity')
  assert.equal(link.id, RAVENS)
  assert.equal(link.slug, 'baltimore-ravens-film-breakdown-show')
})

// Every link anyone sent before today is this shape.
test('still reads a bare-id record link', () => {
  const link = parseCrmLink(`https://crm.ancsports.net/object/opportunity/${RAVENS}`)
  assert.equal(link.kind, 'record')
  assert.equal(link.id, RAVENS)
  assert.equal(link.slug, '')
})

test('reads the report link he pasted in the channel', () => {
  const link = parseCrmLink(
    `https://crm.ancsports.net/objects/opportunities/lg-alliance-sponsorship-detail?viewId=${LG_VIEW}`,
  )
  assert.equal(link.kind, 'report')
  assert.equal(link.object, 'opportunities')
  assert.equal(link.viewId, LG_VIEW)
  assert.equal(link.slug, 'lg-alliance-sponsorship-detail')
})

test('reads a dashboard link', () => {
  const link = parseCrmLink('https://crm.ancsports.net/page/ai-exports-all--0c5d1538-2a7d-4547-9b5c-fe2628ebef71')
  assert.equal(link.kind, 'page')
  assert.equal(link.id, '0c5d1538-2a7d-4547-9b5c-fe2628ebef71')
  assert.equal(link.slug, 'ai-exports-all')
})

test('touches nothing that is not an ANC CRM link', () => {
  for (const url of [
    'https://crm.basheer.app/object/opportunity/' + RAVENS,     // the old playground
    'https://proposals.anc.com/api/render/lg-alliance-report-xlsx',
    'https://crm.ancsports.net/settings/profile',
    'https://crm.ancsports.net/welcome',
    'https://example.com',
    'not a url',
    '',
    null,
  ]) {
    assert.equal(parseCrmLink(url), null, String(url))
  }
})

test('a record link with no id in it is left alone', () => {
  assert.equal(parseCrmLink('https://crm.ancsports.net/object/opportunity/baltimore-ravens'), null)
})

// ------------------------------------------------------------------ wording
test('reads a name off a slug without mangling the acronyms', () => {
  assert.equal(deslugify('lg-alliance-sponsorship-detail'), 'LG Alliance Sponsorship Detail')
  assert.equal(deslugify('ai-exports-all'), 'AI Exports All')
  assert.equal(deslugify('coat-ticker-outage'), 'COAT Ticker Outage')
  assert.equal(deslugify('washington-commanders-2030-new-stadium'), 'Washington Commanders 2030 New Stadium')
  assert.equal(deslugify(''), '')
})

test('says what kind of record it is in English', () => {
  assert.equal(objectLabel('opportunity'), 'Opportunity')
  assert.equal(objectLabel('accountName'), 'Account Name')
})

test('says a status in English', () => {
  assert.equal(humanizeEnum('VERBAL_AGREEMENT'), 'Verbal Agreement')
  assert.equal(humanizeEnum('WON'), 'Won')
  assert.equal(humanizeEnum(null), '')
})

test('reads an award date in UTC so it does not slip a day', () => {
  assert.equal(formatCardDate('2027-03-15T00:00:00Z'), 'Mar 15, 2027')
  assert.equal(formatCardDate('nonsense'), '')
  assert.equal(formatCardDate(null), '')
})

// -------------------------------------------------------------------- cards
const LINK = parseCrmLink(`https://crm.ancsports.net/object/opportunity/baltimore-ravens--${RAVENS}`)

test('the card is keyed on the record name and links back to it', () => {
  const card = buildUnfurlCard(LINK, {
    title: 'Baltimore Ravens - Film Breakdown Show',
    kind: 'Opportunity',
    facts: ['Baltimore Ravens | M&T Bank Stadium', 'Won', 'Award date Aug 21, 2026'],
  })
  const text = JSON.stringify(card)
  assert.ok(text.includes(LINK.url))
  assert.ok(text.includes('Baltimore Ravens - Film Breakdown Show'))
  assert.ok(text.includes('Opportunity  ·  Baltimore Ravens | M&amp;T Bank Stadium  ·  Won'))
  assert.equal(card.color, '#002C73')
})

// The rule this file exists for.
test('carries no money into a channel', () => {
  const card = JSON.stringify(buildUnfurlCard(LINK, {
    title: 'Baltimore Ravens - Film Breakdown Show',
    kind: 'Opportunity',
    facts: ['Baltimore Ravens | M&T Bank Stadium', 'Won'],
  }))
  assert.ok(!/\$|amount|revenue|margin|poValue/i.test(card), card)
})

test('drops the facts it does not have rather than printing empty separators', () => {
  const card = buildUnfurlCard(LINK, { title: 'A deal', kind: 'Opportunity', facts: [null, '', undefined] })
  assert.ok(!JSON.stringify(card).includes('·'))
})

test('a name full of angle brackets cannot break the card', () => {
  assert.equal(escapeMrkdwn('A <b>deal</b> & more'), 'A &lt;b&gt;deal&lt;/b&gt; &amp; more')
})

// ----------------------------------------------------------------- fallback
test('says something useful even when the CRM cannot be reached', () => {
  assert.deepEqual(fallbackCard(LINK), {
    title: 'Baltimore Ravens',
    kind: 'Opportunity',
  })
  assert.deepEqual(
    fallbackCard(parseCrmLink(`https://crm.ancsports.net/objects/opportunities/lg-alliance-sponsorship-detail?viewId=${LG_VIEW}`)),
    { title: 'LG Alliance Sponsorship Detail', kind: 'Report · Opportunities' },
  )
  assert.deepEqual(
    fallbackCard(parseCrmLink(`https://crm.ancsports.net/object/opportunity/${RAVENS}`)),
    { title: 'Opportunity', kind: 'Opportunity' },
  )
})
