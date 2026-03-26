# ANC Service Dashboard — Technical Audit

**Date:** March 26, 2026
**Auditor:** Ahmad Basheer
**Codebase:** github.com/khaledbashir/services
**Live URL:** https://abc-anc-services.izcgmb.easypanel.host

---

## WHAT'S LIVE

### 1. Authentication & Login

| Item | Detail |
|------|--------|
| Route | `/login` |
| What it does | Email/password login, issues JWT cookie (24h expiry) |
| Status | **FULLY WORKING** |
| Data source | PostgreSQL `staff` table, bcrypt password verification |
| User actions | Login, logout |

**Roles enforced:**
- **Admin** — sees everything: Dashboard, Events, Venues, Tickets, Reports, Staff, Inventory, Settings, Client Portals
- **Manager** — sees Dashboard, Events, Venues, Tickets, Reports, Client Portals
- **Technician** — sees Dashboard, Events, Venues only — filtered to their assigned venues

Role checks happen at two levels: middleware (JWT validation) and API routes (`requireRole()`). Sidebar navigation hides pages based on role.

---

### 2. Dashboard

| Item | Detail |
|------|--------|
| Route | `/dashboard` |
| What it does | Operations overview — today's events, open tickets, assigned staff, labor hours, alerts, activity feed |
| Status | **FULLY WORKING** |
| Data source | 5 real API calls: `/api/stats`, `/api/events?filter=today`, `/api/activity`, `/api/stats/charts`, `/api/stats/alerts` |
| User actions | Click stat cards to navigate to filtered views, view activity feed, view alert cards |

---

### 3. Events

| Item | Detail |
|------|--------|
| Route | `/events` |
| What it does | Event management — calendar and list views, create events, filter by venue/date |
| Status | **FULLY WORKING** |
| Data source | `/api/events`, `/api/events/calendar`, `/api/venues`, `/api/staff` — all real DB |
| User actions | Switch calendar/list view, filter by date (today/week/month/all), filter by multiple venues, search, create new event/shift with staff assignment |

| Item | Detail |
|------|--------|
| Route | `/events/[id]` |
| What it does | Event detail — assigned techs, workflow status, tickets, activity timeline |
| Status | **FULLY WORKING** (one dead button — see below) |
| Data source | `/api/events/[id]`, `/api/staff/available` — real DB |
| User actions | Assign/unassign technicians, search staff, copy workflow link, create ticket, view post-game report |
| Known issue | "Send Reminder" button renders but has no click handler — does nothing |

---

### 4. Venues

| Item | Detail |
|------|--------|
| Route | `/venues` |
| What it does | Venue directory with health indicators, coverage bars, assignment tracking |
| Status | **FULLY WORKING** |
| Data source | `/api/venues?period={period}` — real DB |
| User actions | Filter by type (Sports/OOH/Facility), filter by period (today/week/month), search, toggle "show unassigned only", create new venue (admin/manager only) |

| Item | Detail |
|------|--------|
| Route | `/venues/[id]` |
| What it does | Venue detail with tabs — events, linked staff, tickets, LED specs, settings |
| Status | **FULLY WORKING** |
| Data source | `/api/venues/[id]`, `/api/venues/[id]/screens`, `/api/venues/[id]/staff`, `/api/tickets?venue_id=`, `/api/staff` — all real DB |
| User actions | Link/unlink staff (admin), manage Slack channel ID, manage distribution emails, toggle contracted services, export staff schedule as PDF, email schedule to venue contact, copy portal link |

---

### 5. Tickets

| Item | Detail |
|------|--------|
| Route | `/tickets` |
| What it does | Ticket management with status pipeline and filters |
| Status | **FULLY WORKING** |
| Data source | `/api/tickets`, `/api/venues`, `/api/events`, `/api/staff` — all real DB |
| User actions | Filter by status (Active/New/On Hold/In Progress/Escalated/Closed/All), switch card/list view, search, create new ticket with venue/event/priority/category |

| Item | Detail |
|------|--------|
| Route | `/tickets/[id]` |
| What it does | Ticket detail — status flow, SLA tracking, unified timeline (comments + emails + status changes), assignment |
| Status | **FULLY WORKING** |
| Data source | `/api/tickets/[id]`, `/api/staff`, `/api/tickets/canned` — all real DB |
| User actions | Change priority/status/category, assign to staff, add internal or external comments, apply canned responses, filter timeline (all/comments/emails/changes), view SLA countdown |

**SLA tiers:** Critical (1h response / 4h resolution), High (2h/8h), Medium (4h/24h), Low (8h/72h)

---

### 6. Staff

| Item | Detail |
|------|--------|
| Route | `/staff` (admin only) |
| What it does | Staff directory with card/list views, bulk import, profile management |
| Status | **FULLY WORKING** |
| Data source | `/api/staff`, `/api/staff/import` — real DB |
| User actions | Switch card/list view, search, filter by role, add new staff, upload CSV (with downloadable template), upload profile photo |

| Item | Detail |
|------|--------|
| Route | `/staff/[id]` |
| What it does | Staff profile — stats, hours, completion rate, linked venues, assigned tickets, activity |
| Status | **FULLY WORKING** |
| Data source | `/api/staff/[id]/stats`, `/api/staff/[id]/venues`, `/api/tickets?staff_id=` — all real DB |
| User actions | Upload/change photo, edit details, link/unlink venues (admin), view assigned tickets, view upcoming events |

---

### 7. Inventory

| Item | Detail |
|------|--------|
| Route | `/inventory` (admin only in sidebar, manager+ access) |
| What it does | Inventory tracking with low-stock alerts per venue |
| Status | **FULLY WORKING** |
| Data source | `/api/inventory` — real DB |
| User actions | Search, filter by venue, filter low stock, add item, edit quantity inline, delete item |

---

### 8. Reports

| Item | Detail |
|------|--------|
| Route | `/reports` |
| What it does | Operations analytics — coverage rates, workflow completion, labor hours, SLA compliance, market/league/staff breakdowns |
| Status | **FULLY WORKING** |
| Data source | `/api/reports?period={period}&venue_id={id}` — real DB with complex aggregation queries |
| User actions | Filter by period (week/month), filter by venue, export PDF |

PDF generation uses Browserless (headless Chrome) running as a Docker service.

---

### 9. Settings

| Item | Detail |
|------|--------|
| Route | `/settings` (admin only) |
| What it does | System configuration — automations, league labor hours, bot identity, scheduled reports |
| Status | **FULLY WORKING** |
| Data source | `/api/settings/cron`, `/api/settings/leagues`, `/api/settings/bot-name`, `/api/settings/report-schedules` — all real DB |
| User actions | Create/delete automation tasks, set estimated hours per league, change bot display name, create/manage scheduled report delivery (venue, frequency, recipients), toggle schedules on/off |

| Known issue | "Run Now" button on cron jobs returns success but **does not actually execute the job** — it's a stub |

---

### 10. Client Portals

| Item | Detail |
|------|--------|
| Route | `/portals` (manager+ only) |
| What it does | Lists all venues with their unique portal links |
| Status | **FULLY WORKING** |
| Data source | `/api/venues` — real DB |
| User actions | Search venues, copy portal link to clipboard |

| Item | Detail |
|------|--------|
| Route | `/portal/[token]` (public, token-based) |
| What it does | Client-facing portal — venue overview, events with workflow timeline, ticket submission, services, assigned team, AI chat |
| Status | **FULLY WORKING** |
| Data source | `/api/portal/[token]`, `/api/portal/[token]/tickets`, `/api/portal/[token]/tickets/ai`, `/api/portal/[token]/chat` — all real DB + AI |
| User actions | View upcoming/past events with workflow status, submit ticket (AI-powered: auto-categorizes, detects sentiment, generates follow-up questions), add comments to existing tickets, chat with venue-specific AI assistant |

---

### 11. Workflow (Field Tech Interface)

| Item | Detail |
|------|--------|
| Route | `/workflow/[eventId]` (public — techs access via link) |
| What it does | 3-stage event workflow: Check-in → Game Ready → Post-Game Report |
| Status | **FULLY WORKING** |
| Data source | `/api/workflow/[eventId]` — real DB |
| User actions | Select technician, submit check-in, confirm game readiness (equipment/crew/comms checks), submit post-game ops report with notes and incident flags |

---

### 12. Integrations

#### Slack — CONNECTED, REAL API CALLS
- **Bot token:** `SLACK_BOT_TOKEN` env var, verified set in production
- **What fires Slack notifications:**
  - Ticket created / updated / commented
  - Staff added / modified
  - Venue created / updated
  - Event created / staff assigned
  - Workflow submitted (check-in, game ready, post-game)
  - Inventory low stock alerts
  - Portal ticket submitted
  - Email replies to tickets
- **Message format:** Structured block messages with priority badges, SLA countdowns, direct links
- **Per-venue channels:** Each venue has a configurable `slack_channel_id`, falls back to default channel
- **Claw bot (internal API):** Can create and update tickets via `/api/internal/tickets` with API key auth

#### Email (Resend) — CONNECTED, CONDITIONAL
- **Outbound:** Ticket notifications emailed to venue distribution lists. Reply-to address is `ticket+XXXXX@ancsports.net` so client replies become ticket comments.
- **Inbound webhook:** `/api/webhooks/email` — receives forwarded emails, matches sender to venue (by email, distribution list, or domain), creates ticket or adds comment.
- **From address:** `notifications@ancsports.net` (configurable via `EMAIL_DOMAIN` env var)
- **Dependency:** Requires `RESEND_API_KEY` env var. If not set, emails silently skip with a console warning.

#### Google Calendar — CONNECTED, MANUAL TRIGGER
- **How it works:** Python script (`/scripts/sync-calendar.py`) reads events from Google Calendar via service account, upserts into `events` table
- **Trigger:** Manual via `/api/calendar-sync` (admin only) — **no automatic cron job running**
- **Dependency:** Requires Google SA key file at `GOOGLE_SA_KEY_PATH`
- **Coverage:** Syncs next 60 days of events from `anc.update@gmail.com` calendar

#### AI (MiniMax M2.7) — CONNECTED, REAL API CALLS
- **Used for:** Portal ticket creation — auto-categorizes, sets priority, detects sentiment (calm/concerned/frustrated/urgent/panicking), generates follow-up questions
- **Dependency:** `AI_API_KEY` env var
- **Fallback:** If AI fails, ticket is created with raw text and default category/priority

#### AnythingLLM — CONNECTED, REAL API CALLS
- **Used for:** Knowledge base chat (internal) and portal AI chat (client-facing, per-venue workspaces)
- **Issue:** API key is hardcoded in source code, not in env vars
- **Workspaces:** `anc-internal`, `anc-knowledge`, `fenway-park`, plus auto-generated per-venue slugs

#### Browserless (PDF Generation) — CONNECTED
- **Used for:** Report PDF export, venue schedule PDF export, portal monthly report, showcase PDF
- **Runs as:** Docker service at `http://abc_browserless:3000/pdf`

---

### 13. Venue-Based Access Control

**Fully implemented and enforced at API level:**
- `staff_venues` junction table links technicians to specific venues
- `getStaffVenueIds()` returns venue IDs for the logged-in tech (returns null for admin/manager = see all)
- `buildVenueFilterClause()` adds SQL WHERE clauses
- **Applied to all 9 data endpoints:** stats, events, venues, tickets, reports, inventory, activity, alerts, charts
- Admin UI on staff detail and venue detail pages to link/unlink with chip-style add/remove

---

## WHAT'S NOT

### Dead Buttons / Stubs

| Item | Location | What's missing |
|------|----------|---------------|
| "Send Reminder" button | `/events/[id]` | Button renders but has no onClick handler — does nothing |
| "Run Now" on cron jobs | `/settings` | Returns HTTP 200 but doesn't actually execute the job — stub |

### Pages Not in Navigation

| Route | What it is | How to access |
|-------|-----------|---------------|
| `/knowledge` | Embeds Outline wiki in an iframe | Direct URL only — not in sidebar |
| `/presentation` | 15-slide marketing presentation about the platform | Direct URL only — not in sidebar |

### Cron Jobs Defined But Not Running

`claw-config.json` defines 5 automation jobs — **all disabled** (`enabled: false`):
- Daily Event Digest
- Escalation Alerts
- Post-Game Summaries
- Weekly Digest
- Workflow Completion Report (marked `enabled: true` in config but no scheduler is actually executing it)

**Impact:** No automated daily digests, no automatic escalation alerts, no post-game summary messages. All of these would need an external scheduler (cron, EasyPanel scheduled task, or similar) calling the appropriate endpoints.

### Calendar Sync Not Automated

Google Calendar sync exists and works, but must be triggered manually by an admin hitting `/api/calendar-sync`. There is no cron job or scheduler calling it automatically. The "every 15 minutes" sync mentioned in marketing materials is not currently running.

### Email Domain

Updated to `ancsports.net`. From address is `notifications@ancsports.net`, reply-to is `ticket+XXXXX@ancsports.net`. Domain is configurable via `EMAIL_DOMAIN` env var.

### Security Items to Address

| Item | Severity | Detail |
|------|----------|--------|
| JWT secret has fallback default | Medium | `middleware.ts` falls back to `'anc-services-secret-key-change-me'` if `JWT_SECRET` env var not set. Should be required, not optional. |
| Internal API key predictable | Medium | `/api/internal/tickets` defaults to `'anc-internal-2026'` if `INTERNAL_API_KEY` not set |
| AnythingLLM API key in source | Low | Hardcoded in `/api/knowledge/chat/route.ts` and `/api/portal/[token]/chat/route.ts` — should be env var |
| Client-side role checks | Low | Sidebar visibility is based on `localStorage.userRole`. A tech could manually edit localStorage to see admin nav links — but API-level role enforcement would still block data access. UI exposure only, not a data leak. |

### Env Vars Required for Full Functionality

| Variable | Status | Impact if missing |
|----------|--------|-------------------|
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | Set | App won't start |
| `JWT_SECRET` | Set (should verify it's not default) | Falls back to predictable default |
| `SLACK_BOT_TOKEN` | Set | All Slack notifications silently skip |
| `SLACK_DEFAULT_CHANNEL` | Set | No fallback channel for venues without one |
| `RESEND_API_KEY` | **Needs verification** | All emails silently skip |
| `AI_API_KEY` | Set | Portal ticket AI falls back to basic parsing |
| `GOOGLE_SA_KEY_PATH` | Set (file must exist) | Calendar sync won't work |
| `INTERNAL_API_KEY` | Not set (defaults to predictable value) | Claw bot API uses weak auth |
| `NODE_ENV` | Set to `production` | JWT cookies use secure flag |

---

## API ENDPOINT INVENTORY

**57 total routes. All query real PostgreSQL. No mock data anywhere.**

### Core CRUD
| Endpoint | Methods | Auth | Notes |
|----------|---------|------|-------|
| `/api/auth/login` | POST | Public | Returns JWT cookie |
| `/api/auth/logout` | POST | Any | Clears cookie |
| `/api/events` | GET | Any | Venue-filtered |
| `/api/events/create` | POST | Manager+ | Slack notification |
| `/api/events/calendar` | GET | Public | Calendar widget data |
| `/api/events/[id]` | GET | Any | Full event detail |
| `/api/events/[id]/assign` | POST/DELETE | Manager+ | Slack notification |
| `/api/staff` | GET/POST | GET: Any, POST: Admin | Slack on create |
| `/api/staff/[id]` | GET/PATCH/DELETE | Admin for write | Soft delete |
| `/api/staff/[id]/stats` | GET | Any | Aggregated stats |
| `/api/staff/[id]/venues` | GET/POST/DELETE | Admin for write | Slack notification |
| `/api/staff/available` | GET | Any | With week hours |
| `/api/staff/import` | POST | Admin | XLSX parsing |
| `/api/venues` | GET | Any | Venue-filtered |
| `/api/venues/create` | POST | Admin | Slack notification |
| `/api/venues/[id]` | GET/PATCH | Manager+ for write | Slack notification |
| `/api/venues/[id]/screens` | GET | Any | LED specs |
| `/api/venues/[id]/staff` | GET/POST/DELETE | Admin for write | Slack notification |
| `/api/tickets` | GET/POST | Any | Slack + Email + SLA |
| `/api/tickets/[id]` | GET/PATCH | Any | Slack + Email |
| `/api/tickets/[id]/comments` | POST | Any | Slack + Email + SLA tracking |
| `/api/tickets/canned` | GET | Any | 8 templates |
| `/api/inventory` | GET/POST/PATCH/DELETE | Manager+ | Slack on low stock |
| `/api/activity` | GET | Any | Venue-filtered feed |

### Stats & Reports
| Endpoint | Methods | Auth | Notes |
|----------|---------|------|-------|
| `/api/stats` | GET | Any | Dashboard summary |
| `/api/stats/charts` | GET | Any | Chart data |
| `/api/stats/alerts` | GET | Any | 4 alert types |
| `/api/stats/open-tickets` | GET | Any | Priority sorted |
| `/api/stats/assigned-staff` | GET | Any | Today's assignments |
| `/api/stats/pending-workflows` | GET | Any | Today's pending |
| `/api/reports` | GET | Any | Full report data |
| `/api/reports/pdf` | GET | Any | Browserless PDF |

### Portal (Public, Token-Based)
| Endpoint | Methods | Auth | Notes |
|----------|---------|------|-------|
| `/api/portal/[token]` | GET | Token | Full venue data |
| `/api/portal/[token]/tickets` | GET/POST | Token | External comments only |
| `/api/portal/[token]/tickets/ai` | POST | Token | MiniMax AI parsing |
| `/api/portal/[token]/tickets/comment` | POST | Token | Slack notification |
| `/api/portal/[token]/chat` | POST | Token | AnythingLLM |
| `/api/portal/[token]/report` | GET | Token | Monthly PDF |

### Settings & Admin
| Endpoint | Methods | Auth | Notes |
|----------|---------|------|-------|
| `/api/settings/bot-name` | GET/PUT | Admin | App settings table |
| `/api/settings/cron` | GET/POST/DELETE | Admin | Job definitions |
| `/api/settings/cron/[id]/run` | POST | Admin | **STUB — doesn't execute** |
| `/api/settings/leagues` | GET/PUT | Admin | Labor hours config |
| `/api/settings/report-schedules` | GET/POST/DELETE | Admin | Schedule management |
| `/api/settings/report-schedules/send` | POST | Public (cron) | Sends due reports |
| `/api/settings/service-types` | GET/POST/DELETE | Admin | Service type CRUD |

### Integrations & Webhooks
| Endpoint | Methods | Auth | Notes |
|----------|---------|------|-------|
| `/api/webhooks/email` | POST | Resend webhook | Email-to-ticket routing |
| `/api/webhooks/proposal` | POST | Webhook secret | rag2 → venue creation |
| `/api/slack/broadcast` | POST | API key | DM all workspace members |
| `/api/slack/canvas` | POST | API key | Slack Canvas CRUD |
| `/api/internal/tickets` | POST | API key | Claw bot ticket creation |
| `/api/internal/tickets/[id]` | PATCH | API key | Claw bot ticket update |
| `/api/calendar-sync` | GET/POST | Admin | Python script trigger |
| `/api/workflow/[eventId]` | GET/POST | Public | Field tech workflow |
| `/api/knowledge/chat` | POST | Any | AnythingLLM internal |
| `/api/schedule/export` | GET | API key or JWT | PDF + optional email |
| `/api/showcase` | GET | Public | Branded 5-page PDF |
| `/api/cron/reminders` | GET | Public (cron) | 3-tier escalation |

---

## BOTTOM LINE

**What works today:** 19 pages, 57 API endpoints, all hitting real PostgreSQL. Slack, email, AI, and calendar sync are real integrations with real API calls — not mocked. Role-based access control is enforced at the API level. Venue-based filtering works across all endpoints for technicians.

**What needs attention before go-live:**
1. Calendar sync needs an automated scheduler (not just manual trigger)
2. Cron jobs (daily digest, escalation alerts, etc.) are defined but not running
3. ~~Email from address~~ — updated to `@ancsports.net`
4. `RESEND_API_KEY` needs verification in production env
5. JWT secret and internal API key should not fall back to defaults
6. "Send Reminder" button on event detail page does nothing
7. "Run Now" on settings cron jobs is a stub
