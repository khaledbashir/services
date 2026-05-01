# Saltcorn — ANC Operations Backend

MIT-licensed Airtable replacement, replacing Baserow for Nick's field-ops work.
Postgres-backed, fully rebrandable via Settings UI, AI BYO via official plugins.

## Why Saltcorn over Baserow / NocoDB / etc.

After exhaustive evaluation (see chat history, deep research output): Saltcorn
is the only fully MIT-licensed OSS option with native AI BYO (via the official
`large-language-model` + `copilot` plugins), native calendar (`fullcalendar`),
native kanban, dark mode (via `any-bootstrap-theme`), and zero ongoing
trade-offs. The cost is a one-time view-build per table, paid once.

## Quick deploy on EasyPanel

### 1. Create the Saltcorn service

In EasyPanel, create a new "Compose" service called `anc-saltcorn`. Paste in
[`docker-compose.easypanel.yml`](./docker-compose.easypanel.yml).

### 2. Set the env vars

Use [`.env.example`](./.env.example) as the template:

```
SALTCORN_PUBLIC_URL=https://ops.ancsports.net
SALTCORN_SESSION_SECRET=$(openssl rand -hex 32)
SALTCORN_DB_PASSWORD=$(openssl rand -hex 24)
SALTCORN_CSP_FRAME_ANCESTORS='self' https://services.ancsports.net
```

### 3. Add a domain

EasyPanel → Service → Domains. Point `ops.ancsports.net` (or whatever
subdomain) at port 3000 of the Saltcorn container. Make sure HTTPS is on —
Saltcorn refuses cross-origin cookies on plain HTTP.

### 4. Start the service + register the first admin

Hit `SALTCORN_PUBLIC_URL`. The first user becomes admin. Use Ahmad's standard
ANC creds.

### 5. Install the required plugins

Settings → Plugins → install from store:

- **large-language-model** — BYO key for OpenAI/Anthropic/Ollama
- **copilot** — AI builder + chat over data
- **fullcalendar** — Calendar view template
- **any-bootstrap-theme** — Custom CSS / dark mode / brand color
- **kanban** — Drag-drop kanban view
- **gallery** — Card / gallery view

### 6. Configure the LLM

Settings → Plugins → large-language-model → set:

- Provider: OpenAI (or Anthropic, or Ollama)
- API Key: your key
- Default model: `gpt-4o-mini` (or whatever)

### 7. Run the Airtable migrator

```bash
cd /root/anc-services/scripts/airtable-to-saltcorn
python3 migrate.py
```

This pulls the 7 ANC Airtable bases (skipping the test base) and creates
Saltcorn tables + fields + rows.

### 8. Auto-scaffold default views

```bash
python3 scaffold_views.py
```

Creates a default List + Edit + Show view per table. Hand-tune the priority
tables (Walkthroughs Calendar, Issues Kanban) afterward.

### 9. Apply ANC theme

Settings → Plugins → any-bootstrap-theme → upload
`/root/anc-services/deploy/saltcorn/anc.bootstrap.css`. Sets dark mode + ANC
brand color (#0A52EF) + logo override.

### 10. Wire iframe in services-dashboard

Replace `app/operations/page.tsx` with an iframe pointing at
`SALTCORN_PUBLIC_URL`. Saltcorn already has `frame-ancestors` set via env.

## Files

- `docker-compose.easypanel.yml` — the EasyPanel compose file
- `.env.example` — required env vars
- `anc.bootstrap.css` — ANC dark theme + brand colors (generated, see scripts/)

## Troubleshooting

- `SALTCORN_PUBLIC_URL must be set` → env didn't reach the container. Check EasyPanel.
- 401 / cookie rejected when iframed → `SALTCORN_COOKIE_SAMESITE=none` + HTTPS required.
- Plugins won't install → check Saltcorn has outbound network access on the EasyPanel network.
