# ANC Request Hub

One intake system for ideas, builds, changes, and problems — with two
experiences on top of a single record: a conversational requester flow and a
leadership decision table. Slack is a first-class entry point; the dashboard
is the source of truth.

## Surfaces

| Surface | Path | Who |
|---|---|---|
| Requests list / decision table / delivery board | `/request-hub` | everyone (leadership sees the comparison table) |
| Conversational intake wizard | `/request-hub/new` (`?draft=<id>` resumes) | everyone |
| Decision brief (full page) | `/request-hub/[id]` | requester (own) + leadership |
| Admin configuration | `/admin/request-hub` | admin |

## Data model (all in `lib/db.ts` auto-migrations)

- `request_hub_items` — the single request record: type, status, answers (jsonb),
  requester, owner/builder, links to venue/CRM ids, deadline + reason,
  assessment columns (feasibility/effort/duration/value/confidence/
  recommendation) + `assessment` jsonb (facts/assumptions/unknowns/risks/
  reasons), decision record, Slack source + thread pointers.
- `request_hub_activity` — append-only audit trail (same shape as
  `design_request_activity`). Intake, assessment, decision, and delivery
  history survive the whole lifecycle.
- `request_hub_comments`, `request_hub_attachments` (files stored inline as
  data URLs ≤15MB, or external links), `request_hub_links` (account, venue,
  opportunity, project, document, Slack thread, URL).
- `request_hub_config` — admin-editable config overrides (per-key jsonb).
  Defaults live in `lib/request-hub/config.ts`; a missing key falls back to
  the default, `value = null` resets.
- `request_hub_slack_events` — idempotency keys so Slack retries and
  double-clicks can never create duplicates.

Request numbers: `REQ-<year>-<seq>` from `request_hub_number_seq`, assigned at
submission (drafts have none).

## Workflow

`submitted → needs_clarification ⇄ feasibility → leadership_review →
approved → in_progress ⇄ blocked → completed`, plus terminal `on_hold` /
`declined`. Decision moves (approve / decline / hold / need-info) go through
`POST /api/request-hub/[id]/decision` and are approver-gated; delivery moves
through `/status`. The Kanban shows delivery stages by default with an
all-stages toggle.

## Roles

- **Requester** — every authenticated staff member (sees own requests only).
- **Assessor** — managers+ by default, plus the admin-configured list.
- **Approver** — admins by default, plus the configured list. Only approvers decide.
- **Builder** — configured list; can move their own assigned requests on the board.
- **Admin** — staff.role `admin`; owns `/admin/request-hub`.

All checks are server-side (`lib/request-hub/roles.ts`); the UI only hides
what the API already refuses.

## Slack setup

The app reuses the existing Slack bot (`SLACK_BOT_TOKEN`) and fail-closed
signature verification (`SLACK_SIGNING_SECRET` — unset means every Slack call
is rejected).

In the Slack app config (api.slack.com → the ANC app):

1. **Slash command** `/request` → Request URL
   `https://services.ancsports.net/api/slack/request-hub`
2. **Interactivity** → Request URL
   `https://services.ancsports.net/api/slack/interactivity`
   (shared with ticket cards — Request Hub handlers are additive).
3. **Global shortcut** "Submit a request" → callback id `request_hub_new`
4. **Message shortcut** "Turn this into a request" → callback id
   `request_hub_from_message`
5. **Scopes** (minimal): `commands`, `chat:write`, `im:write`, `users:read`.
   The message shortcut payload carries the message itself; permalinks use
   `chat.getPermalink` (no extra scope).

Behavior:

- `/request` opens the quick-intake modal (`/request status` lists your open
  requests; `/request <text>` prefills). If a modal can't be opened the user
  gets a link to the web wizard — never a dead end.
- Message action captures the source message text, author, channel, ts and
  permalink onto the request and links the thread.
- Submission → confirmation DM (request number, status, owner, what's next,
  response time, deep link) + one decision card in the leadership channel
  with Approve / Need information / Hold / Decline buttons.
- Decisions from Slack open a reason/questions modal; "need information" DMs
  the questions straight to the requester, whose answer (web) reopens review.
- Notifications are deliberately quiet: requester DMs at confirmation /
  clarification / decision / completion, owner DM on assignment, thread reply
  on status change (each rule toggleable in admin).

Channel mapping (leadership channel id) is configured at `/admin/request-hub`
→ Slack, not in env.

## AI assistance

`lib/request-hub/ai.ts`, using the shared provider chain (`loadProviders()`).
Everything is a suggestion a human applies:

- Intake assist: title, summary, classification (+reason/confidence), missing
  info, clarifying questions. Runs automatically post-submission to polish
  title/summary of thin submissions; stored in `ai_suggestions`.
- Feasibility brief: facts / assumptions / unknowns strictly separated, rubric
  ratings each with a written reason, recommendation + suggested reviewer.
  Loaded into the editable assessment form via "Draft AI feasibility brief";
  requests carry an "AI draft — needs human review" badge until a person
  edits/saves (which clears `assessment_ai`).
- Duplicate detection: deterministic token-overlap scoring (explainable, no
  model), shown at submission and on demand.
- Slack thread summarization for requests created from a message.

Hard rule enforced in prompts and UI: the model never invents costs, dates,
system facts, or feasibility — thin input degrades to conservative ratings
with the reason stated.

Assistant skills: `create_hub_request`, `list_hub_requests` (registered in the
AI skill manifest; available to Scout/OpenClaw via `/api/ai/invoke`).

## Integrations

`lib/request-hub/integrations.ts` — each adapter reports honest status
(configured = credentials actually present) and is toggleable (+test mode) in
admin. No adapter is faked; the core system works with all of them off.

| Adapter | Uses | Env |
|---|---|---|
| CRM | link picker for accounts/opportunities (`twentyClient`) | `TWENTY_API_URL`, `TWENTY_API_KEY` |
| Slack | everything above | `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` |
| OneDrive/SharePoint | attach drive documents by link | `MSGRAPH_TENANT_ID/CLIENT_ID/SECRET` |
| Email intake | `POST /api/request-hub/intake/email` webhook (Bearer token, idempotent on `message_id`) | `REQUEST_HUB_EMAIL_TOKEN` |

Venue links always work (local DB). Any URL can be attached regardless of
adapters.

## Env vars (all optional — feature degrades, never breaks)

- `REQUEST_HUB_EMAIL_TOKEN` — enables the email intake webhook (unset = 401).
- `NEXT_PUBLIC_URL` — canonical base for deep links (defaults to
  `https://services.ancsports.net`).
- Slack/CRM/Graph vars are shared with the rest of the dashboard.

## API map

```
GET/POST    /api/request-hub                    list / create (draft or submitted)
GET/PATCH/DELETE /api/request-hub/[id]          detail / edit (field-level RBAC) / delete draft
POST        /api/request-hub/[id]/submit        finalize draft → number, routing, Slack pipeline
POST        /api/request-hub/[id]/comments      comment or clarification answer
POST        /api/request-hub/[id]/decision      approve|decline|hold|need_info (approver)
POST        /api/request-hub/[id]/status        delivery/kanban moves
POST        /api/request-hub/[id]/attachments   multipart upload or {url,label}
GET         /api/request-hub/[id]/attachments/[attId]/download
POST/DELETE /api/request-hub/[id]/links
POST        /api/request-hub/[id]/ai            intake_assist | feasibility | duplicates | summarize_thread
GET         /api/request-hub/meta               wizard config, statuses, rubric, venues, staff
GET         /api/request-hub/search-links?q=    linkable records across sources
GET/PUT     /api/request-hub/admin/config       admin config (+ per-key reset)
GET         /api/request-hub/admin/integrations adapter statuses
POST        /api/request-hub/intake/email       inbound email webhook
POST        /api/slack/request-hub              /request slash command
```
