# ANC CRM Gamification — Build Checklist

**Target:** crm.basheer.app (playground) — NOT production
**Goal:** Structured gamification layer on top of existing CRM + ops metrics, delivered via Slack + CRM UI + dashboard
**Architecture:** Engine lives in anc-services (DB + API + Slack). CRM UI via Twenty App (front components). Dashboard UI in services dashboard.

---

## Phase 0 — Seed the Playground
- [x] 0.1 Seed 15 staff/technicians into crm.basheer.app (5 field ops, 5 design, 5 support)
- [x] 0.2 Seed historical activity data — 1,119 point events across 30 days for 15 staff
- [ ] 0.3 Verify seed data in CRM UI + services dashboard

## Phase 1 — Database Schema (gamification tables in anc-services DB)
- [x] 1.1 `gamification_points` — staff_id, action_type, points, metadata JSONB, earned_at
- [x] 1.2 `gamification_badges` — id, name, description, icon, tier, category, criteria JSONB
- [x] 1.3 `gamification_user_badges` — staff_id, badge_id, earned_at, context JSONB
- [x] 1.4 `gamification_streaks` — staff_id, streak_type, current_count, best_count, last_activity_at
- [x] 1.5 `gamification_leaderboard_snapshots` — period, team, rankings JSONB, snapshot_at
- [x] 1.6 Seed 20 badge definitions (5 categories: streak, volume, points, specialist, consistency)
- [x] 1.7 Migrations run + 30 streaks + badges awarded

## Phase 2 — Rules Engine (`lib/gamification.ts`)
- [x] 2.1 Point values per action (12 action types defined)
- [x] 2.2 `awardPoints(staffId, actionType, metadata)` — insert + trigger badge/streak check
- [x] 2.3 `checkBadges(staffId)` — evaluate all unearned badges against current stats
- [x] 2.4 `updateStreak(staffId, streakType)` — increment or reset (36hr grace)
- [x] 2.5 `getLeaderboard(period, team?, limit?)` — ranked list
- [x] 2.6 `getProfile(staffId)` — points, badges, streaks, rank, recent activity
- [x] 2.7 Badge definitions:
  - **Streak:** Iron Will (5d), Unstoppable (10d), Legend (25d), Immortal (50d)
  - **Volume:** First Blood (1), Double Digit (10), Half Century (50), Centurion (100), Elite (500)
  - **Speed:** Lightning (fastest ticket resolution in a week), Speedrunner (fastest design turnaround)
  - **Quality:** Perfect Week (zero defects), SLA Champion (100% SLA month), Zero Incidents (30d clean)
  - **Team:** Squad Goals (whole team hits weekly target), All Stars (team #1 for the month)

## Phase 3 — Event Hooks (detect + award in real time)
- [x] 3.1 Hook: workflow_submissions INSERT → award CHECKIN/GAME_READY/POST_GAME + check FULL_WORKFLOW
- [x] 3.2 Hook: ticket status → CLOSED → award TICKET_RESOLVED + SLA check
- [x] 3.3 Hook: design_request status → done → award DESIGN_COMPLETED + budget check
- [x] 3.4 Hook: walkthrough created → award WALKTHROUGH_COMPLETED
- [x] 3.5 Hook: checklist_item completed → award CHECKLIST_ON_TIME if before due
- [x] 3.6 Hook: parts_order delivered → award PARTS_ORDER_FULFILLED
- [x] 3.7 Hook: rma status → closed → award RMA_CLOSED

## Phase 4 — API Endpoints
- [x] 4.1 `GET /api/gamification?action=leaderboard&period=week&team=field_ops&limit=10`
- [x] 4.2 `GET /api/gamification/profile?staffId=xxx`
- [x] 4.3 `GET /api/gamification?action=feed&limit=20`
- [x] 4.4 `GET /api/gamification?action=badges`
- [x] 4.5 `GET /api/gamification?action=team-standings`
- [x] 4.6 Cron: daily leaderboard snapshot at midnight (`/api/cron/gamification-snapshot`)

## Phase 5 — Slack Celebrations
- [x] 5.1 Badge earned → post to configurable channel (emoji + name + badge + what they did)
- [x] 5.2 Streak milestone (5/10/25/50/100) → fire emoji post
- [x] 5.3 Weekly leaderboard → Monday 9 AM post (top 5 per team) (`/api/cron/gamification-weekly`)
- [x] 5.4 Monthly MVP → 1st of month post (#1 per team) (`/api/cron/gamification-monthly`)
- [x] 5.5 Team achievement → team shoutout when collective target hit
- [x] 5.6 Format: Slack Block Kit with badges as emoji, clean tables, links to profiles

## Phase 6 — Dashboard UI (services dashboard `/gamification`)
- [x] 6.1 Leaderboard page with period toggle (day/week/month/all-time) + team filter
- [x] 6.2 Per-user profile card at `/gamification/profile/[staffId]` (points, badges, streaks, rank, recent activity)
- [x] 6.3 Team comparison cards (field ops vs design vs support) with points + MVP
- [x] 6.4 Badge gallery (/gamification/badges) with category filter, tier colors, earned counts
- [x] 6.5 Live activity feed (/gamification/feed) with action emojis, team badges, time-ago
- [x] 6.6 Sidebar nav link (Leaderboard section with 3 links)

## Phase 7 — Twenty CRM App (front components on crm.basheer.app)
- [ ] 7.1 Scaffold Twenty app: `anc-gamification`
- [ ] 7.2 Front component: Staff Member record page — badge shelf + points + streak
- [ ] 7.3 Front component: Team leaderboard widget on Company page
- [ ] 7.4 Navigation menu item: "Leaderboard" in sidebar
- [ ] 7.5 Logic function: HTTP route to serve gamification data to front components
- [ ] 7.6 Deploy to crm.basheer.app

## Phase 8 — Tuning & Polish
- [ ] 8.1 Test full flow: action → points → badge → Slack post → leaderboard update
- [ ] 8.2 Balance point values (no single action dominates)
- [ ] 8.3 Test with seed data — verify leaderboards make sense
- [ ] 8.4 Opt-out preference (DB-backed)
- [ ] 8.5 Rate limiting on Slack posts (no spam)

## Phase 9 — Migrate to Production
- [ ] 9.1 Review with Ahmad — keep/cut/adjust
- [ ] 9.2 Run migrations on prod DB
- [ ] 9.3 Wire hooks into prod event flows
- [ ] 9.4 Deploy Twenty app to crm.ancsports.net
- [ ] 9.5 Enable Slack posting to real ANC channels
- [ ] 9.6 Announce to team

---

**Current status:** Phases 0-6 complete. Next: Twenty CRM app (Phase 7), then tuning
**Last updated:** 2026-05-21

### Completed so far:
- [x] Phase 0 — 15 staff seeded into CRM + 1,119 point events + 30 streaks + badges awarded
- [x] Phase 1 — 5 gamification tables created + 20 badge definitions
- [x] Phase 2 — Full rules engine in lib/gamification.ts (12 action types, badge/streak logic)
- [x] Phase 3 — 7 event hooks wired (workflow, tickets, design, walkthroughs, checklists, parts-orders, RMA) — all idempotent via awardPointsOnce
- [x] Phase 4 — 5 API endpoints + daily snapshot cron
- [x] Phase 5 — Slack celebrations: badge/streak auto-post, weekly leaderboard cron, monthly MVP cron, team achievements
- [x] Phase 6 — 3 UI pages live (leaderboard, badges, feed) + sidebar nav
- [ ] Phase 7 — Twenty CRM app (front components)
- [ ] Phase 8 — Tuning
- [ ] Phase 9 — Production migration
