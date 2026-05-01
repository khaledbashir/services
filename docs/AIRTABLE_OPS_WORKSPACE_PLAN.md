# Airtable Ops Workspace Plan

Living plan for replacing ANC's Airtable operations workflow with a native Services workspace.

Last updated: 2026-05-01

## Short Version

- We are building ANC's own Airtable-style Ops Workspace inside `/operations`.
- Users should get the Airtable feel: left workspace nav, top view tabs, dense grids, filters, row drawers, linked records, and fast entry.
- Baserow stays as a fallback/admin scratchpad. It is not the daily user experience.
- First shell is live in code: `/operations` now shows Displays, Walkthrough Log, and Maintenance from existing APIs.
- Important correction: `/operations` is not ticketing. Tickets stay in `/tickets`.
- Current build target: display polish and deeper asset detail.

## Current Status

- Done: plan doc, native `/operations` shell, dense grids, counts, search, venue filter, sorting, row detail drawer, asset history link.
- Done now: navbar cleanup and ticketing rollback inside `/operations`.
- Walkthroughs now save walkthrough observations only. They do not create tickets.
- Still needed: inline edits, richer asset detail, Nick walkthrough.

## Previous Work Status

### 1. Plan and Direction

What we did:
- Read the transcript and repo.
- Decided to build ANC's own Airtable-style workspace inside Services.
- Kept Baserow as a fallback/admin tool, not the daily user interface.
- Created this living plan and checklist.

What users can now do:
- Everyone has a clear direction for the Airtable replacement.
- We can track progress in one doc instead of re-explaining the plan each time.

### 2. First `/operations` Workspace Shell

What we did:
- Replaced the generic operations landing page with an Airtable-style workspace.
- Added left navigation, top tabs, dense grids, counts, search, venue filter, sorting, and row detail drawers.
- Added grids for Displays, Walkthrough Log, and Maintenance.
- Kept raw Baserow routes available as a fallback.

What users can now do:
- Open `/operations` and scan ops data in a table-first view.
- Switch between displays, walkthroughs, and maintenance without jumping through separate form pages.
- Click a row to see details.
- Open a display's history timeline from the display drawer.

### 3. Walkthrough Flow

What we did:
- Added a walkthrough modal inside `/operations`.
- Venue selection now narrows the display/location picker.
- Added result choices: No Action Needed, Follow-Up Needed, Problem Found.
- Corrected the flow so it saves walkthrough observations only.
- Removed ticket creation from `/operations`.
- Updated the checklist and build log.

What users can now do:
- Log a walkthrough from the Airtable-style workspace.
- Pick a venue and display/location while logging.
- Mark a walkthrough as clean or needing follow-up.
- Save observations without touching ticketing.

### 4. Navbar Cleanup

What we did:
- Removed the admin-only Wrike/Airtable build sections from the left navbar.
- Removed the `/wrike-airtable-scope` shortcut from the navbar.
- Added `Operations Workspace` under Field Ops.

What users can now do:
- Click Field Ops -> Operations Workspace to see the Airtable-style page.
- Avoid the confusing build/scope links during normal work.

### 5. Ticketing Rollback

What we did:
- Removed `/api/tickets` from the `/operations` data load.
- Removed ticket columns from the Airtable-style operations page.
- Removed ticket creation from the walkthrough modal.

What users can now do:
- Use `/operations` for displays, walkthroughs, and maintenance.
- Use `/tickets` only when they actually want the ticketing system.

## Status Format

After each major build slice, use:

- What we did
- What users can now do

## Decision

Build an Airtable-style operations experience inside `anc-services`.

Do not make Nick and the technicians work directly in Baserow. Do not rebuild every Airtable capability from scratch. Copy the workflow shape that matters: workspace navigation, dense table views, linked records, row expansion, fast inline edits, and walkthrough-driven issue creation.

## Why

Nick's call feedback was specific:

- He prefers the Airtable-style table view over form-heavy dashboard pages.
- The daily workflow starts from a workspace/venue screen.
- Technicians use Walkthrough Log every day.
- Walkthroughs capture field observations. They do not create support tickets from this workspace.
- Displays/assets must show connected rack devices, IPs, historical issues, maintenance events, and documents.
- Maintenance is managed as a table with type, status, date, techs, venue, and affected displays.

The current repo already has most of the data model and migration work. The missing piece is the user experience.

## Product Shape

Routes to build:

- `/operations` - Airtable-style workspace home and table shell.
- `/operations/assets` - dense display/asset grid.
- `/operations/walkthroughs` - walkthrough grid plus fast add flow.
- `/operations/maintenance` - maintenance event grid.
- `/operations/assets/[id]` - asset detail drawer/page with history, devices, rack/IPs, docs.

Existing routes can remain during rollout:

- `/inventory`
- `/maintenance`
- `/walkthroughs`
- `/asset/[id]`
- `/operations/[base]/[table]` Baserow generic table route, kept as admin fallback until the native workspace is signed off.

## UX Requirements

- Dense, spreadsheet-like grids.
- Left workspace navigation by region/source/view.
- Top tabs for common views: Displays, Walkthrough Log, Maintenance.
- Filter, sort, and group controls visible in the table shell.
- Colored status/result pills.
- Linked-record chips for venue, display, device, rack, technician, assignee.
- Click row opens detail drawer instead of forcing navigation.
- Inline edit for status/result/assignee fields where safe.
- Quick add row from the active grid.
- Walkthrough form changes available locations/displays after venue selection.
- Walkthrough result drives conditional fields:
  - no action needed: save walkthrough only
  - follow-up needed: save walkthrough observation
  - problem found: save walkthrough observation

## Data Sources

Primary user-facing source should stay in Services/Twenty-backed APIs:

- Inventory/assets: `/api/inventory`
- Walkthroughs: `/api/walkthroughs`
- Maintenance: `/api/maintenance`
- Venues: `/api/venues`
- Asset history: existing `/asset/[id]` Twenty timeline logic

Baserow can remain:

- schema/admin scratchpad
- imported table fallback
- temporary raw table view
- not the default daily UI

## Checklist

### Phase 0 - Foundation

- [x] Confirm product direction from transcript: native Airtable-style Services workspace.
- [x] Confirm existing data/API surfaces for assets, walkthroughs, maintenance, venues.
- [ ] Confirm production env flags for Twenty-backed inventory, walkthroughs, maintenance.
- [x] Keep ticketing out of `/operations`; tickets remain in `/tickets`.

### Phase 1 - Workspace Shell

- [x] Replace generic `/operations` landing with ANC Airtable-style shell.
- [x] Add left workspace navigation.
- [x] Add top tabs for Displays, Walkthroughs, Maintenance.
- [x] Load live counts from existing APIs.
- [x] Render first dense grids from live data.
- [x] Keep Baserow generic route available as admin fallback.

### Phase 2 - Ticketing Boundary

- [x] Remove ticket grids from `/operations`.
- [x] Remove ticket creation from walkthrough logging.
- [x] Keep support ticket work in `/tickets`.

### Phase 3 - Displays / Assets Table

- [x] Dense display grid with venue, type, location, tri-code, connected devices.
- [~] Filters for venue, display type, status, manufacturer, location. Current: venue + search.
- [x] Click asset opens detail drawer.
- [x] Link to existing asset history timeline.
- [ ] Add connected devices/rack view.
- [ ] Add docs/photo fields if available.

### Phase 4 - Walkthrough Workflow

- [x] Fast walkthrough add flow inside `/operations`.
- [x] Venue selection loads display/location choices.
- [x] Result options: no action needed, follow-up needed, problem found.
- [x] Save walkthrough observations without creating tickets.
- [ ] Link walkthrough to display where schema supports it.

### Phase 5 - Maintenance Table

- [ ] Dense maintenance grid.
- [ ] Type/status/date/tech/venue/display columns.
- [ ] Inline status update.
- [ ] Create maintenance event from selected display.
- [ ] Link maintenance event to asset and venue.

### Phase 6 - Polish and Cutover

- [ ] Mobile/tablet sanity pass for technician use.
- [ ] Dark mode pass.
- [ ] Nick walkthrough.
- [ ] Charlie technical review for API/FTP/ops constraints.
- [ ] Decide whether old Airtable becomes read-only.
- [ ] Archive or hide old form-heavy pages from daily nav after sign-off.

## Current Risks

- Current walkthrough POST in Twenty-backed mode does not yet link venue/display strongly enough.
- Baserow env is not configured in local shell, so live Baserow status is unverified here.
- Asset timeline relies directly on Twenty API key and may need to be brought into authenticated dashboard chrome.
- Technician RBAC depends on staff-to-venue assignments being complete.

## Build Log

- 2026-05-01: Created this living plan from the stakeholder transcript and repo inspection.
- 2026-05-01: Shipped first `/operations` workspace shell: left nav, view tabs, search, venue filter, sortable dense grids, row detail drawer, and asset history link. `npm run build` completed; local build still prints existing Docker-network warnings for cron/database routes.
- 2026-05-01: Added walkthrough modal inside `/operations`: pick venue, pick venue-specific display/location, choose result, save walkthrough, refresh workspace. `npm run build` completed with the same existing local Docker-network warnings.
- 2026-05-01: Cleaned navbar: removed Wrike/Airtable build sections and `/wrike-airtable-scope` from navigation; added Operations Workspace under Field Ops.
- 2026-05-01: Corrected `/operations` boundary: removed ticket data, ticket columns, and ticket creation from the Airtable-style workspace.
