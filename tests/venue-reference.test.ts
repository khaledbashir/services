import test from 'node:test'
import assert from 'node:assert/strict'
import {
  versionStatus,
  nextSeasonStart,
  softwareStatus,
  normalizePhone,
  formatPhone,
  rankPhoneMatches,
  phoneDecision,
  keywords,
  matchScore,
  rankMatches,
  orderSports,
  speakerNames,
  NO_SPORT_LABEL,
} from '../lib/venue-reference.ts'

const at = (iso: string) => new Date(iso)

test('season start rolls forward to the next occurrence', () => {
  // Season opens 1 Sept. Standing in August, the next one is this year's.
  assert.equal(
    nextSeasonStart('2025-09-01', at('2026-08-25T00:00:00Z')).toISOString().slice(0, 10),
    '2026-09-01',
  )
  // Standing in October, it has already opened — the next is next year's.
  assert.equal(
    nextSeasonStart('2025-09-01', at('2026-10-05T00:00:00Z')).toISOString().slice(0, 10),
    '2027-09-01',
  )
})

test('a venue nobody has reviewed reads as unknown, never as overdue', () => {
  // 251 venues have no season and no check on file. Painting those red on day
  // one makes the badge meaningless before anyone has used it.
  assert.equal(versionStatus(null, null, at('2026-08-25T00:00:00Z')), 'unknown')
  assert.equal(versionStatus('2025-09-01', null, at('2026-08-25T00:00:00Z')), 'unknown')
  assert.equal(versionStatus(null, '2026-08-01', at('2026-08-25T00:00:00Z')), 'unknown')
})

test('checked inside the run-up to the season is up to date', () => {
  // Season 1 Sept, window opens 18 July, checked 1 August.
  assert.equal(
    versionStatus('2025-09-01', '2026-08-01', at('2026-08-25T00:00:00Z')),
    'up_to_date',
  )
})

test('inside the window and not yet checked is update due', () => {
  // Checked in March — before the window opened — with the season three weeks out.
  assert.equal(
    versionStatus('2025-09-01', '2026-03-10', at('2026-08-25T00:00:00Z')),
    'update_due',
  )
})

test('a whole season passing since the last check is overdue', () => {
  // Season 1 Sept; last checked June 2025, so the 2025 season opened and
  // closed without anyone looking.
  assert.equal(
    versionStatus('2025-09-01', '2025-06-01', at('2026-08-25T00:00:00Z')),
    'overdue',
  )
})

test('outside the window, a check from the current season still counts', () => {
  // Season opened 1 Sept 2025, checked October, now March. Nothing is due yet.
  assert.equal(
    versionStatus('2025-09-01', '2025-10-15', at('2026-03-01T00:00:00Z')),
    'up_to_date',
  )
})

test('the lead window is configurable per caller', () => {
  const now = at('2026-08-25T00:00:00Z')
  // With a 45-day window 25 Aug is inside the run-up to a 1 Sept season; with
  // a 3-day window it is not, and nothing is due yet.
  assert.equal(versionStatus('2025-09-01', '2026-03-10', now, 45), 'update_due')
  assert.equal(versionStatus('2025-09-01', '2026-03-10', now, 3), 'up_to_date')
})

test('the day the window opens already counts as inside it', () => {
  // A 7-day window on a 1 Sept season opens exactly on 25 Aug. Off-by-one here
  // costs a venue a week of warning, which is the whole point of the badge.
  assert.equal(
    versionStatus('2025-09-01', '2026-03-10', at('2026-08-25T00:00:00Z'), 7),
    'update_due',
  )
  assert.equal(
    versionStatus('2025-09-01', '2026-03-10', at('2026-08-24T23:59:00Z'), 7),
    'up_to_date',
  )
})

test('4.2 and 4.2.0 are the same firmware', () => {
  assert.equal(softwareStatus('4.2', '4.2.0'), 'current')
  assert.equal(softwareStatus('v4.2.0', '4.2'), 'current')
})

test('a version behind reads as an update, ahead reads as current', () => {
  assert.equal(softwareStatus('4.2', '4.10'), 'update_available')
  // 4.10 is ten, not one — a naive string compare calls this behind.
  assert.equal(softwareStatus('4.10', '4.2'), 'current')
})

test('non-numeric versions compare as text rather than inventing an order', () => {
  assert.equal(softwareStatus('A8S-N', 'A8S-N'), 'current')
  assert.equal(softwareStatus('A8S-N', 'ARB-N'), 'update_available')
})

test('missing version data says so instead of guessing', () => {
  assert.equal(softwareStatus('4.2', null), 'no_target')
  assert.equal(softwareStatus(null, '4.2'), 'unknown')
  assert.equal(softwareStatus('  ', '4.2'), 'unknown')
})

test('the same caller in three formats resolves to one key', () => {
  assert.equal(normalizePhone('(404) 555-1212'), '4045551212')
  assert.equal(normalizePhone('+1 404 555 1212'), '4045551212')
  assert.equal(normalizePhone('404.555.1212'), '4045551212')
})

test('the literal Unknown the phone system sends is not a number', () => {
  // 88 of 315 voicemails on file carry exactly this.
  assert.equal(normalizePhone('Unknown'), null)
  assert.equal(normalizePhone(''), null)
  assert.equal(normalizePhone('555-1212'), null)
  assert.equal(formatPhone('4045551212'), '(404) 555-1212')
})

test('a confirmed link outranks a busier inferred one', () => {
  const ranked = rankPhoneMatches([
    { venue_id: 'guess', call_count: 40, last_seen_at: '2026-08-24', origin: 'backfill' },
    { venue_id: 'human', call_count: 1, last_seen_at: '2026-01-01', origin: 'confirmed' },
  ])
  assert.deepEqual(ranked.map((r) => r.venue_id), ['human', 'guess'])
})

test('one venue goes straight there, two ask', () => {
  const fenway = { venue_id: 'fenway', call_count: 9, last_seen_at: '2026-08-01', origin: 'confirmed' }
  const umass = { venue_id: 'umass', call_count: 2, last_seen_at: '2026-08-20', origin: 'confirmed' }
  assert.equal(phoneDecision([]).action, 'none')
  assert.equal(phoneDecision([fenway]).action, 'go')
  assert.equal(phoneDecision([fenway]).venue?.venue_id, 'fenway')

  const both = phoneDecision([umass, fenway])
  assert.equal(both.action, 'choose')
  assert.deepEqual(both.options.map((o) => o.venue_id), ['fenway', 'umass'])
})

test('keywords drop the filler a voicemail is mostly made of', () => {
  const words = keywords('Hi, this is Steve calling about the data not coming through')
  assert.ok(!words.includes('hi'))
  assert.ok(!words.includes('calling'))
  assert.ok(words.includes('data'))
  assert.ok(words.includes('coming'))
})

test('different wording for the same fault still matches', () => {
  // Steve's own example: the caller says one thing, the old ticket says another.
  const said = 'the data is not coming through on the ribbon'
  const strong = matchScore(said, 'Ribbon display data feed dropped — sheet was not updating')
  const weak = matchScore(said, 'Replaced a burnt out power supply in the north rack')
  assert.ok(strong > weak, `expected ${strong} > ${weak}`)
})

test('a long transcript does not out-score a short precise one', () => {
  // Score is a share of the caller's own vocabulary, not a raw hit count.
  const score = matchScore('processor offline', 'processor offline')
  assert.equal(score, 1)
})

test('nothing worth suggesting returns nothing', () => {
  const out = rankMatches(
    'the scoreboard clock is frozen',
    [{ t: 'Invoice question about last month billing' }],
    (c) => c.t,
  )
  assert.equal(out.length, 0)
})

test('suggestions come back best first and capped', () => {
  const out = rankMatches(
    'processor offline no signal to the ribbon',
    [
      { t: 'ribbon processor offline' },
      { t: 'no signal reaching the ribbon processor at all' },
      { t: 'processor' },
      { t: 'catering invoice' },
    ],
    (c) => c.t,
    2,
  )
  assert.equal(out.length, 2)
  assert.ok(out[0].score >= out[1].score)
})

test('sports open on the leagues ANC works in, blanks last', () => {
  assert.deepEqual(
    orderSports([NO_SPORT_LABEL, 'AHL', 'NFL', 'Curling', 'NBA']),
    ['NFL', 'NBA', 'AHL', 'Curling', NO_SPORT_LABEL],
  )
})

test("the caller's own name and number are not symptoms", () => {
  // A real voicemail: "Hi, this is David Reed. You can call 561-908-4923…"
  // Matching on david / reed / the digits can only ever find another David.
  const said = 'Hi this is David Reed you can call 561 908 4923 the board is jittery'
  const words = keywords(said, 'David Reed (561) 908-4923')
  assert.ok(!words.includes('david'))
  assert.ok(!words.includes('reed'))
  assert.ok(!words.includes('561'))
  assert.ok(words.includes('jittery'), 'the actual symptom survives')
  assert.ok(words.includes('board'))
})

test('bare numbers never become match terms', () => {
  // Case numbers, callback numbers and dates all tokenise into digits that
  // say nothing about what broke.
  const words = keywords('case 00001907 opened 2026 the processor is offline')
  assert.ok(!words.includes('00001907'))
  assert.ok(!words.includes('2026'))
  assert.ok(words.includes('processor'))
})

test('excluding the caller kills a name-only match', () => {
  const said = 'David Reed calling, everything is fine'
  const withName = matchScore(said, 'David Reed asked about invoicing')
  const without = matchScore(said, 'David Reed asked about invoicing', 'David Reed')
  assert.ok(without < withName, `expected ${without} < ${withName}`)
})

test('the name a caller says at the top of a voicemail is recovered', () => {
  assert.equal(speakerNames('Oh, the jittery? Yeah. Hi, this is David Reed. You can call…'), 'David Reed')
  assert.equal(speakerNames('Yes, my name is Shannon Watkins, 041721. I am at Capitol…'), 'Shannon Watkins')
})

test('"this is broken" is not a name', () => {
  // The opener is common English. Requiring capitalisation in the original
  // text keeps ordinary sentences from being read as introductions.
  assert.equal(speakerNames('this is broken again and it is the third time'), '')
  assert.equal(speakerNames('the ribbon is out, this is urgent'), '')
})

test('a spoken name stops driving matches', () => {
  const said = 'Hi this is David Reed the board is jittery'
  const words = keywords(said, speakerNames(said))
  assert.ok(!words.includes('david'))
  assert.ok(!words.includes('reed'))
  assert.ok(words.includes('jittery'))
})
