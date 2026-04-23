# Slack AI Assistant

This repo now includes a first-party Slack assistant endpoint at:

- `/api/slack/events`

## What It Does

- responds to `app_mention` events
- responds in DMs
- maps Slack users to ANC staff via `staff.slack_user_ids`
- keeps one AI chat thread per Slack thread via `slack_ai_threads`
- injects recent Slack channel/thread context so prompts like "did I miss anything?" work against real Slack history
- exposes a native `slack_create_canvas` AI tool so the assistant can create Slack canvases
- uses the existing ANC AI/tool stack and current OpenAI-compatible provider config

## Required Env Vars

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `AI_BASE_URL`
- `AI_API_KEY`
- `AI_MODEL`

Recommended:

- `ANC_SLACK_ADMIN_IDS`
- `OPENCLAW_CLAW_STAFF_ID`

## Slack App Setup

Add these bot scopes:

- `app_mentions:read`
- `channels:history`
- `channels:join`
- `channels:read`
- `chat:write`
- `groups:history`
- `groups:read`
- `im:history`
- `im:read`
- `im:write`
- `mpim:history`
- `mpim:read`
- `canvases:write`
- `canvases:read`

Subscribe to these events:

- `app_mention`
- `message.channels`
- `message.groups`
- `message.im`
- `message.mpim`

Use the request URL:

- `https://<your-host>/api/slack/events`

## User Mapping

The assistant only runs with real ANC permissions when the Slack user is mapped.

Map a user by adding their Slack user ID into:

- `staff.slack_user_ids`

Or temporarily allow an admin Slack ID through:

- `ANC_SLACK_ADMIN_IDS`

## What Still Needs Credentials From You

Slack:

- Slack app created and installed
- bot token
- signing secret

Google actions:

- Google Cloud OAuth client
- refresh token or delegated auth approach for Gmail/Calendar/Meet
- confirmation of which Google account the assistant should act as

CRM:

- confirm whether "ANC CRM" means the existing Twenty/ANC dashboard connection only, or an additional external CRM action surface
