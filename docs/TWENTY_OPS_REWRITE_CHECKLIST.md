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

## Phase 2 — Inventory POC (Day 1 PM) 🟡

Richest schema (21 fields), most data (1,656 rows) — prove the pattern end-to-end.

**Architecture choice:** the plan called for a new `/api/twenty-ops/inventory/` route, but we collapsed it into the existing `/api/inventory/route.ts` with a server-side branch on `isTwentyBackedEnabled('INVENTORY')`. One URL, one code path per HTTP method, feature-flag flips the data source. Client-side is unchanged.

- [x] `/api/inventory/route.ts` — GET/POST/PATCH/DELETE, all branch on `TWENTY_BACKED_INVENTORY`
- [x] Server-side venue scoping: `getStaffVenueIds` → `buildTwentyVenueFilter` → Twenty REST filter
- [x] Reshape Twenty asset shape → existing dashboard response shape (UI doesn't change)
- [x] Permission parity: PATCH requires `manager`, DELETE requires `tech_support` — same as legacy
- [x] `npm run build` + typecheck clean
- [x] Committed + pushed (`5f5fd28`)
- [ ] Widen `app/inventory/page.tsx` form to expose new fields (asset#, location, manufacturer, IP, display type, orientation, tri-code, connected devices, render name)
- [ ] Set `TWENTY_BACKED_INVENTORY=1` in EasyPanel env and redeploy
- [ ] **Read parity test** — admin sees 1,656 rows (matches Twenty count)
- [ ] **Write round-trip test** — create in dashboard → visible in Twenty CRM within 30s
- [ ] **RBAC test** — technician with 2 linked venues only sees those venues' assets; POST to a third venue → 403

## Phase 3 — Maintenance + Walkthroughs (Day 2 AM) ✅ routes

- [x] `/api/maintenance/route.ts` + `[id]/route.ts` — GET/POST/PATCH/DELETE branched on `TWENTY_BACKED_MAINTENANCE`
- [x] `/api/walkthroughs/route.ts` + `[id]/route.ts` — GET/POST/PATCH/DELETE branched on `TWENTY_BACKED_WALKTHROUGHS`
- [ ] Rewrite `app/maintenance/page.tsx` (form widening — deferred to post-test)
- [ ] Rewrite `app/walkthroughs/page.tsx` (form widening + filter bar — deferred to post-test)

## Phase 4 — RMA + Design Requests (Day 2 PM) ✅ routes

- [x] `/api/rma/route.ts` + `[id]/route.ts` — branched on `TWENTY_BACKED_RMA`
- [x] `/api/design-requests/route.ts` + `[id]/route.ts` — branched on `TWENTY_BACKED_DESIGNS`
- [ ] Rewrite `app/rma/page.tsx` (form widening — deferred)
- [ ] Rewrite `app/designs/page.tsx` (form widening — deferred)

## Phase 5 — CG Designs + Time Entries + Hours Budgets (Day 3 AM) ✅ routes

- [x] `/api/cg-designs/route.ts` + `[id]/route.ts` — branched on `TWENTY_BACKED_CG_DESIGNS`
- [x] `/api/time-entries/route.ts` + `[id]/route.ts` — branched on `TWENTY_BACKED_TIME_ENTRIES`
- [x] `/api/hours-budgets/route.ts` + `[id]/route.ts` — branched on `TWENTY_BACKED_HOURS_BUDGETS`
- [ ] Rewrite pages for form widening — deferred

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

