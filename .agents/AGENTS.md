# ANC Services — Agent Rules

## Deployment

- **Always push to GitHub after making changes.** Easypanel watches the repo and auto-builds on push. Never tell the user to "rebuild" or "redeploy" manually — just `git add`, `git commit`, and `git push`.
- The current deploy branch is `codex/option-b-client-model`.

## Middleware & Public Routes

- Static files in `public/` that need to be publicly accessible (no login) must be added to **both**:
  1. The `publicRoutes` array in `middleware.ts`
  2. The `matcher` exclusion regex in `middleware.ts`
- Without both, Next.js middleware will intercept the request and redirect to `/login`.

## Audience & Communication

- When writing docs or reports intended for non-technical leadership, **never include** technical jargon (SQL, Docker, Postgres, API endpoints, container names, etc.). Focus purely on business value, pain points, and outcomes.
- When formatting docs for Slack, use Slack's formatting (`*bold*`, `_italic_`, `•` bullets) — not Markdown (`#`, `**`, `-`).
