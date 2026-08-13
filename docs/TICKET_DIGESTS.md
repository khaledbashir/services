# Ticket digests — Open Ticket Review + activity reports

Joe Occhipinti, 2026-08-13:

> Can I get an email or slack each morning at 8am New York time with a recap of
> all tickets that are still open. I guess this could be a "View" in the ticket
> platform as well. Maybe call it something like — Open Ticket Review.
> I'd like to see — Venue — assignee — days since last update — Latest update
> with date included.

Charlie Dinh, same thread:

> We can generate emails on specific reports like we had in salesforce (we had
> one for new tickets within, one email for closed tickets in the last 24 hours
> and one email for on escalated tickets)

## What ships

| Report | Key | Goes to | Sends when |
|---|---|---|---|
| Open Ticket Review | `open-review` | Joe, Charlie (email) + Support Slack channel | Every day, even when empty |
| New Tickets (24h) | `new-24h` | Charlie (email) | Only when there is at least one |
| Tickets Closed (24h) | `closed-24h` | Charlie (email) | Only when there is at least one |
| Escalated Tickets | `escalated` | Charlie (email) | Only when there is at least one |

The daily recap always sends because Joe reads it as a standing checkpoint —
"nothing open this morning" is itself the answer. The three activity reports
stay quiet on a quiet day so people don't learn to ignore them.

## The view

`/tickets/open-review` — "Open Ticket Review" in the Support menu, and linked
from the Reports index. Joe's four columns in his order, quietest ticket first,
with tabs for the other three reports, a search box, quick filters for
"quiet 7+ days" and "unassigned", and CSV export.

It reads `/api/reports/open-ticket-review`, which renders from the same engine
as the email — the screen and the inbox cannot drift apart.

## Definitions

- **Open** = any status other than `closed`. Merged duplicates are folded into
  their primary ticket and never counted twice.
- **Assignee** = the ticket's primary owner. Extra techs on the roster show as
  `Name +2` rather than filling the column.
- **Days since last update** counts from the newest note on the ticket, which is
  the same thing the "Latest update" column shows. It deliberately does *not*
  count from `updated_at` — a silent status flip would otherwise report a ticket
  as fresh while the note beside it is a month old.
- Tickets with no notes yet count from the day they were opened, and show the
  opening description labelled "opening note".
- Update text is cleaned before display: quoted reply threads, signature blocks,
  mailing-list boilerplate, Outlook `[cid:]` placeholders and duplicated
  `<url>` copies are stripped, then it is truncated at 700 characters on a word
  boundary.

## Scheduling

The host cron hits the route **every hour** and the route itself checks whether
it is 8:00 AM in New York:

```
0 * * * * curl -sk -H "Authorization: Bearer $CRON_SECRET" \
  https://services.ancsports.net/api/cron/ticket-digests >> /var/log/anc-ticket-digests.log 2>&1
```

A fixed UTC crontab line would drift to 7 AM or 9 AM twice a year at the DST
switches — a quiet failure nobody reports. Sends are stamped per report per
New York date in `app_settings`, so a re-run inside the same hour cannot
double-send, and a failed send is never stamped (it retries on the next hour).

Never put a literal `%` in the crontab line — cron truncates it and the entry
logs nothing.

## Recipients

Resolved env → `app_settings` → the people who asked. Change them without a
redeploy:

```sql
INSERT INTO app_settings (key, value, updated_at)
VALUES ('ticket_digest_recipients_open_review', 'joeo@anc.com,cdinh@anc.com', NOW())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
```

Keys: `ticket_digest_recipients_open_review`, `..._new_24h`, `..._closed_24h`,
`..._escalated`. An explicit empty string stops that report. Env overrides are
`OPEN_TICKET_REVIEW_RECIPIENTS`, `TICKET_DIGEST_NEW_RECIPIENTS`,
`TICKET_DIGEST_CLOSED_RECIPIENTS`, `TICKET_DIGEST_ESCALATED_RECIPIENTS`.

Slack goes to `OPEN_TICKET_REVIEW_SLACK_CHANNEL`, falling back to
`SLACK_SUPPORT_CHANNEL` then `SLACK_DEFAULT_CHANNEL`.

## Operating it

```bash
# See the real email body without sending anything
curl -H "Authorization: Bearer $CRON_SECRET" \
  'https://services.ancsports.net/api/cron/ticket-digests?preview=1&report=open-review'

# What would go out, to whom, right now — sends nothing
curl -H "Authorization: Bearer $CRON_SECRET" \
  'https://services.ancsports.net/api/cron/ticket-digests?force=1&dryRun=1'

# Send one report to one address, off-schedule
curl -H "Authorization: Bearer $CRON_SECRET" \
  'https://services.ancsports.net/api/cron/ticket-digests?force=1&report=open-review&recipients=you@anc.com'
```

Tests: `npm run test:ticket-digests` (18, covering staleness maths, email
boilerplate stripping, ordering, the Slack chunking and cap disclosure).
