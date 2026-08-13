#!/usr/bin/env bash
# Fires the ticket digests at 8:00 AM New York, every day.
#
# Interim host-side runner: cron calls this EVERY hour and the script decides
# whether it is 8 AM in New York, so the send holds through both DST switches
# without anyone editing a crontab twice a year. Once the app carries
# /api/cron/ticket-digests, swap the crontab line to hit that route instead —
# keep exactly one of the two active so nothing double-sends.
set -uo pipefail

REPO=/root/anc-services
STAMP_DIR=/var/lib/anc-ticket-digests
SERVICE=abc_anc-services

mkdir -p "$STAMP_DIR"

HOUR_ET=$(TZ=America/New_York date +%H)
DATE_ET=$(TZ=America/New_York date +%F)

FORCE="${1:-}"

if [ "$FORCE" != "--force" ] && [ "$HOUR_ET" != "08" ]; then
  exit 0
fi

# Pull the live mail credentials off the running service rather than keeping a
# second copy on disk.
ENV_DUMP=$(docker service inspect "$SERVICE" --format '{{range .Spec.TaskTemplate.ContainerSpec.Env}}{{println .}}{{end}}' 2>/dev/null)
EMAIL_SMTP_PASSWORD=$(printf '%s\n' "$ENV_DUMP" | grep '^EMAIL_SMTP_PASSWORD=' | cut -d= -f2-)
EMAIL_FROM_ADDRESS=$(printf '%s\n' "$ENV_DUMP" | grep '^EMAIL_FROM_ADDRESS=' | cut -d= -f2-)
SLACK_BOT_TOKEN=$(printf '%s\n' "$ENV_DUMP" | grep '^SLACK_BOT_TOKEN=' | cut -d= -f2-)
SLACK_CHANNEL=$(printf '%s\n' "$ENV_DUMP" | grep '^SLACK_SUPPORT_CHANNEL=' | cut -d= -f2-)
export EMAIL_SMTP_PASSWORD EMAIL_FROM_ADDRESS SLACK_BOT_TOKEN

if [ -z "$EMAIL_SMTP_PASSWORD" ]; then
  echo "$(date -u +%FT%TZ) no mail credentials on $SERVICE — not sending" >&2
  exit 1
fi

# TICKET_DIGEST_TEST_TO redirects every report to one address, so the whole
# scheduled path can be exercised end to end without mailing the real list.
fire() {
  local report="$1" recipients="${TICKET_DIGEST_TEST_TO:-$2}" slack="${3:-}"
  [ -n "${TICKET_DIGEST_TEST_TO:-}" ] && slack=""
  local stamp="$STAMP_DIR/$report"

  if [ "$FORCE" != "--force" ] && [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$DATE_ET" ]; then
    echo "$(date -u +%FT%TZ) $report already sent for $DATE_ET"
    return 0
  fi

  local args=(--report "$report" --send "$recipients")
  [ -n "$slack" ] && args+=(--slack "$slack")
  # Only the daily recap is worth sending on an empty day.
  [ "$report" != "open-review" ] && args+=(--skip-empty)

  if (cd "$REPO" && node scripts/fire-ticket-digest.mjs "${args[@]}" 2>&1 | grep -v 'MODULE_TYPELESS\|Reparsing\|trace-warnings\|eliminate this warning'); then
    # Only stamp a send that actually went out — a failure has to retry on the
    # next hourly tick rather than go quiet until tomorrow.
    echo "$DATE_ET" > "$stamp"
  else
    echo "$(date -u +%FT%TZ) $report FAILED" >&2
  fi
}

# The daily recap always goes, even on an empty board — Joe reads it as a
# standing checkpoint. The activity reports are quiet when they have nothing.
fire open-review "joeo@anc.com,cdinh@anc.com" "$SLACK_CHANNEL"
fire new-24h     "cdinh@anc.com"
fire closed-24h  "cdinh@anc.com"
fire escalated   "cdinh@anc.com"
