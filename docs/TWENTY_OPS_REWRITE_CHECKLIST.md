# Service Dashboard ops modules → Twenty-backed thin clients

**Live checklist. Updated as we go.** Source plan: ultraplan session 2026-04-22.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped

---

## Phase 0 — Pre-work

- [x] Confirm Twenty REST endpoints (verified via `scripts/migrate-airtable-all.ts`)
- [x] Confirm `TWENTY_API_KEY` env set on `abc_anc-services` service
- [x] Confirm row counts in Twenty (1,656 inventory · 432 maintenance · 15,465 walkthroughs · 28K time · 20K designs)
- [x] Confirm Twenty schemas per module (field-by-field catalog)

## Phase 1 — Foundation (Day 1 AM) ✅

Shared plumbing everything else depends on.

- [x] `lib/twenty-ops.ts` — typed client for 8 ops objects, re-exports `twentyFetch`/`fetchAllTwenty` from `lib/twenty-sync.ts`
- [x] `buildTwentyVenueFilter(venueIds, fieldName)` helper — mirrors `buildVenueFilterClause`, for technician scoping
- [x] Venue ID translator — dashboard UUID ↔ Twenty UUID (reuse `buildVenueIndex` pattern, 60s cache)
- [x] TS interfaces for all 8 objects (InventoryAsset, MaintenanceLog, WalkthroughLog, RmaTracker, DesignRequest, CgDesignRequest, DesignerTimeEntry, DesignerHoursBudget)
- [x] Env-flag plumbing: `isTwentyBackedEnabled('<MODULE>')` reads `TWENTY_BACKED_<MODULE>` env

## Phase 2 — Inventory POC (Day 1 PM)

Richest schema (21 fields), most data (1,656 rows) — prove the pattern end-to-end.

- [ ] `/api/twenty-ops/inventory/route.ts` — GET (list, filters, pagination) + POST (create)
- [ ] `/api/twenty-ops/inventory/[id]/route.ts` — PATCH (update) + DELETE
- [ ] Rewrite `app/inventory/page.tsx` — swap fetch URL, widen TS interface, add new form fields (asset#, location, manufacturer, IP, display type, orientation, tri-code, connected devices, render name)
- [ ] Keep existing `DashboardLayout` / `useToast` / `useAuth('manager')` / Tailwind styling intact
- [ ] **Read parity test** — admin sees 1,656 rows (± matches Twenty)
- [ ] **Write round-trip test** — create in dashboard → visible in Twenty CRM within 30s
- [ ] **RBAC test** — technician with 2 linked venues only sees those venues' assets; POST to a third venue → 403
- [ ] Ship behind `TWENTY_BACKED_INVENTORY=1` flag

## Phase 3 — Maintenance + Walkthroughs (Day 2 AM)

- [ ] `/api/twenty-ops/maintenance/route.ts` + `[id]/route.ts`
- [ ] `/api/twenty-ops/walkthroughs/route.ts` + `[id]/route.ts`
- [ ] Rewrite `app/maintenance/page.tsx` (+ rich-text resolution, attachments, escort info, station relation)
- [ ] Rewrite `app/walkthroughs/page.tsx` (+ rich notes, attachments, filter bar: venue/date/technician/result — mirror `/tickets` pattern)
- [ ] Backfill display of the 15,465 walkthrough records that never hit the local table
- [ ] Tests × 3 per module (read parity / write round-trip / RBAC)

## Phase 4 — RMA + Design Requests (Day 2 PM)

- [ ] `/api/twenty-ops/rma/route.ts` + `[id]/route.ts`
- [ ] `/api/twenty-ops/design-requests/route.ts` + `[id]/route.ts`
- [ ] Rewrite `app/rma/page.tsx` (+ Company relation via `?depth=1`, parts details, submission contact, remit-to-stock)
- [ ] Rewrite `app/designs/page.tsx` (+ AI prompt, proof link, proof last viewed, generated image, Wrike task ID)
- [ ] Tests × 3 per module

## Phase 5 — CG Designs + Time Entries + Hours Budgets (Day 3 AM)

- [ ] `/api/twenty-ops/cg-designs/route.ts` + `[id]/route.ts`
- [ ] `/api/twenty-ops/time-entries/route.ts` + `[id]/route.ts`
- [ ] `/api/twenty-ops/hours-budgets/route.ts` + `[id]/route.ts`
- [ ] Rewrite `app/cg-designs/page.tsx` (+ client tri-code, team name, sport, proof timestamps)
- [ ] Rewrite `app/time-entries/page.tsx` (+ Designer relation, task targets, wrikeTimelogId)
- [ ] Rewrite `app/hours-budgets/page.tsx` (+ auto `currentHoursUsed`, alert flags, Client relation)
- [ ] Tests × 3 per module

## Phase 6 — Ship (Day 3 PM)

- [ ] `npm run build` clean
- [ ] Deploy to EasyPanel (`abc/anc-services`)
- [ ] Flip all 8 flags on in prod env
- [ ] End-to-end QA: 8 modules × 3 tests = 24 green checks
- [ ] Docs site follow-up tickets per module (screenshots + copy updates)
- [ ] Soak monitoring: cron that diffs local count vs Twenty count daily, alerts on drift >1%

## Phase 7 — 30-day soak + cleanup

- [ ] Daily count diffs for 30 days
- [ ] No incidents reported for 30 consecutive days
- [ ] Ops team sign-off (Joe/Chris)
- [ ] Drop local write mirroring (remove the best-effort `INSERT INTO local_table` after Twenty write)
- [ ] Migration to drop 8 local tables (`inventory`, `maintenance_logs`, `walkthrough_logs`, `rma_trackers`, `design_requests`, `cg_design_requests`, `designer_time_entries`, `designer_hours_budgets`)

---

## Notes during build

<!-- Append notes/blockers/decisions inline as we work -->

