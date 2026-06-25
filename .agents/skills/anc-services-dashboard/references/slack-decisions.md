# ANC Services Slack Decisions

Slack is the decision source of truth for service-operations behavior. Update this after checking stakeholder threads.

## 2026-05-24 - Prudential Slack-To-Worklog MVP

Source: `#account-prudential-center` review and Ahmad approval to build the first slice.

- Venue Slack channels should be able to turn field conversation into structured Services records without forcing technicians to leave Slack.
- The first MVP supports explicit capture only: `:ticket:` for tickets, `:wrench:` / `:wrench:` / `:toolbox:` for maintenance, and `:walking:` / `:clipboard:` for walkthroughs.
- Avoid broad/common reactions such as `:white_check_mark:` as default capture triggers because venue channels use them casually.
- `/anc ticket`, `/anc maintenance`, `/anc walkthrough`, and `/anc worklog ticket|maintenance|walkthrough` should create the chosen record type from the channel's configured venue.
- Every Slack-created record should keep a durable Slack thread mapping so future reliability timelines can connect the chat source back to the Services artifact.

## 2026-05-21 - Support Email First Version

Source: Ahmad-provided Slack excerpt with Chris D after the Services meeting.

- First email version should be centralized around `support@anc.com`; client-facing replies from Services should come from the shared support mailbox, not individual user mailboxes.
- Services should still record which logged-in ANC user sent the reply for accountability.
- Direct emails to Chris/Nick/others happen today, but personal inbox visibility should be secondary. Later flow can let users connect/promote personal emails into support tickets without exposing whole personal inboxes to the team.
- The useful behavior is email-to-ticket automation: inbound support email should prefill/create/update tickets with sender, venue/client match, subject, body, attachments where possible, and linked CRM thread context.

## 2026-05-21 - OOH Event Noise

Source: Ahmad-provided Otter transcript from Joe/Chris Services meeting.

- Out-of-home / non-sports venue schedules should not auto-populate the Services Events calendar.
- OOH events generally do not change support staffing or response; support still receives calls/issues regardless of public event schedule.
- Managers can still manually create specific OOH events when they matter, e.g. South Street concert series.
- Bulk/cron discovery should focus on sports venues; discovered/feed-sourced events for non-sports venues should be hidden from Events views if already imported.

## 2026-05-19 - Slack Layer Mental Model From Otter Synthesis

Source: Ahmad-provided Otter analysis of recent ANC Service Dashboard meetings. Treat as architecture memory; verify current Slack/Otter product details before configuration.

- ANC has two Slack layers:
  - Otter -> Slack: meeting summaries, action items, access/comment notifications, and rich previews when Otter links are shared.
  - Services Dashboard -> Slack: live operational signals such as tickets, event issues, workflow status changes, approvals, design/proof events, and channel-routed alerts.
- The Services Dashboard Slack layer should route through venue/service/channel mappings, using Slack channel IDs as durable configuration.
- Slack should be the immediate internal "what is happening now" layer for operations, with noise control through central roll-up channels and threaded/detail patterns.
- Do not conflate Otter meeting-summary posts with Services operational notifications. Otter is top-of-funnel context; Services Slack is mid/bottom-funnel execution.

## 2026-05-05 - Walkthrough Add Visit Flow

Source: `#external--ai-services2`, Nick walkthrough thread.

- The Add Visit / walkthrough form should be stripped to the fields Nick requested: Venue, Tech, Locations Visited, Type, Result, Problem Detected, Comments, Attachments.
- Date and time auto-populate on submit.
- A completed walkthrough should get a PDF report attached automatically shortly after submit.
- If Result is New Issue Detected, the system should open a high-priority ticket and write the ticket number back into the walkthrough comments so the two records link both ways.
- This supersedes older local planning language that said walkthroughs in `/operations` should never create tickets.

## 2026-05-04 - Joe AI Demo And Adoption Signals

Source: `#external--ai-services2`, Joe.

- Joe said "The AI stuff is great" and would review, so AI is demoable when framed around concrete operations value.
- Joe asked to see a usage dashboard because staff did not log in as much as expected; adoption/usage signals are useful for upsell and stakeholder control.
- Auto-assignment should not silently overwrite schedules. AI should suggest assignments and let a manager confirm.
- Team-name search matters for support intake, e.g. Flyers/Sixers resolving to the correct venue.

## 2026-05-04 - Walkthrough Date Filters

Source: `#external--ai-services2`.

- "Today's Walkthroughs" should filter to the current day and roll forward automatically.
- For migrated Airtable date filters, use the datetime `Dt` version of the field. The plain field may be legacy text and will not support true date operators.

## 2026-05-04 - Display/Venue Cleanup

Source: `#external--ai-services2`, Nick.

- Displays now have a real Venue field derived from the Display Location to Venue chain.
- Use the new Venue field, not Venue legacy, for filtering/grouping.
- Display Location Name is exposed as a column for grouping, e.g. Moynihan areas like Amtrak Ticketing, Concourse Mezzanine, Main Concourse, Metropolitan Lounge.
- To fix a display assigned to the wrong venue, relink its Display Location rather than hand-tagging the display.

## 2026-05-04 - Service Dashboard Feedback Fixes

Source: `#external--ai-services2`, Joe/Chris team feedback.

- Venue default staffing toggle must immediately clear future red needs-staffing states when flipped off.
- Auto-feed Slack notifications for newly added feed events should stay off.
- Bot interactive controls should be usable by anyone in the workspace, not only a narrow admin list.
- Post-game report reminders must check the correct submitted status so they do not keep pinging after submission.
- Venue pages need Staffing On and Support Only filter chips.

## 2026-05-04 - Slack Ticket Notifications

Source: `#external--ai-services2`.

- Slack does not auto-collapse Block Kit messages the way plain text can.
- Preferred notification pattern is a scannable ticket card in-channel with the full note/body posted in the thread.
- Ticket search/cards should also surface full note text enough that support can scan without excessive click-through.

## 2026-05-04 - Venue Search And Schedule UX

Source: `#external--ai-services2`.

- Venues can have Team Aliases under Settings, so searching Flyers, Sixers, or similar team names can resolve to the correct venue.
- Venue pages should support schedule export as PDF, CSV, and ICS.
- `/venues` supports list view for dense scanning.
- Events venue dropdown should be searchable.

## 2026-06-17 - Marketing Hub / Media & Partnerships Requirements Recheck

Source: local ANC marketing migration checklist and live production/database verification. Slack connector discovery did not expose Slack read tools in this Codex session, so treat this as reconciled against cached Slack-derived notes rather than a fresh channel read.

- Marketing Hub now covers the core replacement buckets: contacts/audiences/safe newsletter membership, newsletter campaigns, tracking events, form routes, form submission archive, templates, approvals, and AI-assisted newsletter/social draft generation.
- Production counts verified on `services.ancsports.net`: 22,568 marketing contacts, 10 audiences, 89,212 audience members, 14 newsletter campaigns, 7,773 recipients, 8,035 campaign events, 24 form routes, 668 form submissions, 11 templates, 4 approval requests, 10 approval tokens, and 472 sync runs.
- Production automation jobs are enabled for Marketing Eligibility Sync (`every-15-minutes`) and Marketing Newsletter Sender (`every-5-minutes`).
- Remaining true gaps are external authorization or live verification, not missing backup/data capture: official LinkedIn/X/Instagram connections, provider bounce webhook live event, live form-notification test, curated brand asset library in the UI, lifecycle/contact-status normalization, and richer historical HubSpot performance metrics.
- Do not demo claims that official social channels are connected or that every form routes to final owners until those external/live checks pass.
