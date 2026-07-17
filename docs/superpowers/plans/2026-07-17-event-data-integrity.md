# Event Data Integrity Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Service Dashboard from inventing venues and fabricating event times, so that any downstream coverage/revenue reporting is built on facts.

**Architecture:** Three independent defects, each fixed at its root. (1) The email webhook's "no match → create a venue from the sender's domain" branch is deleted and replaced with an explicit unmatched-sender review queue. (2) The magic-midnight "we never knew the time" convention is replaced with explicit `start_time_known` / `end_time_known` boolean columns, and the fabricated `+3h` end is no longer emitted for unknown starts. (3) The digest stops hard-coding `America/New_York` and reads `venues.timezone`, and the duplicate digest cron is retired.

**Tech Stack:** Next.js App Router (route handlers), PostgreSQL (`anc_services` DB, container `anc-services-db-standalone`, user `ancservices`), `node:test` + `.test.mjs` (the established runnable test pattern — see `package.json` script `test:proof-security`).

## Global Constraints

- Repo: `/root/anc-services`. Deploy is push-to-EasyPanel (`abc_anc-services`). Run `npm run build` locally before any push.
- Schema changes in this repo are applied via idempotent `ALTER TABLE ... IF NOT EXISTS` in `lib/db.ts`, NOT via a migrations folder. Follow the existing pattern (see `lib/db.ts:192`).
- Do NOT change the venue-level staffing source of truth in this phase. `events.requires_staffing ?? venues.requires_assignment` stays exactly as-is. Rewiring it to `client_services` is Phase 2 (`2026-07-17-coverage-map.md`) and must not be smuggled in here.
- Joe's standing rule (`lib/event-discovery.ts:1230`, `daily-event-digest/route.ts:105`): discovery must NOT bake `requires_staffing` on import. It stays NULL unless an admin sets a per-event override. Preserve this.
- Destructive data work is soft-delete only (`venues.is_active = false`). No `DELETE FROM`.
- No magic values. If a time is unknown, that must be represented by an explicit flag, never by a sentinel timestamp.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/db.ts` | Idempotent schema bootstrap | Add `events.start_time_known`, `events.end_time_known`, create `unmatched_email_senders` |
| `app/api/webhooks/email/route.ts` | Inbound email → ticket + venue match | **Delete** the auto-create branch (~lines 294-325); record unmatched senders instead |
| `lib/event-discovery.ts` | Feed ingestion engine | Stop fabricating `+3h` ends; set the known-flags on insert |
| `lib/timezone.ts` | Time combination helpers | Return known-flags alongside instants |
| `app/api/cron/daily-events-brief/route.ts` | The live digest | Read `venues.timezone`; render TBD from flags |
| `app/events/EventsClient.tsx` | Events list UI | Render TBD from flags, delete midnight-sniffing |
| `app/api/cron/daily-event-digest/route.ts` | Older duplicate digest | Retire |
| `tests/event-time-resolution.test.mjs` | New | Covers time resolution + flags |
| `tests/email-venue-matching.test.mjs` | New | Covers the match ladder, proves no auto-create |
| `scripts/backfill-event-time-flags.mjs` | New | One-shot backfill of the 2,470 placeholder rows |
| `scripts/quarantine-domain-venues.mjs` | New | One-shot soft-delete of the 24 junk venues |

---

### Task 1: Explicit time-known flags in the schema

**Files:**
- Modify: `lib/db.ts:192` (alongside the existing `requires_staffing` ALTER)

**Interfaces:**
- Produces: `events.start_time_known BOOLEAN NOT NULL DEFAULT true`, `events.end_time_known BOOLEAN NOT NULL DEFAULT true`. Every later task reads these. `true` means a feed supplied a real time; `false` means it was unknown and any stored timestamp is a placeholder that must never be rendered.

- [ ] **Step 1: Add the columns next to the existing requires_staffing bootstrap**

In `lib/db.ts`, immediately after the existing line:
```ts
await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_staffing BOOLEAN`)
```
add:
```ts
// Times are only trustworthy when a feed actually supplied them. Discovery
// stores a local-midnight placeholder when it doesn't, so a timestamp alone
// cannot tell you whether it's real. These flags carry that fact explicitly
// and replace the old "midnight means unknown" convention, which mislabelled
// genuine midnight events and could not describe an unknown end time at all.
await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS start_time_known BOOLEAN NOT NULL DEFAULT true`)
await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time_known BOOLEAN NOT NULL DEFAULT true`)
```

- [ ] **Step 2: Apply and verify the columns exist**

Run:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "\d events" | grep time_known
```
Expected: two rows, `start_time_known | boolean | not null | true` and `end_time_known | boolean | not null | true`.

- [ ] **Step 3: Commit**

```bash
cd /root/anc-services
git add lib/db.ts
git commit -m "feat(events): add explicit start_time_known/end_time_known flags"
```

---

### Task 2: Stop fabricating end times in discovery

**Files:**
- Modify: `lib/timezone.ts:74-77`
- Modify: `lib/event-discovery.ts:1193-1216`
- Test: `tests/event-time-resolution.test.mjs` (create)

**Interfaces:**
- Consumes: `events.start_time_known` / `events.end_time_known` from Task 1.
- Produces: `resolveEventTimes({ eventDate, startIso, startHHMM, endIso, endHHMM, timeZone }) => { startUtc: Date, endUtc: Date, startKnown: boolean, endKnown: boolean }` exported from `lib/timezone.ts`. Task 4 and Task 5 rely on the flag names `startKnown` / `endKnown`.

- [ ] **Step 1: Write the failing test**

Create `tests/event-time-resolution.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEventTimes } from '../lib/timezone.ts'

test('a feed-supplied start and end are both known', () => {
  const r = resolveEventTimes({
    eventDate: '2026-07-17', startHHMM: '19:00', endHHMM: '22:00', timeZone: 'America/New_York',
  })
  assert.equal(r.startKnown, true)
  assert.equal(r.endKnown, true)
  assert.equal(r.startUtc.toISOString(), '2026-07-17T23:00:00.000Z')
})

test('an unknown start is flagged and does NOT fabricate a +3h end', () => {
  const r = resolveEventTimes({ eventDate: '2026-07-17', timeZone: 'America/New_York' })
  assert.equal(r.startKnown, false)
  assert.equal(r.endKnown, false)
  // The placeholder instants still exist (columns are NOT NULL) but both are
  // pinned to local midnight — no invented 3-hour window.
  assert.equal(r.startUtc.getTime(), r.endUtc.getTime())
})

test('a known start with an unknown end flags only the end', () => {
  const r = resolveEventTimes({
    eventDate: '2026-07-17', startHHMM: '19:00', timeZone: 'America/New_York',
  })
  assert.equal(r.startKnown, true)
  assert.equal(r.endKnown, false)
})

test('a genuine midnight event is known, not TBD', () => {
  const r = resolveEventTimes({
    eventDate: '2026-07-17', startHHMM: '00:00', endHHMM: '02:00', timeZone: 'America/New_York',
  })
  assert.equal(r.startKnown, true)
})

test('venue timezone is honoured, not assumed Eastern', () => {
  const r = resolveEventTimes({
    eventDate: '2026-07-17', startHHMM: '19:00', timeZone: 'America/Los_Angeles',
  })
  assert.equal(r.startUtc.toISOString(), '2026-07-18T02:00:00.000Z')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /root/anc-services && node --test tests/event-time-resolution.test.mjs`
Expected: FAIL — `resolveEventTimes` is not exported from `lib/timezone.ts`.

> If `node --test` cannot import the `.ts` module directly, run it under the repo's TS loader: `node --import tsx --test tests/event-time-resolution.test.mjs`, and add that exact form to the `test:events` script in Step 5. Do not rewrite the module to `.js` to dodge this.

- [ ] **Step 3: Implement `resolveEventTimes` in `lib/timezone.ts`**

Append to `lib/timezone.ts`:
```ts
export type ResolvedEventTimes = {
  startUtc: Date
  endUtc: Date
  startKnown: boolean
  endKnown: boolean
}

/**
 * Resolve a feed's loose date/time fields into UTC instants plus honest
 * flags about what was actually supplied.
 *
 * When a feed gives no start, we still must store something (start_time is
 * NOT NULL), so we pin local midnight — but startKnown=false marks it as a
 * placeholder. Critically, an unknown start no longer invents a +3h end:
 * that fabricated window is what leaked into Slack as "TBD → 03:00 AM".
 */
export function resolveEventTimes(input: {
  eventDate: string
  startIso?: string | null
  startHHMM?: string | null
  endIso?: string | null
  endHHMM?: string | null
  timeZone: string
}): ResolvedEventTimes {
  const { eventDate, startIso, startHHMM, endIso, endHHMM, timeZone } = input

  let startUtc: Date
  let startKnown: boolean
  if (startIso) {
    startUtc = new Date(startIso)
    startKnown = true
  } else if (startHHMM) {
    startUtc = combineLocalToUtc(eventDate, startHHMM, timeZone) ?? new Date(`${eventDate}T00:00:00Z`)
    startKnown = true
  } else {
    startUtc = combineLocalToUtc(eventDate, '00:00', timeZone) ?? new Date(`${eventDate}T00:00:00Z`)
    startKnown = false
  }

  let endUtc: Date
  let endKnown: boolean
  if (endIso) {
    endUtc = new Date(endIso)
    endKnown = true
  } else if (endHHMM) {
    endUtc = combineLocalToUtc(eventDate, endHHMM, timeZone) ?? startUtc
    endKnown = !!combineLocalToUtc(eventDate, endHHMM, timeZone)
  } else {
    endUtc = startUtc
    endKnown = false
  }

  // A known end that lands at or before a known start means the event crosses
  // midnight (e.g. 10:00 PM → 01:00 AM). Roll it to the next day rather than
  // discarding the feed's real value.
  if (endKnown && startKnown && endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(endUtc.getTime() + 24 * 3600_000)
  }

  return { startUtc, endUtc, startKnown, endKnown }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /root/anc-services && node --test tests/event-time-resolution.test.mjs`
Expected: PASS, 5/5.

- [ ] **Step 5: Add a test script to `package.json`**

In the `"scripts"` block, add:
```json
"test:events": "node --test tests/event-time-resolution.test.mjs"
```

- [ ] **Step 6: Wire discovery to the new helper**

In `lib/event-discovery.ts`, replace the whole block at lines 1193-1216 (from `let startUtc: Date` through the `if (endUtc.getTime() <= startUtc.getTime())` guard) with:
```ts
    const times = resolveEventTimes({
      eventDate: event.event_date,
      startIso: event.start_iso,
      startHHMM: event.start_time,
      endIso: event.end_iso,
      endHHMM: event.end_time,
      timeZone: venueTimezone,
    })
    const { startUtc, endUtc } = times
```
and update the import at `lib/event-discovery.ts:7`:
```ts
import { combineLocalToUtc, resolveEventTimes } from '@/lib/timezone'
```

- [ ] **Step 7: Persist the flags on insert**

In the `INSERT INTO events (...)` statement that begins at `lib/event-discovery.ts:1233`, add `start_time_known, end_time_known` to the column list and `times.startKnown, times.endKnown` to the parameter array, keeping positional placeholders in sync. Do NOT touch the `requires_staffing` handling — Joe's rule stands.

- [ ] **Step 8: Verify the build and tests**

Run:
```bash
cd /root/anc-services && npm run test:events && npm run build
```
Expected: tests PASS, build succeeds.

- [ ] **Step 9: Commit**

```bash
cd /root/anc-services
git add lib/timezone.ts lib/event-discovery.ts tests/event-time-resolution.test.mjs package.json
git commit -m "fix(discovery): stop fabricating +3h end times for unknown starts"
```

---

### Task 3: Backfill the flags on existing rows

**Files:**
- Create: `scripts/backfill-event-time-flags.mjs`

**Interfaces:**
- Consumes: `events.start_time_known` / `events.end_time_known` from Task 1.
- Produces: correct flags on all ~12k existing rows. Tasks 4 and 5 render from these, so this must run before the digest change reaches production.

**Context:** ~2,470 of ~6,700 events in the last 30 days carry the placeholder. The signature is local-midnight start with an end exactly 3 hours later, evaluated in the **venue's** timezone (`COALESCE(v.timezone, 'America/New_York')`) — not Eastern, or Pacific venues will be misclassified.

- [ ] **Step 1: Write the backfill script**

Create `scripts/backfill-event-time-flags.mjs`:
```js
#!/usr/bin/env node
// One-shot: reconstruct start_time_known/end_time_known for rows inserted
// before the flags existed. The old placeholder signature is a local-midnight
// start with an end fabricated exactly 3h later, in the VENUE's timezone.
// Run with --apply to write; default is a dry-run count.
import pg from 'pg'

const apply = process.argv.includes('--apply')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const PREDICATE = `
  (e.start_time AT TIME ZONE COALESCE(v.timezone, 'America/New_York'))::time = '00:00'
  AND e.end_time = e.start_time + interval '3 hours'
`

const { rows: [before] } = await client.query(
  `SELECT COUNT(*)::int AS n FROM events e LEFT JOIN venues v ON v.id = e.venue_id WHERE ${PREDICATE}`
)
console.log(`placeholder rows detected: ${before.n}`)

if (!apply) {
  console.log('dry-run — pass --apply to write')
  await client.end()
  process.exit(0)
}

const res = await client.query(`
  UPDATE events e
     SET start_time_known = false, end_time_known = false
    FROM venues v
   WHERE v.id = e.venue_id AND ${PREDICATE}
`)
console.log(`rows flagged unknown: ${res.rowCount}`)

// Events whose venue row is missing entirely: same midnight test, ET fallback.
const orphan = await client.query(`
  UPDATE events e
     SET start_time_known = false, end_time_known = false
   WHERE e.venue_id IS NULL
     AND (e.start_time AT TIME ZONE 'America/New_York')::time = '00:00'
     AND e.end_time = e.start_time + interval '3 hours'
`)
console.log(`orphan-venue rows flagged unknown: ${orphan.rowCount}`)

await client.end()
```

- [ ] **Step 2: Dry-run and sanity-check the count**

Run:
```bash
cd /root/anc-services && DATABASE_URL="postgresql://ancservices@localhost/anc_services" node scripts/backfill-event-time-flags.mjs
```
Expected: a printed count in the low thousands (~2,400-2,600 for the last 30 days plus older rows). If it prints `0` or the full table count, STOP — the predicate is wrong, do not `--apply`.

- [ ] **Step 3: Apply**

Run the same command with `--apply` appended.

- [ ] **Step 4: Verify against a known-good row**

Run:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT start_time_known, end_time_known, count(*) FROM events GROUP BY 1,2 ORDER BY 3 DESC;"
```
Expected: a large `f | f` bucket and a large `t | t` bucket. Then confirm a real-timed event survived as known:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT summary, start_time, start_time_known FROM events
WHERE summary ILIKE '%Megan Moroney%' LIMIT 3;"
```
Expected: `start_time_known = t` (that event had a real 10:00 PM start in the digest).

- [ ] **Step 5: Commit**

```bash
cd /root/anc-services
git add scripts/backfill-event-time-flags.mjs
git commit -m "chore(events): backfill time-known flags for pre-flag rows"
```

---

### Task 4: Render TBD from the flags, and honour venue timezone in the digest

**Files:**
- Modify: `app/api/cron/daily-events-brief/route.ts:51-75` (the query) and `:191` (the time string)
- Modify: `app/events/EventsClient.tsx:388-390` (delete the midnight-sniffing convention)

**Interfaces:**
- Consumes: `events.start_time_known` / `events.end_time_known`.
- Produces: a digest whose `start_et` / `end_et` are `'TBD'` if and only if the flag says the time is unknown, computed in the venue's own timezone.

- [ ] **Step 1: Replace the two hard-coded CASE expressions in the query**

In `app/api/cron/daily-events-brief/route.ts`, replace lines 53-58 with:
```sql
              CASE WHEN e.start_time_known
                   THEN TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone, 'America/New_York'), 'HH12:MI AM')
                   ELSE 'TBD' END as start_et,
              CASE WHEN e.end_time_known
                   THEN TO_CHAR(e.end_time AT TIME ZONE COALESCE(v.timezone, 'America/New_York'), 'HH12:MI AM')
                   ELSE NULL END as end_et,
```
`end_et` becomes NULL rather than `'TBD'` because line 191 already suppresses the arrow when `end_et` is falsy — so an unknown end renders as a bare `10:00 PM` instead of the nonsense `10:00 PM → TBD`.

Then add `v.timezone` to the `GROUP BY` at line 73:
```sql
       GROUP BY e.id, v.name, v.requires_assignment, v.timezone
```

- [ ] **Step 2: Verify the "TBD → 03:00 AM" string can no longer be produced**

Run:
```bash
cd /root/anc-services && grep -n "03:00\|TBD" app/api/cron/daily-events-brief/route.ts
```
Expected: `'TBD'` appears only in the `start_et` CASE and in `toMinutes()` (line 121, which sorts TBD to the bottom — leave it). No `+ 3 hours` anywhere.

- [ ] **Step 3: Delete the midnight convention from the events page**

In `app/events/EventsClient.tsx`, find the comment block at lines 388-390 ("Exact midnight in venue-local time = 'we never knew the start time'…") and the code it guards. Replace the midnight comparison with a read of `start_time_known` from the row. Update the comment to:
```ts
// Unknown times are marked explicitly by events.start_time_known /
// end_time_known. Do not infer from the timestamp — a real midnight event
// is a real event, and the old midnight-sniffing convention mislabelled it.
```
Ensure the API route feeding this component selects both flags.

- [ ] **Step 4: Build**

Run: `cd /root/anc-services && npm run build`
Expected: succeeds.

- [ ] **Step 5: Verify the digest renders correctly WITHOUT posting to Slack**

The route fans out to Slack on every GET, so do not curl production. Temporarily point it at a scratch channel via env, or assert the query directly:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT e.summary,
       CASE WHEN e.start_time_known THEN TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') ELSE 'TBD' END AS start_et,
       CASE WHEN e.end_time_known THEN TO_CHAR(e.end_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') ELSE NULL END AS end_et
FROM events e LEFT JOIN venues v ON v.id=e.venue_id
WHERE e.event_date = CURRENT_DATE ORDER BY e.start_time LIMIT 10;"
```
Expected: rows show either a real time pair or `TBD | (null)`. **No row shows `TBD | 03:00 AM`.**

- [ ] **Step 6: Commit**

```bash
cd /root/anc-services
git add app/api/cron/daily-events-brief/route.ts app/events/EventsClient.tsx
git commit -m "fix(digest): render TBD from explicit flags, honour venue timezone"
```

---

### Task 5: Delete the venue auto-create branch, add an unmatched-sender queue

**Files:**
- Modify: `lib/db.ts` (create `unmatched_email_senders`)
- Modify: `app/api/webhooks/email/route.ts` (delete step 5, ~lines 294-325; tighten step 4)
- Test: `tests/email-venue-matching.test.mjs` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `unmatched_email_senders(sender_email TEXT PRIMARY KEY, sender_domain TEXT, subject TEXT, hit_count INT, first_seen_at TIMESTAMPTZ, last_seen_at TIMESTAMPTZ, resolved_venue_id UUID NULL)`. Phase 2 does not depend on this; an admin review UI is deliberately out of scope (YAGNI — the table is queryable and the volume is ~24 domains over the system's whole life).

**Context:** The route already states "SLA + auto-assignment (works for matched and unmatched)", so a NULL `venueId` is a fully supported path. Deleting the auto-create branch does not break ticket intake.

- [ ] **Step 1: Write the failing test**

Create `tests/email-venue-matching.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveVenueNameFromDomain, isGenericDomain } from '../app/api/webhooks/email/matching.ts'

test('generic consumer domains are never venue candidates', () => {
  assert.equal(isGenericDomain('gmail.com'), true)
  assert.equal(isGenericDomain('anc.com'), true)
  assert.equal(isGenericDomain('prucenter.com'), false)
})

test('deriveVenueNameFromDomain is still available for the admin create path', () => {
  assert.equal(deriveVenueNameFromDomain('wmata.com'), 'WMATA')
})
```
This test exists to lock the helpers as pure and reusable once they are extracted out of the deleted branch. The real assertion — that no venue is created — is verified in Step 5 against the live table.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /root/anc-services && node --test tests/email-venue-matching.test.mjs`
Expected: FAIL — module `app/api/webhooks/email/matching.ts` does not exist.

- [ ] **Step 3: Extract the pure helpers, then delete the auto-create branch**

Create `app/api/webhooks/email/matching.ts`:
```ts
export const GENERIC_DOMAINS = [
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  'aol.com', 'live.com', 'msn.com', 'protonmail.com', 'anc.com',
]

export function isGenericDomain(domain: string): boolean {
  return GENERIC_DOMAINS.includes(domain.toLowerCase())
}

/** "wmata.com" → "WMATA", "orlandomagic.com" → "Orlando Magic". */
export function deriveVenueNameFromDomain(domain: string): string {
  const base = domain.split('.')[0]
  let name = base
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)/g, (m: string) =>
      m.length <= 4 ? m.toUpperCase() : m.charAt(0).toUpperCase() + m.slice(1).toLowerCase())
    .trim()
  if (name.length <= 5) name = name.toUpperCase()
  return name
}
```

In `app/api/webhooks/email/route.ts`, **delete the entire step-5 block** (`// 5. No match — auto-create venue from domain` through the closing brace of that `if`, ~lines 294-325) and replace it with:
```ts
    // 5. No match — record the sender for review. We deliberately do NOT
    // create a venue here. Domain-derived venues produced 24 phantom rows
    // ("microsoft", "amtrak", "mailer", "denvergov") carrying 650 events,
    // every one born requires_assignment=false and therefore silently counted
    // as "warranty only" in the ops digest. The ticket path below already
    // supports a NULL venueId; an unmatched sender is a data question for a
    // human, not something to guess at.
    if (!venueId && senderDomain && !isGenericDomain(senderDomain)) {
      await query(
        `INSERT INTO unmatched_email_senders (sender_email, sender_domain, subject, hit_count, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, 1, NOW(), NOW())
         ON CONFLICT (sender_email) DO UPDATE
           SET hit_count = unmatched_email_senders.hit_count + 1,
               last_seen_at = NOW(),
               subject = EXCLUDED.subject`,
        [senderEmail.toLowerCase(), senderDomain, subject || '']
      )
      matchMethod = 'unmatched — queued for review'
      console.log(`[email-webhook] No venue match for ${senderEmail}; queued for review`)
    }
```
Replace the three existing `!genericDomains.includes(senderDomain)` checks (steps 3, 4, 5) with `!isGenericDomain(senderDomain)` and delete the local `genericDomains` array.

- [ ] **Step 4: Add the table to `lib/db.ts`**

```ts
// Senders we could not match to a venue. Previously the webhook invented a
// venue from the sender's domain; this queue replaces that guess.
await client.query(`
  CREATE TABLE IF NOT EXISTS unmatched_email_senders (
    sender_email      TEXT PRIMARY KEY,
    sender_domain     TEXT NOT NULL,
    subject           TEXT,
    hit_count         INT NOT NULL DEFAULT 1,
    first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_venue_id UUID REFERENCES venues(id) ON DELETE SET NULL
  )
`)
```

- [ ] **Step 5: Run tests, build, and prove no INSERT INTO venues remains in the webhook**

Run:
```bash
cd /root/anc-services
node --test tests/email-venue-matching.test.mjs
grep -n "INSERT INTO venues" app/api/webhooks/email/route.ts
npm run build
```
Expected: tests PASS; the grep returns **nothing**; build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /root/anc-services
git add lib/db.ts app/api/webhooks/email/route.ts app/api/webhooks/email/matching.ts tests/email-venue-matching.test.mjs
git commit -m "fix(email-webhook): stop inventing venues from sender domains"
```

---

### Task 6: Quarantine the 24 phantom venues

**Files:**
- Create: `scripts/quarantine-domain-venues.mjs`

**Interfaces:**
- Consumes: the auto-create path must already be dead (Task 5), or the phantoms regenerate on the next inbound email.

**Context:** 24 venues match `^[a-z0-9-]+$` with no space — `lightware`, `adachielectric`, `marketers1`, `denvergov`, `pivotal-cm`, `microsoft`, `google`, `amtrak`, `mailer`, etc. — carrying 650 events. Soft-delete only. The events stay: they are real events wrongly attributed, and deleting them would silently shrink historical counts.

**Decision (Ahmad's call pending — default taken):** soft-delete the venue (`is_active = false`), leave the events attached. They fall out of `is_active` surfaces without vanishing from the record. Do NOT null `events.venue_id` — that destroys the only evidence of where the row came from.

- [ ] **Step 1: Write the script with an explicit reviewed allowlist**

Create `scripts/quarantine-domain-venues.mjs`:
```js
#!/usr/bin/env node
// One-shot: deactivate venues that were auto-created from email sender
// domains. The list is EXPLICIT, not a regex sweep — a regex on
// "lowercase, no spaces" would also catch a legitimately-named venue.
// Verify each name before adding to this list. Run with --apply to write.
import pg from 'pg'

const PHANTOMS = [
  'lightware', 'adachielectric', 'marketers1', 'denvergov', 'pivotal-cm',
  'microsoft', 'google', 'amtrak', 'mailer', 'nutramarck', 'newtradition',
  'gvskpharma', 'omegasignchicago', 'buildyourvisibility', 'omnihotels',
  'racarena', 'shipbusinessproai', 'bedrockdetroit', 'melissaisd',
  'mthsec', 'iveefm', 'cybras', 'seaportentertainment', 'heritageooh',
]

const apply = process.argv.includes('--apply')
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const { rows } = await client.query(
  `SELECT v.name, v.is_active, COUNT(e.id)::int AS events
     FROM venues v LEFT JOIN events e ON e.venue_id = v.id
    WHERE v.name = ANY($1) GROUP BY v.id, v.name, v.is_active ORDER BY events DESC`,
  [PHANTOMS]
)
console.table(rows)
console.log(`venues matched: ${rows.length} / ${PHANTOMS.length} listed`)

if (!apply) {
  console.log('dry-run — pass --apply to write')
  await client.end()
  process.exit(0)
}

const res = await client.query(
  `UPDATE venues SET is_active = false WHERE name = ANY($1) AND is_active = true`,
  [PHANTOMS]
)
console.log(`venues deactivated: ${res.rowCount}`)
await client.end()
```

- [ ] **Step 2: Dry-run and eyeball every name**

Run:
```bash
cd /root/anc-services && DATABASE_URL="postgresql://ancservices@localhost/anc_services" node scripts/quarantine-domain-venues.mjs
```
Expected: a table of ~24 rows. **Read every name.** If any row looks like a real ANC venue, remove it from `PHANTOMS` before applying. `seaportentertainment` and `bedrockdetroit` are real companies — confirm with Ahmad whether they are real ANC accounts that merely got created through the wrong door, or noise.

- [ ] **Step 3: Apply**

Run the same command with `--apply`.

- [ ] **Step 4: Verify the warranty-only inflation actually dropped**

Run:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT requires_assignment, count(*) FROM venues WHERE is_active GROUP BY 1;"
```
Expected: the `f` bucket falls from 188 toward ~164. It will still be large — that is Phase 2's problem, not a bug in this task.

- [ ] **Step 5: Commit**

```bash
cd /root/anc-services
git add scripts/quarantine-domain-venues.mjs
git commit -m "chore(venues): quarantine 24 phantom venues auto-created from email domains"
```

---

### Task 7: Retire the duplicate digest cron

**Files:**
- Delete: `app/api/cron/daily-event-digest/route.ts`
- Modify: root crontab, `docs/CRON_EVENT_DIGESTS.md`

**Context:** Two overlapping live jobs post today's events to Slack: `daily-events-brief` (the `:sunrise:`/`:crescent_moon:` one Ahmad pasted, fans out to `SLACK_WORKFLOW_DIGEST_CHANNEL`) and the older `daily-event-digest` (`:calendar: *Today's ANC Events*`, `SLACK_DEFAULT_CHANNEL` only, gated on the `automation_jobs` table). `daily-events-brief` is the one being fixed. The old one carries the same TBD/timezone bugs and will silently keep posting wrong times.

- [ ] **Step 1: Confirm what the old job is currently doing before removing it**

Run:
```bash
crontab -l | grep -i digest
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT * FROM automation_jobs WHERE name ILIKE '%digest%' OR name ILIKE '%event%';"
```
Record the output in the commit message. If the `automation_jobs` row is disabled, the job is already dormant and this is pure cleanup.

- [ ] **Step 2: Remove the crontab entry**

Edit the root crontab to delete the `daily-event-digest` line, leaving both `daily-events-brief` lines intact.

- [ ] **Step 3: Delete the route and update the docs**

```bash
cd /root/anc-services
git rm -r app/api/cron/daily-event-digest
```
Update `docs/CRON_EVENT_DIGESTS.md` to describe only the surviving job and note that the old one was retired on 2026-07-17 as a duplicate.

- [ ] **Step 4: Build**

Run: `cd /root/anc-services && npm run build`
Expected: succeeds. If anything imports the deleted route, fix the importer — do not restore the route.

- [ ] **Step 5: Commit**

```bash
cd /root/anc-services
git add -A app/api/cron docs/CRON_EVENT_DIGESTS.md
git commit -m "chore(cron): retire duplicate daily-event-digest job"
```

---

### Task 8: Ship and verify on the real surface

- [ ] **Step 1: Full build**

Run: `cd /root/anc-services && npm run build`
Expected: succeeds.

- [ ] **Step 2: Push (push = deploy for this repo)**

```bash
cd /root/anc-services
git push
```

- [ ] **Step 3: Confirm the deployed SHA**

Trust only the deployed SHA, never container age. Use the `easypanel` skill's verification pattern against `abc_anc-services`.

- [ ] **Step 4: Verify the artifact — read the actual Slack post**

Wait for the 5pm ET (`21:00 UTC`) evening run, then open the digest in Slack and confirm:
- No line reads `TBD → 03:00 AM`.
- Events with real feed times (e.g. a `10:00 PM → 01:00 AM` concert) still render their real window.
- No phantom venues (`lightware`, `denvergov`, `marketers1`) appear.
- The event count dropped by roughly the phantom-venue contribution.

This is the completion gate. A green build is not "done" — the posted message is.

---

## Self-Review

**Spec coverage:** domain auto-create → Task 5 + Task 6. Fabricated times → Task 2 + Task 3. Digest timezone hardcode → Task 4. Duplicate cron → Task 7. All four covered.

**Known gap, deliberate:** `lib/twenty-sync.ts:212` pushes the circular `staffingRequired: hasAssignedTechs` to the CRM. Left alone here on purpose — it is the core of Phase 2 and changing it now would alter CRM data before the venue linkage exists to make it meaningful.

**Open decision for Ahmad:** `seaportentertainment` and `bedrockdetroit` are real companies sitting in the phantom list (Task 6, Step 2). Default is to quarantine them with the rest; they can be recreated properly through the admin path.
