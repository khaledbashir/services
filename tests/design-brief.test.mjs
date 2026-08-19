import assert from 'node:assert/strict'
import test from 'node:test'
import { MIN_DIRECTION_CHARS, assessDesignBrief, stripReferences } from '../lib/design-brief.ts'

// Charlie, 2026-08-19, reading real tickets: "how do you create something that
// says courtside and backstage things should be static?" Daniel asked for the
// same gate in April. These are the actual briefs from the corpus.

const GOOD = {
  notes:
    'EVS rollout Bears and Titans. Assets are located in the supplied folder. All animation is final and locked and provided as an After Effects template. Your role is versioning only — swapping logos and updating text in the designated area, then rendering the export list below. Do not adjust animation timing.',
  boardsRequested: 'Ribbon, Main Board',
  sizesRequested: '10368x80',
  projectFileLocation: 'X:\\Jobs-RH\\2026\\CHI-BEARS',
}

test('a fully specified brief passes', () => {
  const r = assessDesignBrief(GOOD)
  assert.equal(r.complete, true)
  assert.deepEqual(r.missing, [])
})

test('the brief Charlie could not work from is rejected', () => {
  const r = assessDesignBrief({
    notes: 'Courtside and basket stanchions should be static',
    boardsRequested: 'Courtside',
    sizesRequested: null,
    projectFileLocation: null,
  })
  assert.equal(r.complete, false)
  assert.ok(r.missing.some((m) => /Assets/.test(m)))
})

test('"Create courtside" is not a brief', () => {
  const r = assessDesignBrief({ notes: 'Create courtside' })
  assert.equal(r.complete, false)
  assert.ok(r.missing.some((m) => /too short to work from/.test(m)))
})

test('a ticket carrying only a link is called out as exactly that', () => {
  const r = assessDesignBrief({
    notes: 'Wrike: https://www.wrike.com/open.htm?id=4530148063',
    boardsRequested: 'Ribbon',
    projectFileLocation: 'X:\\Jobs',
  })
  assert.equal(r.complete, false)
  assert.ok(r.directionLength < 15, 'a label plus a link is not direction')
  assert.ok(r.missing.some((m) => /only a link/.test(m)))
})

test('a bare file path is not creative direction either', () => {
  const r = assessDesignBrief({ notes: 'X:\\Jobs-RH\\2026\\MET-NYG\\_SUPPLIED_ASSETS\\Crestron' })
  assert.equal(r.directionLength, 0)
  assert.ok(r.missing.some((m) => /only a link/.test(m)))
})

test('an empty brief asks for direction rather than blaming a link', () => {
  for (const notes of [null, undefined, '', '   ']) {
    const r = assessDesignBrief({ notes })
    assert.ok(
      r.missing.some((m) => /what should be designed/.test(m)),
      `${JSON.stringify(notes)} should ask for direction`,
    )
  }
})

test('links around real direction do not count against its length', () => {
  const r = assessDesignBrief({
    notes:
      'Swap the sponsor logo on the courtside table and refresh the lower third text. Assets: https://example.com/pack.zip',
    boardsRequested: 'Courtside',
  })
  assert.equal(r.complete, true, 'the prose is what is measured, not the URL')
  assert.ok(r.directionLength >= MIN_DIRECTION_CHARS)
})

test('either boards or sizes satisfies the spec requirement', () => {
  const base = { notes: GOOD.notes, projectFileLocation: 'X:\\Jobs' }
  assert.equal(assessDesignBrief({ ...base, boardsRequested: 'Ribbon' }).complete, true)
  assert.equal(assessDesignBrief({ ...base, sizesRequested: '1920x80' }).complete, true)
  const neither = assessDesignBrief(base)
  assert.equal(neither.complete, false)
  assert.ok(neither.missing.some((m) => /Board specs/.test(m)))
})

test('assets named in the direction count — the field is not the only proof', () => {
  const r = assessDesignBrief({
    notes: 'Rebuild the opening titles using the supplied logo artwork and team photos provided by the client.',
    boardsRequested: 'Main Board',
  })
  assert.equal(r.complete, true, 'saying where assets are is as good as recording it')
})

test('a brief that needs no assets can say so', () => {
  const r = assessDesignBrief({
    notes: 'Typography-only build, no assets needed. Use the 2026 team wordmark already in the template library.',
    sizesRequested: '1920x1080',
  })
  assert.equal(r.complete, true)
})

test('every missing piece is reported at once, not one at a time', () => {
  const r = assessDesignBrief({ notes: 'make it pop' })
  assert.equal(r.missing.length, 3, 'direction, specs and assets are all named in one pass')
})

test('stripReferences leaves prose intact', () => {
  assert.equal(stripReferences('Use https://a.com/x.zip and \\\\server\\share now'), 'Use and now')
  assert.equal(stripReferences(null), '')
  assert.equal(stripReferences('  spaced   out  '), 'spaced out')
})

test('the regexes are stateless across calls', () => {
  // Global regexes carry lastIndex; a leaked one makes the second identical
  // call disagree with the first, which is the nastiest possible bug here.
  const input = { notes: 'Assets at https://example.com/a.zip', boardsRequested: 'Ribbon' }
  const first = assessDesignBrief(input)
  const second = assessDesignBrief(input)
  assert.deepEqual(first, second, 'the same brief must assess identically every time')
})
