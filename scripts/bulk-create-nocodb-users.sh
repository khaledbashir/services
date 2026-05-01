#!/usr/bin/env bash
#
# Bulk-create / sync ANC staff into the NocoDB workspace at ops.ancsports.net.
#
# For each email in STAFF_EMAILS:
#   1. If they don't exist in nc_users_v2 → POST /api/v1/auth/user/signup with
#      DEFAULT_PASSWORD (NocoDB handles bcrypt natively).
#   2. If they exist with an empty password (invited via UI but never set up)
#      → SQL UPDATE the bcrypt hash directly so they can log in with
#      DEFAULT_PASSWORD.
#   3. POST /api/v1/workspaces/{wsId}/invitations to grant
#      workspace-level-editor (idempotent — endpoint returns success even
#      when membership already exists).
#
# After this runs, every staff member can hit services.ancsports.net/operations
# and log into the iframe with their work email + DEFAULT_PASSWORD. After that
# one-time login the cookie sticks (SameSite=None+Secure) and the iframe
# auto-SSOs on subsequent loads.

set -euo pipefail

# ---- Config -----------------------------------------------------------------

WORKSPACE_ID="w2116qsq"
DEFAULT_PASSWORD="anc12345"
NOCODB_BASE="https://ops.ancsports.net"
NOCODB_DB_CONTAINER="$(docker ps --format '{{.Names}}' | grep 'abc_anc-nocodb-db\.' | head -1)"
NOCODB_APP_CONTAINER="$(docker ps --format '{{.Names}}' | grep 'abc_anc-nocodb\.' | grep -v '\-db' | head -1)"

# Admin login — used to obtain the JWT for invitations API calls.
ADMIN_EMAIL="ahmadbasheerr@gmail.com"
ADMIN_PASSWORD="73799@Bash"

# ---- Pull staff emails from the dashboard DB ---------------------------------
#
# Launch-day cohort: admins + managers + tech_support. Filter is intentionally
# narrow — adding 100 technicians at once is a security smell when they all
# share a default password. Expand later by editing the WHERE clause.

STAFF_EMAILS=$(docker exec anc-services-db-standalone psql -U ancservices -d anc_services -At -c "
SELECT email
FROM staff
WHERE is_active = true
  AND email IS NOT NULL
  AND email <> ''
  AND role IN ('admin','manager','tech_support')
  AND email NOT LIKE '%bot%'
  AND email NOT LIKE '%basheer.app%'
  AND email NOT LIKE 'claude%'
  AND email NOT LIKE 'ahmaddemotech%'
ORDER BY role, full_name
")

TOTAL=$(echo "$STAFF_EMAILS" | wc -l)
echo "==> Will create / sync $TOTAL accounts in workspace $WORKSPACE_ID with password '$DEFAULT_PASSWORD'"
echo ""

# ---- Get admin JWT -----------------------------------------------------------

JWT=$(curl -s -X POST "$NOCODB_BASE/api/v1/auth/user/signin" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

if [ -z "$JWT" ]; then
  echo "ERROR: failed to obtain admin JWT"
  exit 1
fi
echo "==> Admin JWT obtained"
echo ""

# ---- Generate the bcrypt hash once (used for empty-password resets) ----------

BCRYPT_HASH=$(docker exec "$NOCODB_APP_CONTAINER" node -e "
  const b = require('bcryptjs');
  console.log(b.hashSync('$DEFAULT_PASSWORD', 10));
")
echo "==> Bcrypt hash for '$DEFAULT_PASSWORD': $BCRYPT_HASH"
echo ""

# ---- Process each email ------------------------------------------------------

CREATED=0
RESET=0
INVITED=0
SKIPPED=0
FAILED=0

while IFS= read -r EMAIL; do
  [ -z "$EMAIL" ] && continue
  printf "%-40s " "$EMAIL"

  # Check if user exists in nc_users_v2
  EXISTING=$(docker exec "$NOCODB_DB_CONTAINER" psql -U postgres -d abc -At -c "
    SELECT LENGTH(password) FROM nc_users_v2 WHERE email = '$EMAIL'
  ")

  if [ -z "$EXISTING" ]; then
    # User doesn't exist — signup
    SIGNUP_RESP=$(curl -s -X POST "$NOCODB_BASE/api/v1/auth/user/signup" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$EMAIL\",\"password\":\"$DEFAULT_PASSWORD\"}")
    if echo "$SIGNUP_RESP" | grep -q '"token"'; then
      printf "[CREATED]    "
      CREATED=$((CREATED + 1))
    else
      printf "[SIGNUP-FAIL %s] " "$(echo $SIGNUP_RESP | head -c 50)"
      FAILED=$((FAILED + 1))
      echo ""
      continue
    fi
  elif [ "$EXISTING" = "0" ]; then
    # User exists with empty password — SQL UPDATE
    NEW_TOKEN_VERSION=$(openssl rand -hex 32)
    docker exec "$NOCODB_DB_CONTAINER" psql -U postgres -d abc -c "
      UPDATE nc_users_v2
      SET password = '$BCRYPT_HASH',
          salt = SUBSTRING('$BCRYPT_HASH' FROM 1 FOR 29),
          email_verification_token = NULL,
          token_version = '$NEW_TOKEN_VERSION'
      WHERE email = '$EMAIL'
    " > /dev/null 2>&1
    printf "[PWD-RESET]  "
    RESET=$((RESET + 1))
  else
    # User exists with a real password — leave it alone, just ensure workspace membership
    printf "[EXISTS]     "
    SKIPPED=$((SKIPPED + 1))
  fi

  # Add to workspace (idempotent — invitations endpoint returns success
  # whether or not the user is already a member)
  INV_RESP=$(curl -s -X POST "$NOCODB_BASE/api/v1/workspaces/$WORKSPACE_ID/invitations" \
    -H "xc-auth: $JWT" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"roles\":\"workspace-level-editor\"}")
  if echo "$INV_RESP" | grep -q 'success'; then
    printf "+invited"
    INVITED=$((INVITED + 1))
  else
    printf "+invite-fail"
  fi
  echo ""
done <<< "$STAFF_EMAILS"

echo ""
echo "==> Done."
echo "    Created (new account):       $CREATED"
echo "    Reset (existing, empty pwd): $RESET"
echo "    Skipped (had real password): $SKIPPED"
echo "    Failed:                       $FAILED"
echo "    Workspace invites sent:       $INVITED"

# If we did any direct SQL writes, restart NocoDB so the in-memory user
# cache invalidates — otherwise the affected accounts will fail login
# until the container restarts on its own.
if [ "$RESET" -gt 0 ]; then
  echo ""
  echo "==> Restarting NocoDB container (cache invalidation for $RESET reset users)"
  docker restart "$NOCODB_APP_CONTAINER" > /dev/null
  for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 5
    if curl -sI "$NOCODB_BASE/" --max-time 5 2>/dev/null | head -1 | grep -q "200"; then
      echo "    Up after $((i * 5))s."
      break
    fi
  done
fi

echo ""
echo "==> Tell the team:"
echo "    URL:      services.ancsports.net/operations"
echo "    Email:    your work email (e.g. nicholas.delia@anc.com)"
echo "    Password: $DEFAULT_PASSWORD"
echo "    They log in once inside the iframe; cookie sticks for the session."
