# Phase 4a — Event Aggregation Engine

> **Status:** Implemented in `anc-services`
> **Date:** 2026-04-06
> **Purpose:** Replace manual event entry and the dead Google Calendar sync with AI-powered event discovery.

---

## 1. What This Feature Is

Phase 4a adds an **AI-powered Event Aggregation Engine** to the ANC Service Dashboard.

Its job is simple:

- Find upcoming events for ANC venues automatically
- Pull from multiple public sources instead of relying on one calendar feed
- Show admins a preview before import
- Prevent duplicates
- Auto-import high-confidence discoveries during cron runs

The goal is that ANC should not have to manually create most events anymore.

This is the first step in replacing the old Google Calendar sync, which is no longer reliable.

---

## 2. What Was Built

### New shared discovery engine

Main file:

- [lib/event-discovery.ts](/root/anc-services/lib/event-discovery.ts)

This file centralizes the event discovery logic so the app, import flow, and cron all use the same behavior.

It handles:

- Selecting eligible venues
- Building source-specific search queries
- Running DuckDuckGo searches
- Asking the configured AI model to turn messy search results into structured events
- Deduplicating against events already in the database
- Marking rows as high-confidence vs manual-review
- Importing approved discoveries into the `events` table

### Upgraded API routes

- [app/api/events/discover/route.ts](/root/anc-services/app/api/events/discover/route.ts)
- [app/api/events/discover/import/route.ts](/root/anc-services/app/api/events/discover/import/route.ts)
- [app/api/cron/discover-events/route.ts](/root/anc-services/app/api/cron/discover-events/route.ts)

### Admin UI upgrades

- [app/events/page.tsx](/root/anc-services/app/events/page.tsx)
- [app/venues/[id]/page.tsx](/root/anc-services/app/venues/[id]/page.tsx)

### Cleanup fixes completed alongside Phase 4a

- [app/settings/page.tsx](/root/anc-services/app/settings/page.tsx) now includes a calendar-sync retirement stub so the page builds cleanly
- [next.config.js](/root/anc-services/next.config.js) no longer uses the invalid `experimental.isrMemoryCacheSize` option

---

## 3. How It Works

### Discovery flow

For each venue, the engine:

1. Loads venue metadata from the database
2. Checks whether the venue is active and has active services
3. Builds several search queries using the venue name, city/state, and likely league hints
4. Searches DuckDuckGo for public event information
5. Sends the search text to the configured AI provider
6. Receives structured event candidates back
7. Compares those candidates against existing events already in the database
8. Flags likely duplicates
9. Marks strong official-source matches as auto-importable

### Search sources it is designed to cover

The engine now searches for event evidence across:

- Ticketmaster pages
- Official venue calendar pages
- Team websites
- League schedule pages

The source classification written into the event record can include values like:

- `ticketmaster`
- `league_schedule`
- `venue_calendar`
- `team_website`
- `ai_discovery`

### AI output shape

The AI is asked to return structured event candidates including:

- `summary`
- `event_date`
- `start_time`
- `end_time`
- `event_type`
- `league`
- `home_team`
- `away_team`
- `source_url`
- `source_label`
- `confidence`

### Deduplication logic

Before import, each discovered event is checked against existing events at the same venue.

Current duplicate rules:

- Same `venue_id` + same `event_date` + same `start_time`
- Same `venue_id` + same `event_date` + same normalized summary
- Same `venue_id` + same `event_date` + high word similarity in summary

Duplicate rows are shown in preview and blocked from import.

---

## 4. What Gets Written to the Database

### Existing schema used

The work uses the existing `events` table and does not introduce a new table in Phase 4a.

Relevant columns:

- `venue_id`
- `summary`
- `league`
- `event_date`
- `start_time`
- `end_time`
- `status`
- `workflow_status`
- `event_type`
- `requires_staffing`
- `source`

### New behavior added

This phase fixes and improves several fields that already existed but were underused:

#### `event_type`

Previously, imported discovery rows were being hardcoded to `event`.

Now the imported event preserves the discovered type:

- `game`
- `concert`
- `other`

#### `source`

Previously, `events.source` was mostly null.

Now imported discovery rows populate `source` with the detected discovery origin, for example:

- `ticketmaster`
- `league_schedule`
- `venue_calendar`
- `team_website`
- `ai_discovery`

#### `status`

This phase starts using `events.status` as a discovery-state field:

- `discovered` for preview-stage candidates
- `confirmed` when an admin manually approves import
- `imported` when the cron job auto-imports a high-confidence match

#### `requires_staffing`

Newly discovered events now default based on venue service activity.

If a venue is active and has active services that require assignments, discovered events are imported with:

- `requires_staffing = true`

This is important because the old data had this field mostly null.

---

## 5. Admin Workflows

### A. Single-venue discovery

Available from the venue page:

- [app/venues/[id]/page.tsx](/root/anc-services/app/venues/[id]/page.tsx)

What the admin does:

1. Open a venue
2. Trigger discovery
3. Review discovered events in a modal
4. See duplicates flagged inline
5. Select the rows to import
6. Import selected rows

What the UI shows:

- Event name
- Date
- Time
- Event type
- Source label
- Confidence
- Duplicate warnings

### B. Bulk discovery across all active venues

Available from the events page:

- [app/events/page.tsx](/root/anc-services/app/events/page.tsx)

What the admin does:

1. Open Events
2. Click `Discover Active Venues`
3. Wait for the scan to run across eligible venues
4. Review the preview table
5. Use `Select all` or individual checkboxes
6. Import selected rows

What the preview table shows:

- Event
- Date
- Time
- Type
- Source
- Venue
- Status badge

Rows are preselected only if they are not duplicates.

---

## 6. Automated Cron Behavior

Route:

- [app/api/cron/discover-events/route.ts](/root/anc-services/app/api/cron/discover-events/route.ts)

### What cron does now

When run without a specific venue, the cron:

1. Loads all active venues with active services
2. Runs discovery for each venue
3. Splits results into:
   - high-confidence auto-import candidates
   - lower-confidence review candidates
4. Imports the auto-import group with `status = 'imported'`
5. Logs the run to `activity_log`
6. Sends a Slack summary message

### Slack summary

The intended summary format is:

`Discovered X new events across Y venues. Z imported automatically, W pending review.`

### Activity log

Each cron run writes a summary record into `activity_log` with action:

- `event_discovery_run`

This gives ops a basic audit trail of what happened during unattended runs.

---

## 7. API Reference

### `POST /api/events/discover`

Runs event discovery.

Request shapes:

```json
{ "venue_id": "uuid" }
```

or

```json
{ "all_active": true }
```

Response includes:

- `mode`
- `venues`
- `discovered`
- `total_found`
- `duplicates_skipped`
- `existing_count`

### `POST /api/events/discover/import`

Imports previewed discovery rows into the `events` table.

Request shape:

```json
{
  "venue_id": "optional-default-uuid",
  "status": "confirmed",
  "events": [
    {
      "venue_id": "uuid",
      "venue_name": "Prudential Center",
      "summary": "Devils vs Rangers",
      "event_date": "2026-04-10",
      "start_time": "19:00",
      "end_time": null,
      "event_type": "game",
      "league": "NHL",
      "home_team": "Devils",
      "away_team": "Rangers",
      "source": "league_schedule",
      "source_label": "nhl.com",
      "source_url": "https://...",
      "confidence": 0.92,
      "duplicate": false,
      "duplicate_reason": null,
      "requires_staffing": true,
      "status": "discovered",
      "auto_importable": true
    }
  ]
}
```

Behavior:

- Preserves `event_type`
- Writes `source`
- Writes `status`
- Writes `requires_staffing`
- Skips duplicate rows

### `GET /api/cron/discover-events`

Automated or manual cron execution endpoint.

Supported query params:

- `venue_id`
- `venue`
- `preview=true`

Examples:

- Full unattended run across active venues
- Preview one venue without importing
- Target a specific pilot venue during testing

---

## 8. Pilot Venues

Phase 4a was specifically built with these test venues in mind:

- Prudential Center
- Fenway Park

These should be the first two venues used for live validation because they are the current pilots for discovery quality.

Recommended live checks:

- Run single-venue discovery for each
- Verify event naming quality
- Verify source quality
- Verify duplicate detection
- Verify `requires_staffing`
- Verify imported `event_type`

---

## 9. What This Replaces

This feature is the practical replacement path for the broken Google Calendar sync.

### Old approach

- One brittle calendar sync
- Hard dependency on a service account key
- Sync now broken operationally

### New approach

- Multi-source public web discovery
- AI normalization into structured event rows
- Human preview when needed
- Auto-import for strong official matches

This is more flexible and does not depend on one vendor feed.

---

## 10. What Is Not Included Yet

Phase 4a intentionally does **not** include:

- Saved per-venue source feeds
- Source URL management UI
- Service-triggered automation toggles
- Wrike, Airtable, or CRM integrations
- Removal of old Google Calendar code

Those belong to later phases.

---

## 11. Operational Notes

### Dependencies

This feature relies on:

- `AI_API_KEY`
- `AI_BASE_URL`
- `AI_MODEL`

It also uses DuckDuckGo search results as the public discovery input layer.

### Confidence model

The current confidence logic is practical, not perfect.

- Official-looking sources get higher default confidence
- Ambiguous AI-only rows get lower confidence
- The cron only auto-imports high-confidence rows
- Lower-confidence rows stay in manual review flow

### Good fit

This system is strongest for:

- Sports venues
- Named public venues
- Events that appear on official or indexed public pages

### Expected limitations

This system may struggle more with:

- Poorly indexed venue calendars
- Events listed only on image-heavy or JS-heavy pages
- Inconsistent naming between sources
- Last-minute schedule changes not yet reflected publicly

That is why preview and dedupe still matter.

---

## 12. Success Criteria Met

This Phase 4a implementation now supports:

- Single-venue admin discovery from venue pages
- Bulk discovery across all active venues from the events page
- Preview table with selection controls
- Duplicate indicators before import
- Import behavior that preserves `event_type`
- Population of `source`
- Population of `status`
- Population of `requires_staffing`
- Automated cron-based discovery/import flow
- Slack summary from cron
- Clean TypeScript build
- Clean production build

---

## 13. Recommended Next Steps

### Immediate rollout

- Validate Prudential Center discovery quality
- Validate Fenway Park discovery quality
- Tune confidence thresholds if needed
- Review Slack summaries from first unattended cron runs

### Phase 4b candidate work

- Save per-venue preferred sources
- Track source URLs historically
- Add stronger official-source matching rules
- Add confidence explanations in the UI

### Phase 4c candidate work

- Per-venue automation toggles
- Discovery frequency controls
- Venue-level source preferences

---

## 14. Plain-English Summary

If someone asks, “What did we just build?”, the short answer is:

> We built an AI-powered event discovery system for the ANC Service Dashboard. Instead of manually entering events or relying on a broken Google Calendar sync, the app now searches public sources like Ticketmaster, venue calendars, team sites, and league schedules, converts those results into structured events, shows admins a review screen, blocks duplicates, and can automatically import high-confidence events during scheduled runs.

