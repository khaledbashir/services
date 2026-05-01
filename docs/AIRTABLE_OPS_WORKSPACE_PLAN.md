# Airtable Ops Workspace Plan

Living plan for replacing ANC's Airtable operations workflow with a native Services workspace.

Last updated: 2026-05-01

## Decision

Build an Airtable-style operations experience inside `anc-services`.

Do not make Nick and the technicians work directly in Baserow. Do not rebuild every Airtable capability from scratch. Copy the workflow shape that matters: workspace navigation, dense table views, linked records, row expansion, fast inline edits, and walkthrough-driven issue creation.

## Why

Nick's call feedback was specific:

- He prefers the Airtable-style table view over form-heavy dashboard pages.
- The daily workflow starts from a workspace/venue screen.
- Technicians use Walkthrough Log every day.
- A walkthrough can create a new issue, which then appears in Today's Issues and Open Issues and triggers Slack.
- Displays/assets must show connected rack devices, IPs, historical issues, maintenance events, and documents.
- Maintenance is managed as a table with type, status, date, techs, venue, and affected displays.

The current repo already has most of the data model and migration work. The missing piece is the user experience.

## Product Shape

Routes to build:

- `/operations` - Airtable-style workspace home and table shell.
- `/operations/assets` - dense display/asset grid.
- `/operations/issues` - Open Issues and Today's Issues grid.
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
- Top tabs for common views: Open Issues, Today's Issues, Displays, Walkthrough Log, Maintenance.
- Filter, sort, and group controls visible in the table shell.
- Colored status/result/priority pills.
- Linked-record chips for venue, display, device, rack, technician, assignee.
- Click row opens detail drawer instead of forcing navigation.
- Inline edit for status/result/assignee fields where safe.
- Quick add row from the active grid.
- Walkthrough form changes available locations/displays after venue selection.
- Walkthrough result drives conditional fields:
  - no action needed: save walkthrough only
  - open issue exists: link walkthrough to issue
  - new issue detected: create ticket/issue and Slack notification

## Data Sources

Primary user-facing source should stay in Services/Twenty-backed APIs:

- Inventory/assets: `/api/inventory`
- Tickets/issues: `/api/tickets`
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
- [x] Confirm existing data/API surfaces for assets, tickets, walkthroughs, maintenance, venues.
- [ ] Confirm production env flags for Twenty-backed inventory, walkthroughs, maintenance, tickets.
- [ ] Confirm whether issue source of truth is `tickets`, Twenty `serviceTicket`, or both.
- [ ] Confirm live Slack notification path for walkthrough-created issues.

### Phase 1 - Workspace Shell

- [x] Replace generic `/operations` landing with ANC Airtable-style shell.
- [x] Add left workspace navigation.
- [x] Add top tabs for Issues, Displays, Walkthroughs, Maintenance.
- [x] Load live counts from existing APIs.
- [x] Render first dense grids from live data.
- [x] Keep Baserow generic route available as admin fallback.

### Phase 2 - Issues Table

- [ ] Open Issues view.
- [ ] Today's Issues view.
- [ ] Sort by title, venue, status, priority, assignee, created date.
- [ ] Filters for venue/status/assignee/priority.
- [ ] Row drawer with ticket details and linked display when available.
- [ ] Inline status update.

### Phase 3 - Displays / Assets Table

- [ ] Dense display grid with venue, type, location, IP, tri-code, connected devices.
- [ ] Filters for venue, display type, status, manufacturer, location.
- [ ] Click asset opens detail drawer.
- [ ] Link to existing asset history timeline.
- [ ] Add connected devices/rack view.
- [ ] Add docs/photo fields if available.

### Phase 4 - Walkthrough Workflow

- [ ] Fast walkthrough add flow inside `/operations`.
- [ ] Venue selection loads display/location choices.
- [ ] Result options: no action needed, open issue exists, new issue detected.
- [ ] New issue path creates ticket/issue automatically.
- [ ] New issue appears in Today's Issues and Open Issues.
- [ ] Slack notification fires to venue/default channel.
- [ ] Link walkthrough to issue/display where schema supports it.

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
- Existing `/api/tickets` has no first-class display/asset relation in the dashboard response.
- Baserow env is not configured in local shell, so live Baserow status is unverified here.
- Asset timeline relies directly on Twenty API key and may need to be brought into authenticated dashboard chrome.
- Technician RBAC depends on staff-to-venue assignments being complete.

## Build Log

- 2026-05-01: Created this living plan from the stakeholder transcript and repo inspection.
- 2026-05-01: Shipped first `/operations` workspace shell: left nav, view tabs, search, venue filter, sortable dense grids for Open Issues, Today's Issues, Displays, Walkthrough Log, and Maintenance, plus row detail drawer and asset history link. `npm run build` completed; local build still prints existing Docker-network warnings for cron/database routes.
