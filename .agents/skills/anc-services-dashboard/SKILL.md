---
name: anc-services-dashboard
description: Use for ANC Service Dashboard work in /root/anc-services, services.ancsports.net, service operations, venue events, staffing, workflows, tickets, client portals, proof sharing, operations workspace, Slack service bot, ElevenLabs voice routes, event discovery, and Service Dashboard to Twenty CRM sync.
---

# ANC Services Dashboard

Use this for the ANC service operations app at [anc-services](file:///root/anc-services).

## First Read

- [ANC_Service_Dashboard_Walkthrough.md](file:///root/anc-services/ANC_Service_Dashboard_Walkthrough.md) for the product surface.
- [AIRTABLE_OPS_WORKSPACE_PLAN.md](file:///root/anc-services/docs/AIRTABLE_OPS_WORKSPACE_PLAN.md) for the current `/operations` direction.
- [TWENTY_OPS_REWRITE_CHECKLIST.md](file:///root/anc-services/docs/TWENTY_OPS_REWRITE_CHECKLIST.md) for Twenty-backed ops modules status.
- [slack-decisions.md](file:///root/anc-services/.agents/skills/anc-services-dashboard/references/slack-decisions.md) for latest Services decisions pulled from Slack.
- [DASHBOARD_CAPABILITIES.md](file:///root/.openclaw/workspace-anc-agent/DASHBOARD_CAPABILITIES.md) when you need a current page/API inventory. It is generated from the live Services code and can be more current than static docs.

## What This App Owns

`anc-services` is the execution layer for service operations:

- venue events and schedules
- staff assignments, workload, and mobile workflows
- check-in, game-ready, and post-game report submissions
- service tickets, SLA, comments, assignment, voicemail-to-ticket
- client portals and monthly service reports
- proof sharing for design/client approval flows
- operations workspace for Nick-style Airtable workflows
- Slack notifications and Services-side Slack assistant endpoints
- event discovery and sync jobs
- service-side sync into Twenty CRM

Do not move day-of service operations into CRM by default. CRM should expose linked account context; Services Dashboard remains the operational UI.

## Stack And Locations

- App path: [anc-services](file:///root/anc-services)
- Stack: Next.js 14, React 18, TypeScript, Tailwind, PostgreSQL, JWT/bcrypt auth.
- Main live URL in current docs/memory: `https://services.ancsports.net`.
- Public-facing product language may say `services.ancsports.net` or `services.anc.com`; verify the active deployment before giving a link.
- Key code:
  - `app/` for pages and API routes.
  - [db.ts](file:///root/anc-services/lib/db.ts) for Postgres access.
  - [twenty-sync.ts](file:///root/anc-services/lib/twenty-sync.ts) for events/tickets/technician sync to Twenty.
  - [twenty-ops.ts](file:///root/anc-services/lib/twenty-ops.ts) for Twenty-backed ops module client.
  - `lib/ai/registry.ts` and `lib/ai/skills/` for in-dashboard/Slack-invokable AI skills.
  - `app/api/ai/invoke/route.ts` for OpenClaw service-to-service skill invocation.

## Current Product Shape

- Dashboard: stat cards, alerts, today's timeline, workflow status, labor budget, markets.
- Events: calendar/list views, assigned techs, workload-aware assignment, workflow links.
- Venues: events, staff, specs, settings, client portal token, assignment/service toggles.
- Staff: card/list views, profile detail, workload, markets, recent workflow activity.
- Tickets: list/card views, SLA deadlines, internal vs client-visible comments, quick replies, Slack notifications, merge support, voicemail source.
- Client portal: tokenized no-login venue view with live workflow timeline, AI ticket creation, ticket history, service/specs, PDF reports.
- Reports: coverage, workflow, labor, SLA metrics, Browserless PDF exports.
- Operations workspace: Airtable-style `/operations` shell for displays, walkthroughs, maintenance; tickets stay in `/tickets`.

## Important Boundaries

- `/operations` is not ticketing. Walkthroughs save observations only; support tickets stay in `/tickets`.
- Exception from 2026-05-05 Slack: the dedicated Add Visit / walkthrough flow should create and link a high-priority ticket when Result is New Issue Detected.
- Baserow is fallback/admin scratchpad, not the daily user experience.
- Do not expose internal comments to clients.
- Check role/RBAC behavior server-side; do not rely on hidden buttons.
- For staff assignment, check local/venue fit and time conflicts before assigning.

## Twenty Integration

Services syncs service-side data into Twenty so CRM has account-level visibility:

- [twenty-sync.ts](file:///root/anc-services/lib/twenty-sync.ts) syncs events and tickets to Twenty REST, using `servicesId` to dedupe/link.
- [twenty-ops.ts](file:///root/anc-services/lib/twenty-ops.ts) is the typed client for the 8 Twenty-backed ops objects:
  `inventoryAsset`, `maintenanceLog`, `walkthroughLog`, `rmaTracker`, `designRequest`, `cgDesignRequest`, `designerTimeEntry`, `designerHoursBudget`.
- Twenty venues store the Services dashboard UUID in `servicesId`; Services translates dashboard venue ids to Twenty venue ids for filters and writes.
- Twenty API rate limit handling is centralized in `twentyFetch` with pacing/retry.

Do not hardcode stale ids from docs if live metadata matters. Verify through the live API or generated capabilities file.

## AI And Slack

Services has its own AI tool registry:

- Skills live in `/root/anc-services/lib/ai/skills/`.
- Registry is in `/root/anc-services/lib/ai/registry.ts`.
- `/api/ai/invoke` lets OpenClaw call a single Services skill by name with structured JSON.
- Caller is resolved from `staff.slack_user_ids` or an admin allowlist.
- Every skill returns a structured success/error object; use `text_summary` as the Slack-ready one-liner.

Prefer `/api/ai/invoke` for Slack-to-Services actions instead of curling bespoke endpoints. It handles role gating, JSON shape, and duplicate Slack-notification suppression.

## Slack Operations Layer

For ANC Services, Slack is the real-time ops visibility layer, not just a chat add-on:

- Venue/service Slack channel IDs are configuration data. Tickets, status changes, workflow alerts, design/proof events, and escalation summaries should route to the mapped channel rather than random DMs.
- Keep granular updates in the relevant venue/service channel and roll-ups in central operations/event channels when signal would otherwise become white noise.
- Slack can supplement or replace internal email for operations, while client-facing email can still sit behind the ticket system when needed.
- Treat Otter-to-Slack meeting summaries as a separate upstream layer: useful for meeting decisions/action items, but not the same system as Services Dashboard ticket/event notifications.
- When wiring Slack behavior, preserve Joe's preference for controlled signal: avoid noisy auto-feed pings unless explicitly approved, and prefer scannable cards with details in threads.

## Event Discovery

Current event discovery lives in `lib/event-discovery.ts` plus:

- `POST /api/events/discover`
- `POST /api/events/discover/import`
- `GET /api/cron/discover-events`

It searches public sources, AI-normalizes event candidates, dedupes against existing events, supports preview/import, writes source/confidence/status/requires_staffing, and posts cron summaries. Pilot venues noted in docs: Prudential Center and Fenway Park.

## Verification

For code changes:

- Run the relevant TypeScript/build check when feasible.
- For UI work, use browser screenshots when layout or interaction matters.
- For Services production work, verify the live route or generated capability when possible.
- If touching sync, verify both the Services record and the corresponding Twenty record.
- If touching Slack/AI, test through `/api/ai/invoke` or OpenClaw, then inspect the real artifact/action.

## Known Recovery Notes

- **2026-06-19 Bad Gateway on `https://services.ancsports.net/`**: `abc_anc-services` was healthy and listening on container port `80`, but the Docker service VIP `abc_anc-services:80` was unreachable from Traefik. Recycled only `abc_anc-services`, then changed the Traefik file-provider service URLs in `/etc/easypanel/traefik/config/main.yaml` for `abc_anc-services-0/1/2` to `http://tasks.abc_anc-services:80/`. Added durable override `/etc/easypanel/traefik/config/services-anc-domain.yaml` with priority `100`, routing `services.ancsports.net` to `http://tasks.abc_anc-services:80/`; access logs should show `https-services-anc-domain@file`. A second backend issue appeared because the app still had old pooled DB connections to `10.11.0.6`; `anc-services-db-standalone` was restarted, Postgres came back on `10.11.157.215`, and `abc_anc-services` was recycled again so it resolved the refreshed DB endpoint. Verified public `/` redirected to `/login`, `/login` returned 200, `/api/events` and `/api/stats` returned the expected unauthenticated JSON, app-to-DB `5432` was open, and a headless Chrome screenshot rendered the login page.
- **2026-06-24 EasyPanel metrics/logs blank plus Services DB `EHOSTUNREACH 10.11.0.2:5432`**: EasyPanel telemetry recovered by forcing the metrics/logging stack (`easypanel-cadvisor`, `easypanel-node-exporter`, `easypanel-prometheus`, `easypanel-loki`, `easypanel-promtail`, `easypanel`) and refreshing DNS routing. The Services error was a stale overlay attachment on the standalone `anc-services-db-standalone` container. Restarting only that database container gave it a fresh EasyPanel network IP, then forcing `abc_anc-services` cleared pooled connections to the dead IP. Verify with app-container `nc -zvw5 anc-services-db-standalone 5432`, public `/login`, and an authenticated export.

## Durable Memory

Update this skill or its references when you learn a durable Services rule. Update `anc-domain` when ownership/language changes. Update `anc-ai-systems-map` when a new AI surface or bridge appears.
