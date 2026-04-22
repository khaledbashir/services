# Wrike + Airtable Full Replacement Plan

**Live checklist. Updated as we go.**
**Goal: get to a state where Ahmad can tell Joe "cancel Wrike, cancel Airtable, cancel ClickUp — it's all in the Service Dashboard now."**

Hard deadline: Zendesk dies in ~2 weeks (per Joe). Every support ticket flow has to be ironclad by then.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done · `[-]` skipped · `[!]` blocked

---

## Phase 0 — Test what's already built (finish first)

The 8 Twenty-ops modules shipped last night are flag-gated. All 8 flags are set in prod env (`TWENTY_BACKED_INVENTORY` etc). Verify each actually works before doing anything else.

- [x] Set all 8 flags in EasyPanel env + deploy
- [x] Fix `twentyFetch` 429 retry (was dying on walkthroughs pagination)
- [ ] Inventory — confirm 1,656 rows render, create-edit-delete works
- [ ] Maintenance — confirm 432 rows render (currently paginated to 209, need to bump cap)
- [ ] Walkthroughs — confirm at least 600 of 15K render, pagination works after 429 fix
- [ ] RMA — confirm renders
- [ ] Design Requests — confirm renders (proved working at 200 rows)
- [ ] CG Designs — confirm 617 rows render
- [ ] Time Entries — confirm 600 of 28K render
- [ ] Hours Budgets — confirm 75 rows render
- [ ] Write round-trip: create a record in each dashboard page → visible in Twenty within 30s
- [ ] RBAC: technician with 2 linked venues only sees scoped records

## Phase 1 — Outstanding bugs from the team call

Things Joe/Alexis/Chris/Nick called out live. Ship before the Friday Jireh meeting.

- [x] **Kill the Google Calendar sync** — verified 2026-04-22: no googleapis calendar imports, events.source has 5 values (team_website, ai_discovery, venue_calendar, league_schedule, ticketmaster) — no google_calendar source remains
- [ ] **Event times showing midnight / weird hours** — separate from Google Calendar. 45 future events still at 00:00; `venue_calendar` source has UTC bleed (Royals vs Angels showing 01:00 when it should be 21:00 ET). Fix import pipeline timezone handling.
- [ ] **Dedupe duplicate event entries** — Red Sox game showing at both Fenway and JetBlue Park when it's only at Fenway (team filter not filtering by actual home venue correctly)
- [ ] **Event discovery: only pull events for venues flagged active** — Toronto spring training showing but they don't have Toronto's regular venue
- [ ] **Dodger Stadium event sync** — Chris added it but no events flow. Needs connection (feed URL or discovery config)
- [x] **Proof-link client-review automation** — fixed 2026-04-22 in `7692958` — Twenty-backed designs now read from Twenty REST on client_review transition instead of missing local row
- [ ] **AI logo generator using old black/red ANC logo, not current** — fix the logo-fetch prompt / source
- [ ] **AI bot replies only on `@ANC`, can't find `test-anyway` channel** — bot should also respond without @ prefix in DMs and specific channels, OR we auto-fix the channel routing

## Phase 2 — Widen existing forms to expose Twenty's richer fields

The data is flowing from Twenty. The UI forms still show the thin old field set. Ops team needs the full field set.

- [ ] **Inventory** — add: asset#, location code, manufacturer, IP, display type, orientation, tri-code, connected devices, render name, screen location, project code
- [ ] **Maintenance** — add: rich-text resolution details (markdown editor), attachments, escort info, station relation, asset relation
- [ ] **Walkthroughs** — add: rich notes, attachments, in-person toggle, result dropdown, filter bar mirroring `/tickets` (venue/date/technician/result)
- [ ] **RMA** — add: Company relation via `?depth=1`, parts details, submission contact, remit-to-stock toggle
- [ ] **Design Requests** — add: AI prompt field, proof link, proof last-viewed timestamp, generated image preview, Wrike task ID, multi-assignee (Joe asked for this), tricode search (Joe asked)
- [ ] **CG Designs** — add: client tri-code, team name, sport, proof timestamps, designer relation
- [ ] **Time Entries** — add: Designer relation, task targets, wrikeTimelogId, entry date, hours
- [ ] **Hours Budgets** — expose auto-tracked `currentHoursUsed`, alert flags (50%, 75%), client relation

## Phase 3 — New objects Twenty doesn't have yet (build from scratch)

These are features the team uses daily that don't map to any existing Twenty custom object. Need to be designed + built.

### 3.1 Print Requests (Alexis — third-party "Britain" print workflow)
- [x] Design Twenty object schema: client, job title, shipping address, ship date, proofs, invoice amount, notes
- [x] Status pipeline: New Job → Awaiting Layout → Awaiting Approval → Approved → In Production → Shipped → Invoiced
- [x] Build Twenty custom object + fields (via metadata API)
- [x] `/api/print-requests` route (twenty-backed)
- [x] `/print-requests` page with Kanban view by status + client filter (ClickUp-style, Alexis's ask)
- [x] Export `/api/print-requests/export` for reporting
- [ ] Migrate existing Wrike + ClickUp print-request records

### 3.2 Content Schedule (Alexis — in-venue content run tracking)
- [x] Design Twenty object: venue, client, job title, run start date, run end date, status, notes
- [x] Status pipeline: Ready → In Queue → Scheduled to Launch → Content Live → Confirmed Live with Client
- [x] **Auto-stale logic** — when `run_end_date` passes, auto-flag for removal (fixes Alexis's manual-date-change pain)
- [x] Build Twenty custom object
- [x] `/api/content-schedules` route
- [x] `/content-schedules` page with calendar + list view
- [ ] Migration from existing Wrike records

### 3.3 Parts Ordering (Gianni — public form + internal queue)
- [x] Public-facing form at `/forms/parts-request` (no auth) — venue, parts needed, photo upload, shipping address, requester email
- [x] Submission creates a new `partsOrder` record in Twenty (object exists)
- [x] Slack notification to parts-ordering channel on new submission
- [x] Internal queue view at `/parts-orders` — sortable, filterable, status-managed by Gianni
- [x] Email confirmation to requester on submission
- [x] Email on status change to requester

### 3.4 30/60/90 Stadium Opening Checklist (Gianni's pre-season prep)
- [x] Design Twenty object: parent venue, checklist template name, phase (30/60/90 day), item prompt, assignee, due date, status
- [x] Seed templates per league (MLB, NBA, NHL, NFL) that can be cloned per team
- [x] Build `/api/opening-checklists` route
- [x] `/opening-checklists` page with venue grouping + phase collapsing
- [x] Bulk-clone: "Prep Prudential for 2026–27 season" → spawns all 3 phase checklists with default assignees

## Phase 4 — Integrations

### 4.1 Native proof pipeline (REPLACE FTP + workspace.anc.com entirely)

Decision: don't integrate with the legacy `T:\` + `workspace.anc.com` system. Own the whole pipeline inside the dashboard so ANC has zero dependency on the old dev or the FTP host. We already have `/proof/[token]` with approve/reject wired back to Twenty from earlier — this expands it to cover the full designer-upload-to-client-approval flow.

- [ ] **File upload UI on design request detail page** — drag-and-drop for PSD / MP4 / PDF / PNG / GIF proofs
- [ ] **Storage backend** — decide between: (a) Twenty's built-in file attachments, (b) dashboard Postgres bytea (bad for big files), (c) MinIO / S3 on the EasyPanel VPS. Recommend MinIO: zero additional vendor, unlimited storage scoped to the host disk, S3-API compatible so we can swap later
- [ ] **Proof-link generator** — auto-creates public token at `/proof/[token]` on file upload (reuse existing token infrastructure)
- [ ] **Auto-fire email to client** when design request moves to `client_review` — links to the dashboard proof page, not an FTP URL
- [ ] **Client approve / request changes** on the proof page — already built for the Twenty proof-share flow, needs to be wired for design requests too
- [ ] **Proof views tracked** — "last viewed at" and "responded at" timestamps (Alexis sees who looked at what, when)
- [ ] **File versioning** — uploading a new proof to the same request adds a version, keeps old versions accessible
- [ ] **Backfill strategy for existing FTP links** — the 20K+ existing design requests have `ftp_proof_link` values pointing at the old workspace.anc.com URLs. Options: (a) leave them as-is for historical records, (b) bulk-download each, re-upload to our storage, update the link. Recommend (a) for read-only history + (b) only for the currently-active records (<500)
- [ ] **Migration plan communicated to Alexis** — designers stop putting files on `T:\` drive, start uploading through the dashboard as of [date]. Clean cutover.

### [x] 4.2 Hours Budget 50% + 75% alerts (Alexis)
- [-] Add alert trigger logic to `lib/twenty-ops.ts` hours-budget updates (moved to cron instead)
- [x] Cron that runs daily, checks every active budget, fires Slack + email at 50% / 75% thresholds
- [x] Dedupe: don't re-alert once fired unless crossing a new threshold
- [ ] UI on budget detail page shows current % consumed + alert status

### 4.3 Client read-only portals (Nick — Airtable-style external interfaces)
- [x] Per-venue shareable link with cryptographically signed token (already have for venue portals)
- [x] Client view shows: total displays, displays with open issues, displays offline, open tickets
- [x] Auth-less (just the token); read-only; no dashboard auth required
- [x] Admin UI at `/portals/[venue_id]` to regenerate/revoke tokens
- [ ] Test with one of Nick's existing Cushman & Wakefield contacts

## Phase 5 — Data imports (blocked on client deliverables)

- [!] Full venues list from Salesforce (Joe to send)
- [!] Staff list: name, email, role, venue linkage (Charlie from Paychex)
- [!] Contracted services per venue (Joe, still not finalized per Gianni's call)
- [!] Slack channel IDs mapped to venues (Charlie to pull + audit)
- [!] Email distribution lists per venue (Joe/Chris)
- [!] Wrike API token or read access (Charlie working on it)
- [!] Airtable API token or read access (Charlie working on it)
- [!] ClickUp access (Charlie mentioned it's still paid, reduced licenses)

Once those land:
- [ ] Import venues into dashboard + Twenty with dashboard/Twenty UUID linkage via `servicesId`
- [ ] Import staff into Twenty as people with role + venue links
- [ ] Import contracted services as client-level records
- [ ] Wire Slack channel IDs into venues table
- [ ] Wire email distribution lists into venues table
- [ ] Backfill Wrike → Twenty for any records not already migrated (most are, per earlier migration)
- [ ] Backfill Airtable → Twenty for any records not already migrated

## Phase 6 — Launch prep

- [ ] Feature-flag rollout plan: enable modules one at a time for live ops team, get sign-off before next
- [ ] Natalia walkthrough (15 min, design side sign-off)
- [ ] Gianni walkthrough (15 min, parts + checklist sign-off)
- [ ] Nick walkthrough (15 min, asset + maintenance sign-off)
- [ ] Alexis walkthrough (15 min, content + design + print sign-off)
- [ ] Chris walkthrough (15 min, ticket + voicemail sign-off)
- [ ] Full export of Wrike + Airtable data (belt-and-suspenders backup before cancellation)
- [ ] Archive the Wrike + Airtable accounts
- [ ] Announce to ANC staff: "as of [date], Wrike and Airtable are retired — use services.ancsports.net"
- [ ] Update internal docs at docs.ancsports.net (already auto-updating from commits)

## Phase 7 — 30-day soak (post-launch)

- [ ] Daily check: local count vs Twenty count per module, flag drift >1%
- [ ] Weekly check-in with ops team for 4 weeks
- [ ] Log any regressions in `/root/anc-services/docs/POST_LAUNCH_ISSUES.md`
- [ ] After 30 clean days: remove local Postgres tables for the 8 migrated modules
- [ ] Remove the `TWENTY_BACKED_*` env flags (make Twenty-backed the only code path)
- [ ] Remove the dual-write legacy fallbacks from the routes

## Phase 8 — Proposal + invoice

- [x] Phase 4 + 6 proposal PDF drafted at `/root/anc-services/ANC-Phase-4-6-Proposal.pdf` ($6K, 30-day warranty)
- [ ] Send to Joe after Phase 0 + Phase 1 are complete so we're invoicing against demonstrated delivery
- [ ] Send invoice + payment link on acceptance

---

## Notes inline (append as we work)

- **2026-04-22**: Checklist created after reviewing Friday team-call transcript. Phase 0 is partially complete, hit a 429 bug mid-test, fixed. Resuming Phase 0 verification next.
- **2026-04-22**: Print Requests module shipped in the dashboard with Twenty-backed CRUD, list + Kanban views, client filtering, and metadata bootstrap script at `scripts/create-print-request-object.ts`.
- **2026-04-22**: Stadium Prep module shipped with Twenty-backed checklist items/templates, seed templates for MLB + NHL, grouped venue views, and bulk template cloning from `/opening-checklists`.
- **2026-04-22**: Client read-only portals shipped with multi-link tokens in `client_portals`, public `/portals/[token]` health views, and manager controls at `/portals/[venue_id]`.
