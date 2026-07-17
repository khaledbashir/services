# Coverage Map Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "warranty only — no staffing required" mean *this client does not pay us for staffing*, instead of *nobody happened to be assigned* — so the nightly digest reports contracted-service delivery instead of restating its own emptiness.

**Architecture:** `needsStaffing` is rewired from `venues.requires_assignment` (a hand-set boolean, false on 188 of 232 venues) to a contract-derived fact: does this venue's client have `Event Support` or `Game Day Support` enabled in `client_services`? That data already exists, is fully populated, and is already queried-then-discarded by the digest. The circular `staffingRequired: hasAssignedTechs` pushed to the CRM is replaced with the same contract-derived value. No CRM read is required.

**Tech Stack:** Next.js App Router, PostgreSQL (`anc_services`), `node:test` + `.test.mjs`.

## Global Constraints

- **BLOCKED ON PHASE 1** (`2026-07-17-event-data-integrity.md`). Do not start until Phase 1 Task 8 is verified on the real Slack surface. A coverage map built on 2,470 fabricated times and 650 phantom-venue events produces confidently wrong numbers, and those are the ones that get quoted in a meeting.
- Repo `/root/anc-services`. Push = deploy. `npm run build` before push.
- Schema changes go in `lib/db.ts` as idempotent `ALTER TABLE ... IF NOT EXISTS`.
- Joe's rule survives: `events.requires_staffing` remains the per-event admin override and still beats any derived value. Discovery still must not bake it on import.
- **Do NOT build a renewal overlay.** See "Verified constraints" below.
- No magic values. The staffing service types are resolved by name from `service_types`, never by hard-coded UUID.

## Verified constraints (checked 2026-07-17 — do not re-litigate)

| Fact | Value | Consequence |
|---|---|---|
| `client_services` rows with `Event Support` enabled | 23 clients | The signal is real |
| `Game Day Support` enabled | 0 clients | Include it anyway — it's the correct type, just unused today |
| Active venues with a `client_venues` link | **232 / 232** | Contract-derived staffing is computable for every venue; no fallback branch needed |
| CRM `company.contractEnd` populated | **0 of 4,410** | Renewal-risk reporting is NOT buildable. Field is an empty shell. |
| CRM `company.annualContractValueAmountMicros` populated | **0 of 4,410** | No revenue weighting is possible |
| CRM `company.venueName` populated | 13 of 4,410 | `venues.twenty_id` backfill has almost nothing to match on |
| Events (last 30d) at venues paying for staffing | 210 of 1,408 | The denominator for coverage |
| …of those, with zero assignments | **176 (84%)** | The headline finding — see Task 4 |

## The 176 question — resolve before Task 4

176 of 210 contracted-staffing events have no assignment recorded. Two possible readings:

1. ANC is not staffing events it is contractually obligated to staff. (Severe.)
2. Staffing happens in the field but is never recorded in the dashboard — supported by the digest's own `0/36 checked in`, `0/36 game-ready`.

**Reading 2 is far more likely, and the wording of the digest depends entirely on which is true.** Task 4 must not ship language asserting a delivery failure until Ahmad confirms with Joe/Alexis. Until then the digest says *"no ANC presence recorded"*, never *"unstaffed"*. That word choice is the whole deliverable's credibility.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `lib/staffing.ts` | **New.** Single source of truth for "does this event need ANC staff?" | Create |
| `tests/staffing-requirement.test.mjs` | **New.** Locks the resolution order | Create |
| `app/api/cron/daily-events-brief/route.ts` | The digest | Consume `lib/staffing.ts`; invert the evening recap |
| `lib/twenty-sync.ts:212` | CRM push | Replace circular `hasAssignedTechs` |
| `app/events/EventsClient.tsx`, `app/events/[id]/page.tsx` | Events UI | Consume the same resolver |

---

### Task 1: A single, contract-derived staffing resolver

**Files:**
- Create: `lib/staffing.ts`
- Test: `tests/staffing-requirement.test.mjs`

**Interfaces:**
- Produces:
  - `STAFFING_SERVICE_TYPES: readonly string[]` — `['Event Support', 'Game Day Support']`
  - `resolveStaffing(row: { event_requires_staffing: boolean | null, client_pays_for_staffing: boolean }) => { needed: boolean, reason: 'event-override' | 'contracted' | 'not-contracted' }`
  - `STAFFING_JOIN_SQL: string` — the reusable SQL fragment producing `client_pays_for_staffing`
- Every later task consumes these exact names.

**Context:** the current resolver (`daily-events-brief/route.ts:99-103`) reads `venues.requires_assignment`, which is `false` on 188 of 232 active venues and was hard-coded `false` by the now-deleted email auto-create branch. It carries no contractual meaning.

- [ ] **Step 1: Write the failing test**

Create `tests/staffing-requirement.test.mjs`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveStaffing, STAFFING_SERVICE_TYPES } from '../lib/staffing.ts'

test('an admin event override beats the contract, both directions', () => {
  assert.equal(resolveStaffing({ event_requires_staffing: true, client_pays_for_staffing: false }).needed, true)
  assert.equal(resolveStaffing({ event_requires_staffing: true, client_pays_for_staffing: false }).reason, 'event-override')
  assert.equal(resolveStaffing({ event_requires_staffing: false, client_pays_for_staffing: true }).needed, false)
})

test('with no override, a contracted client needs staffing', () => {
  const r = resolveStaffing({ event_requires_staffing: null, client_pays_for_staffing: true })
  assert.equal(r.needed, true)
  assert.equal(r.reason, 'contracted')
})

test('with no override and no staffing contract, no staffing is needed', () => {
  const r = resolveStaffing({ event_requires_staffing: null, client_pays_for_staffing: false })
  assert.equal(r.needed, false)
  assert.equal(r.reason, 'not-contracted')
})

test('the staffing service types are the two real ones, by name', () => {
  assert.deepEqual([...STAFFING_SERVICE_TYPES], ['Event Support', 'Game Day Support'])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /root/anc-services && node --test tests/staffing-requirement.test.mjs`
Expected: FAIL — `lib/staffing.ts` does not exist.

- [ ] **Step 3: Implement `lib/staffing.ts`**

```ts
/**
 * Whether an event needs ANC staff on site.
 *
 * Previously this read venues.requires_assignment — a hand-set boolean that
 * was false on 188 of 232 active venues (every venue auto-created from an
 * email domain was born false), so "warranty only — no staffing required"
 * was the system's default state rather than a statement about the contract.
 *
 * The real fact lives in client_services: does this venue's client pay for
 * Event Support or Game Day Support? Every active venue has a client link,
 * so this resolves for all of them.
 */
export const STAFFING_SERVICE_TYPES = ['Event Support', 'Game Day Support'] as const

export type StaffingReason = 'event-override' | 'contracted' | 'not-contracted'

export function resolveStaffing(row: {
  event_requires_staffing: boolean | null
  client_pays_for_staffing: boolean
}): { needed: boolean; reason: StaffingReason } {
  // Joe 2026-05-04: an admin's per-event override always wins.
  if (row.event_requires_staffing === true) return { needed: true, reason: 'event-override' }
  if (row.event_requires_staffing === false) return { needed: false, reason: 'event-override' }
  return row.client_pays_for_staffing
    ? { needed: true, reason: 'contracted' }
    : { needed: false, reason: 'not-contracted' }
}

/**
 * SQL fragment yielding a boolean `client_pays_for_staffing` per event.
 * Requires `events e` in scope. Service types are matched by name, not by
 * hard-coded UUID, so seeding a new workspace cannot silently break this.
 */
export const STAFFING_JOIN_SQL = `
  EXISTS (
    SELECT 1
      FROM client_venues cv
      JOIN client_services cs ON cs.client_id = cv.client_id AND cs.enabled
      JOIN service_types st ON st.id = cs.service_type_id
     WHERE cv.venue_id = e.venue_id
       AND st.name = ANY($$STAFFING_TYPES$$)
  ) AS client_pays_for_staffing
`
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /root/anc-services && node --test tests/staffing-requirement.test.mjs`
Expected: PASS, 4/4.

- [ ] **Step 5: Add the test script**

In `package.json` scripts: `"test:staffing": "node --test tests/staffing-requirement.test.mjs"`

- [ ] **Step 6: Commit**

```bash
cd /root/anc-services
git add lib/staffing.ts tests/staffing-requirement.test.mjs package.json
git commit -m "feat(staffing): contract-derived staffing resolver from client_services"
```

---

### Task 2: Wire the resolver into the digest query

**Files:**
- Modify: `app/api/cron/daily-events-brief/route.ts:51-75` (query), `:99-103` (resolver)

**Interfaces:**
- Consumes: `STAFFING_JOIN_SQL`, `resolveStaffing` from Task 1.
- Produces: every event row carries `client_pays_for_staffing`; `needsStaffing(e)` delegates to `resolveStaffing`.

- [ ] **Step 1: Add the contract join to the query**

Add to the SELECT list in `app/api/cron/daily-events-brief/route.ts` (after the `e.requires_staffing as event_requires_staffing` line), inlining the fragment with the service-type array bound as `$1`:
```sql
              EXISTS (
                SELECT 1
                  FROM client_venues cv
                  JOIN client_services cs ON cs.client_id = cv.client_id AND cs.enabled
                  JOIN service_types st ON st.id = cs.service_type_id
                 WHERE cv.venue_id = e.venue_id
                   AND st.name = ANY($1)
              ) as client_pays_for_staffing,
```
Pass the parameter on the `query()` call:
```ts
      [STAFFING_SERVICE_TYPES as unknown as string[]]
```
Keep `COALESCE(v.requires_assignment, true) as venue_requires_assignment` in the SELECT for now — Task 5 removes it once nothing reads it.

- [ ] **Step 2: Replace the local resolver with the shared one**

Replace lines 99-103 entirely:
```ts
    // Contract-derived (lib/staffing.ts). venues.requires_assignment is no
    // longer consulted: it was false on 188 of 232 venues and meant nothing.
    const needsStaffing = (e: any): boolean => resolveStaffing(e).needed
```
and add the import at the top:
```ts
import { resolveStaffing, STAFFING_SERVICE_TYPES } from '@/lib/staffing'
```

- [ ] **Step 3: Build and verify the numbers against the known baseline**

Run: `cd /root/anc-services && npm run build`

Then confirm the query agrees with the verified baseline:
```bash
docker exec anc-services-db-standalone psql -U ancservices -d anc_services -c "
SELECT count(*) FILTER (WHERE EXISTS (
  SELECT 1 FROM client_venues cv
  JOIN client_services cs ON cs.client_id=cv.client_id AND cs.enabled
  JOIN service_types st ON st.id=cs.service_type_id
  WHERE cv.venue_id=e.venue_id AND st.name IN ('Event Support','Game Day Support'))) AS contracted
FROM events e WHERE e.event_date BETWEEN CURRENT_DATE-30 AND CURRENT_DATE;"
```
Expected: **210** (the verified baseline, ± events added since 2026-07-17). If it returns 0 or the full 1,408, the join is wrong — stop.

- [ ] **Step 4: Commit**

```bash
cd /root/anc-services
git add app/api/cron/daily-events-brief/route.ts
git commit -m "feat(digest): resolve staffing from contracted services, not venue flag"
```

---

### Task 3: Fix the circular CRM push

**Files:**
- Modify: `lib/twenty-sync.ts:200-212`

**Context:** `staffingRequired: hasAssignedTechs` means "staffing is required if we staffed it." It is circular and structurally incapable of revealing an unstaffed venue. `docs/TWENTY-CRM-ARCHITECTURE.md:254` already *claims* this field is "derived from venue's contracted services" — this task makes the code match the documentation.

- [ ] **Step 1: Add the contract fact to the sync's source query**

Find the query in `lib/twenty-sync.ts` that populates `event` rows and add the same `EXISTS (...) as client_pays_for_staffing` fragment used in Task 2, bound to `STAFFING_SERVICE_TYPES`.

- [ ] **Step 2: Replace the circular assignment**

```ts
      // Was: staffingRequired: hasAssignedTechs — circular ("staffing is
      // required if we staffed it"), which made an unstaffed contracted venue
      // impossible to see from the CRM. Now contract-derived.
      staffingRequired: resolveStaffing(event).needed,
```
Keep `assignedTechs: event.assigned_techs || ''` exactly as-is — that field legitimately reports who was assigned. Delete the now-unused `hasAssignedTechs` const if nothing else reads it.

- [ ] **Step 3: Build**

Run: `cd /root/anc-services && npm run build`
Expected: succeeds.

- [ ] **Step 4: Dry-run the sync against ONE event before letting it touch 6,812 CRM records**

This writes to the live ANC CRM. Run the sync limited to a single event and diff the payload before/after. Confirm with Ahmad before a full sync run — a wrong `staffingRequired` written across the CRM is stakeholder-visible.

- [ ] **Step 5: Commit**

```bash
cd /root/anc-services
git add lib/twenty-sync.ts docs/TWENTY-CRM-ARCHITECTURE.md
git commit -m "fix(twenty-sync): derive staffingRequired from contract, not from assignment"
```

---

### Task 4: Invert the evening recap into a coverage report

**Files:**
- Modify: `app/api/cron/daily-events-brief/route.ts:156-201`

**Interfaces:**
- Consumes: `resolveStaffing(e).reason` from Task 1.

**Context:** today the evening recap lists 36 events of which ~30 say "no staffing required" — 83% noise by construction. Post-Task-2 the warranty bucket becomes contractually meaningful, and the recap should lead with the gap rather than the roster.

**WORDING GATE:** until Ahmad confirms the 176 question (see top of plan), the digest says **"no ANC presence recorded"**. It must NOT say "unstaffed", "missed", or "not delivered". Those assert a delivery failure that the data cannot yet distinguish from a recording gap.

- [ ] **Step 1: Replace the evening summary pills**

Replace the evening branch of `summaryPills` (lines 166-170):
```ts
      : (() => {
          const contracted = events.filter((e: any) => resolveStaffing(e).reason === 'contracted')
          const covered = contracted.filter((e: any) => (e.assigned_count || 0) > 0)
          const gap = contracted.length - covered.length
          return [
            `:stadium: ${contracted.length} contracted for staffing`,
            gap > 0
              ? `:warning: *${gap} with no ANC presence recorded*`
              : ':white_check_mark: *all contracted events covered*',
            `:clipboard: ${postGameCount}/${events.length} post-game`,
          ]
        })()
```

- [ ] **Step 2: Sort the gap to the top and drop non-contracted events out of the body**

In the evening branch of `sorted`, bucket contracted-with-no-presence first. Then filter the rendered `lines` for the evening window to contracted events only, and replace the tail with a single count line:
```ts
    const nonContracted = events.length - events.filter((e: any) => resolveStaffing(e).reason === 'contracted').length
    // …after chunking, append when nonContracted > 0:
    //   `_+${nonContracted} events at venues with no staffing contract — warranty only._`
```
This is the whole point: 30 rows of "nothing to do" collapse into one line, and the events that carry an obligation get the space.

- [ ] **Step 3: Update the warranty line to say what it now means**

Replace line 190's `':shield: _warranty only — no staffing required_'`:
```ts
            : ':shield: _warranty only — no staffing contracted_'
```
"required" described a flag; "contracted" describes the agreement. Same length, and now true.

- [ ] **Step 4: Build**

Run: `cd /root/anc-services && npm run build && npm run test:staffing`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
cd /root/anc-services
git add app/api/cron/daily-events-brief/route.ts
git commit -m "feat(digest): evening recap leads with contracted-coverage gap"
```

---

### Task 5: Retire `venues.requires_assignment` as a read source

**Files:**
- Modify: `app/events/EventsClient.tsx:997`, `app/events/[id]/page.tsx:825,851`, `app/api/cron/daily-events-brief/route.ts` (drop `venue_requires_assignment` from the SELECT)

**Context:** leaving two competing definitions in the codebase guarantees they drift. Once every surface reads `lib/staffing.ts`, the column stops being a source of truth. **Do not drop the column** — keep it as the admin-editable venue default that seeds new client records, but nothing should read it for a staffing decision.

- [ ] **Step 1: Find every remaining reader**

Run:
```bash
cd /root/anc-services && grep -rn "requires_assignment" app/ lib/ --include=*.ts --include=*.tsx
```
Every hit outside `lib/db.ts` (the schema bootstrap) and the admin venue-edit form must be migrated to `resolveStaffing`.

- [ ] **Step 2: Migrate each reader to the shared resolver**

Each surface adds `client_pays_for_staffing` to its query and calls `resolveStaffing`. No surface re-implements the logic.

- [ ] **Step 3: Verify only the sanctioned readers remain**

Run the same grep. Expected: hits only in `lib/db.ts` and the admin venue form.

- [ ] **Step 4: Build and commit**

```bash
cd /root/anc-services && npm run build
git add -A app lib
git commit -m "refactor(staffing): single resolver across all surfaces"
```

---

### Task 6: Ship and verify on the real surface

- [ ] **Step 1: Full build, then push (push = deploy)**

```bash
cd /root/anc-services && npm run build && git push
```

- [ ] **Step 2: Confirm the deployed SHA** via the `easypanel` skill against `abc_anc-services`. Trust only the SHA.

- [ ] **Step 3: Open the artifact — read the 5pm ET Slack post**

Confirm:
- The header leads with contracted count and the coverage gap, not a 36-event roster.
- The warranty line reads "no staffing **contracted**".
- Non-contracted events collapse into one `+N` tail line.
- The gap number is plausible against the 176/210 baseline.
- No line says "unstaffed" or asserts a delivery failure.

**This is the completion gate.** A green build is not done; the posted message is.

- [ ] **Step 4: Update project memory and CLAUDE.md**

Add a one-liner to `/root/anc-services/CLAUDE.md` "What's Live", and record the staffing-definition change in the KB per the auto-publish rule. Note explicitly that `venues.requires_assignment` is no longer a staffing source of truth, so a future session doesn't "fix" it back.

---

## Self-Review

**Spec coverage:** contract-derived `needsStaffing` → Tasks 1, 2, 5. Circular CRM push → Task 3. Digest inversion → Task 4. All covered.

**Cut from the original pitch, deliberately:** the renewal-risk overlay ("six accounts renewing inside 90 days") and any revenue weighting. `company.contractEnd` and `annualContractValueAmountMicros` are populated on **0 of 4,410** CRM companies. Building against empty fields would ship a report that always says zero. If Ahmad wants this, the prerequisite is a separate data-population project in the CRM, not a task here.

**Cut, deliberately:** the `venues.twenty_id` backfill. `company.venueName` is populated on 13 of 4,410, so there is almost nothing to match on, and Phase 2 turned out not to need the CRM at all — `client_services` carries the whole signal locally. Revisit only if a genuine CRM-side need appears.

**Type consistency:** `resolveStaffing` takes `{ event_requires_staffing, client_pays_for_staffing }` in Tasks 1-5; `client_pays_for_staffing` is produced by the same EXISTS fragment in Tasks 2, 3, and 5. `STAFFING_SERVICE_TYPES` is bound as a query parameter everywhere, never inlined.

**Open decision blocking Task 4:** the 176 question. Needs Ahmad → Joe/Alexis.
