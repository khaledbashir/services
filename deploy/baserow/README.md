# Baserow — ANC Operations Backend

Self-hosted Airtable replacement for Nick's field-ops work. MIT-licensed core, fully rebrandable, talks to anc-services through the API.

## Quick deploy on EasyPanel

### 1. Create the Baserow service

In EasyPanel, create a new "Compose" service called `anc-baserow`. Paste in [`docker-compose.easypanel.yml`](./docker-compose.easypanel.yml) (or upload it directly).

### 2. Set the env vars

EasyPanel → Service → Environment. Use [`.env.example`](./.env.example) as the template:

```
BASEROW_PUBLIC_URL=https://ops.ancsports.net
BASEROW_SECRET_KEY=<openssl rand -hex 32>
BASEROW_JWT_SIGNING_KEY=<openssl rand -hex 32>
BASEROW_DB_PASSWORD=<openssl rand -hex 24>
BASEROW_REDIS_PASSWORD=<openssl rand -hex 24>
```

### 3. Add a domain

EasyPanel → Service → Domains. Point `ops.ancsports.net` (or your subdomain of choice) at port 80 of the container. Make sure it matches `BASEROW_PUBLIC_URL` exactly — Baserow refuses cookies that don't match the public URL.

### 4. Start the service + register the first user

Hit `BASEROW_PUBLIC_URL` in the browser. The first registration becomes the instance owner. From there, create a workspace, then a database, then tables.

### 5. Generate the API token for anc-services

In the Baserow UI: top-right user menu → **Settings** → **API tokens** → **Create token**.

Give it Read+Write+Create+Delete permissions on the workspace anc-services should be able to talk to. Copy the token (one-time view).

### 6. Wire anc-services

On the EasyPanel **anc-services** service, add env vars:

```
BASEROW_BASE_URL=https://ops.ancsports.net
BASEROW_API_TOKEN=<the token from step 5>
```

Redeploy anc-services. Verify with `GET /api/diagnostics/nocodb` (admin-only) — should return `{ ok: true, backend: "baserow", databases_found: N }`.

## Rebrand layer (optional)

Stock Baserow says "Baserow" everywhere. To swap branding to ANC's:

```
docker build -t anc-baserow:latest deploy/baserow
```

Then update `docker-compose.easypanel.yml` to `image: anc-baserow:latest` (push to a registry first if EasyPanel can't see your local images). The Dockerfile overlays:

- `assets/logo.svg` — replaces the "Baserow" wordmark logo
- `assets/logo-icon.svg` — replaces the square brand icon
- `assets/anc-overrides.css` — CSS overrides for primary color (#0A52EF) and hides upgrade nags
- `sed`-replaces "Baserow" → "ANC Operations" in locale + HTML files

If a major Baserow version bump shifts the asset paths, re-inspect `/baserow/web-frontend/.nuxt/dist/client/static/img/` inside the running container and update the COPY targets in the Dockerfile.

## What lives where after this

- **Baserow UI** (admin only): create databases, tables, fields, set up views. Most of the time you don't need to touch it after the initial schema setup.
- **anc-services `/operations`**: native ANC-branded interface where Nick (and everyone else) does their daily work — read, create, edit, delete rows. No iframe, no Baserow chrome leaking through.
- **anc-services AI agent**: `ops_list_tables`, `ops_query_table`, `ops_create_row` skills let the existing Copilot panel answer cross-system questions ("every Heinz Athletic Center asset offline + every open ticket for that venue" type queries).

## Troubleshooting

- `BASEROW_API_TOKEN is not configured` → env var didn't reach anc-services runtime. Recheck the EasyPanel env config.
- `Baserow 401` → token revoked or scoped to a workspace that doesn't include the database you're hitting. Regenerate.
- `/operations` shows "no tables" but Baserow has them → token's workspace scope is too narrow. In Baserow → Settings → API tokens, edit the token's permissions.
