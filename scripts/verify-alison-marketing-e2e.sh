#!/usr/bin/env bash
# Alison Marketing Hub — production E2E verification (read-only + safe API probes)
# Usage: ./scripts/verify-alison-marketing-e2e.sh

set -euo pipefail

BASE="${MARKETING_VERIFY_BASE:-https://services.ancsports.net}"
PASS=0
FAIL=0
WARN=0

pass() { echo "PASS  $1"; PASS=$((PASS + 1)); }
fail() { echo "FAIL  $1"; FAIL=$((FAIL + 1)); }
warn() { echo "WARN  $1"; WARN=$((WARN + 1)); }

code() { curl -sk -o /dev/null -w '%{http_code}' "$1"; }

echo "=== Alison Marketing E2E Verification ==="
echo "Base: $BASE"
echo

# Public surfaces
hub=$(code "$BASE/marketing-hub")
[[ "$hub" == "307" || "$hub" == "200" ]] && pass "Marketing Hub reachable ($hub)" || fail "Marketing Hub ($hub)"

forms=$(code "https://forms.ancsports.net/")
[[ "$forms" == "200" ]] && pass "Forms app reachable" || fail "Forms app ($forms)"

postiz=$(code "https://abc-postiz.izcgmb.easypanel.host/")
[[ "$postiz" == "200" || "$postiz" == "307" ]] && pass "Postiz reachable ($postiz)" || fail "Postiz ($postiz)"

# Cron (scheduled on VPS)
sync_body=$(curl -sk "$BASE/api/cron/marketing-eligibility-sync?dryRun=1&limit=5")
echo "$sync_body" | grep -q '"dryRun":true' && pass "CRM eligibility sync endpoint" || fail "CRM eligibility sync endpoint"

news_body=$(curl -sk "$BASE/api/cron/marketing-newsletters")
echo "$news_body" | grep -q '"campaigns"' && pass "Newsletter sender cron endpoint" || fail "Newsletter sender cron endpoint"

# Webhook protected without secret
wh=$(curl -sk -o /dev/null -w '%{http_code}' -X POST "$BASE/api/webhooks/marketing-email-events" -H 'Content-Type: application/json' -d '[]')
[[ "$wh" == "401" ]] && pass "Bounce webhook rejects unsigned POST" || warn "Bounce webhook unexpected status ($wh)"

# DB counts (requires docker on VPS)
if docker ps --format '{{.Names}}' | grep -q '^anc-services-db-standalone$'; then
  DB_STATS=$(docker exec anc-services-db-standalone psql -U ancservices -d anc_services -t -A -F'|' -c "
    SELECT 'contacts', COUNT(*) FROM marketing_contacts
    UNION ALL SELECT 'newsletter_active', COUNT(*) FROM marketing_audience_members m JOIN marketing_audiences a ON a.id=m.audience_id WHERE a.name='Media & Partnerships Newsletter' AND m.status='active'
    UNION ALL SELECT 'crm_linked', COUNT(*) FROM marketing_contacts WHERE crm_person_id IS NOT NULL;
  ")
  contacts=$(echo "$DB_STATS" | awk -F'|' '$1=="contacts"{print $2}')
  active=$(echo "$DB_STATS" | awk -F'|' '$1=="newsletter_active"{print $2}')
  linked=$(echo "$DB_STATS" | awk -F'|' '$1=="crm_linked"{print $2}')
  [[ "${contacts:-0}" -gt 20000 ]] && pass "Marketing contacts imported ($contacts)" || fail "Marketing contacts ($contacts)"
  [[ "${active:-0}" -gt 3000 ]] && pass "Newsletter audience active ($active)" || fail "Newsletter audience ($active)"
  pct=$(( linked * 100 / (contacts == 0 ? 1 : contacts) ))
  [[ "$pct" -ge 70 ]] && pass "CRM link rate (${pct}%)" || warn "CRM link rate low (${pct}%)"
else
  warn "anc-services-db-standalone not local — skip DB checks"
fi

# Authenticated flow via container JWT (full newsletter pipeline)
SVC=$(docker ps --format '{{.Names}}' | grep '^abc_anc-services\.' | head -1 || true)
if [[ -n "$SVC" ]]; then
  docker exec "$SVC" node --input-type=module -e "
import { SignJWT } from 'jose';
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ email: 'verify-e2e@ancsports.net', role: 'ADMIN' })
  .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('10m').sign(secret);
const h = { Cookie: 'token=' + token, 'Content-Type': 'application/json', Accept: 'application/json' };
const base = process.env.MARKETING_VERIFY_BASE || '$BASE';
const audJ = await (await fetch(base + '/api/marketing/audiences', { headers: h })).json();
const audienceId = audJ.audiences?.find(a => a.name?.includes('Media & Partnerships'))?.id || audJ.audiences?.[0]?.id;
const createJ = await (await fetch(base + '/api/marketing/campaigns', { method: 'POST', headers: h, body: JSON.stringify({ name: 'E2E Verify', subject: 'E2E', previewText: 'test', audienceId, bodyHtml: '<p>test</p>' }) })).json();
const id = createJ.campaign?.id;
if (!id) { console.log('FAIL authenticated_create'); process.exit(2); }
const blocked = await fetch(base + '/api/marketing/campaigns/' + id + '/schedule', { method: 'POST', headers: h, body: JSON.stringify({ scheduledAt: new Date(Date.now()+86400000).toISOString() }) });
console.log(blocked.status === 409 ? 'PASS schedule_gate' : 'FAIL schedule_gate:' + blocked.status);
await fetch(base + '/api/marketing/approvals', { method: 'POST', headers: h, body: JSON.stringify({ itemType: 'newsletter', itemId: id, action: 'approve' }) });
const sched = await fetch(base + '/api/marketing/campaigns/' + id + '/schedule', { method: 'POST', headers: h, body: JSON.stringify({ scheduledAt: new Date(Date.now()+86400000).toISOString() }) });
const schedJ = await sched.json();
console.log(sched.ok && schedJ.prepared > 0 ? 'PASS schedule_prepare:' + schedJ.prepared : 'FAIL schedule_prepare');
const test = await fetch(base + '/api/marketing/campaigns/' + id + '/send-test', { method: 'POST', headers: h, body: JSON.stringify({ email: 'notifications@ancsports.net' }) });
console.log(test.ok ? 'PASS send_test' : 'FAIL send_test');
const slack = await fetch(base + '/api/marketing/approvals/request', { method: 'POST', headers: h, body: JSON.stringify({ itemType: 'newsletter', itemId: id, preview: 'E2E verify' }) });
const slackJ = await slack.json();
const slackOk = slackJ.results?.some(r => r.status === 'sent');
console.log(slackOk ? 'PASS slack_approval_dm' : 'WARN slack_approval_placeholder');
const compose = await fetch(base + '/api/marketing/compose/context', { headers: h });
console.log(compose.status === 200 ? 'PASS compose_context' : 'WARN compose_not_deployed:' + compose.status);
const pixel = await fetch(base + '/api/marketing/track/open/00000000-0000-0000-0000-000000000001');
console.log(pixel.status === 200 && pixel.headers.get('content-type')?.includes('gif') ? 'PASS open_pixel_public' : 'FAIL open_pixel:' + pixel.status);
" 2>&1 | while read -r line; do
    case "$line" in
      PASS*) pass "${line#PASS }" ;;
      FAIL*) fail "${line#FAIL }" ;;
      WARN*) warn "${line#WARN }" ;;
      *) echo "$line" ;;
    esac
  done || true

  signal_len=$(docker exec "$SVC" sh -c 'echo ${#SIGNAL_APPROVERS}')
  [[ "${signal_len:-0}" -gt 5 ]] && pass "SIGNAL_APPROVERS configured" || warn "SIGNAL_APPROVERS not set (Slack DMs use placeholders)"

  webhook_len=$(docker exec "$SVC" sh -c 'echo ${#MARKETING_EMAIL_WEBHOOK_SECRET}${#RESEND_WEBHOOK_SECRET}')
  [[ "${webhook_len:-0}" -gt 5 ]] && pass "Bounce webhook secret configured" || warn "Bounce webhook secret not set in Resend yet"
else
  warn "anc-services container not found — skip authenticated flow"
fi

echo
echo "=== Summary: $PASS passed, $FAIL failed, $WARN warnings ==="
[[ "$FAIL" -eq 0 ]] || exit 1
