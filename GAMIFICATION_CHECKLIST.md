# ANC CRM Gamification — Build Checklist

**Target:** crm.basheer.app (playground) — NOT production
**Goal:** Structured gamification layer on top of existing CRM + ops metrics, delivered via Slack + CRM UI + dashboard
**Architecture:** Engine lives in anc-services (DB + API + Slack). CRM UI via Twenty App (front components). Dashboard UI in services dashboard.

---

## Phase 0 — Seed the Playground
- [ ] 0.1 Seed 15 staff/technicians into crm.basheer.app with names, roles, teams, regions (CRM already has 4,706 companies + 22K people + 6K opps — just needs staff)
- [ ] 0.2 Seed historical activity data into services dashboard DB — walkthroughs, tickets, workflow completions, design completions tied to the seeded staff
- [ ] 0.3 Verify seed data in CRM UI + services dashboard

## Phase 1 — Database Schema (gamification tables in anc-services DB)
- [ ] 1.1 `gamification_points` — staff_id, action_type, points, metadata JSONB, earned_at
- [ ] 1.2 `gamification_badges` — id, name, description, icon, tier (bronze/silver/gold/platinum), category, criteria JSONB
- [ ] 1.3 `gamification_user_badges` — staff_id, badge_id, earned_at, context JSONB
- [ ] 1.4 `gamification_streaks` — staff_id, streak_type, current_count, best_count, last_activity_at, started_at
- [ ] 1.5 `gamification_leaderboard_snapshots` — period, team, rankings JSONB, snapshot_at
- [ ] 1.6 Seed badge definitions (all tiers + categories)
- [ ] 1.7 Run migrations

## Phase 2 — Rules Engine (`lib/gamification.ts`)
- [ ] 2.1 Point values per action:
  - `WALKTHROUGH_COMPLETED` = 10
  - `TICKET_RESOLVED` = 15
  - `TICKET_SLA_MET` = 5 (bonus)
  - `DESIGN_COMPLETED` = 20
  - `DESIGN_UNDER_BUDGET` = 10 (bonus)
  - `CHECKIN_ON_TIME` = 5
  - `GAME_READY` = 5
  - `POST_GAME_REPORT` = 10
  - `FULL_WORKFLOW` = 15 (bonus for all 3)
  - `CHECKLIST_ON_TIME` = 10
  - `PARTS_ORDER_FULFILLED` = 10
  - `RMA_CLOSED` = 15
- [ ] 2.2 `awardPoints(staffId, actionType, metadata)` — insert + trigger badge/streak check
- [ ] 2.3 `checkBadges(staffId)` — evaluate all unearned badges against current stats
- [ ] 2.4 `updateStreak(staffId, streakType)` — increment or reset
- [ ] 2.5 `getLeaderboard(period, team?, limit?)` — ranked list with points + rank delta
- [ ] 2.6 `getProfile(staffId)` — points, badges, streaks, rank, recent activity
- [ ] 2.7 Badge definitions:
  - **Streak:** Iron Will (5d), Unstoppable (10d), Legend (25d), Immortal (50d)
  - **Volume:** First Blood (1), Double Digit (10), Half Century (50), Centurion (100), Elite (500)
  - **Speed:** Lightning (fastest ticket resolution in a week), Speedrunner (fastest design turnaround)
  - **Quality:** Perfect Week (zero defects), SLA Champion (100% SLA month), Zero Incidents (30d clean)
  - **Team:** Squad Goals (whole team hits weekly target), All Stars (team #1 for the month)

## Phase 3 — Event Hooks (detect + award in real time)
- [ ] 3.1 Hook: workflow_submissions INSERT → award CHECKIN/GAME_READY/POST_GAME + check FULL_WORKFLOW
- [ ] 3.2 Hook: ticket status → CLOSED → award TICKET_RESOLVED + SLA check
- [ ] 3.3 Hook: design_request status → done → award DESIGN_COMPLETED + budget check
- [ ] 3.4 Hook: walkthrough created → award WALKTHROUGH_COMPLETED
- [ ] 3.5 Hook: checklist_item completed → award CHECKLIST_ON_TIME if before due
- [ ] 3.6 Hook: parts_order delivered → award PARTS_ORDER_FULFILLED
- [ ] 3.7 Hook: rma status → closed → award RMA_CLOSED

## Phase 4 — API Endpoints
- [ ] 4.1 `GET /api/gamification/leaderboard?period=week&team=field_ops&limit=10`
- [ ] 4.2 `GET /api/gamification/profile/[staffId]`
- [ ] 4.3 `GET /api/gamification/feed?limit=20` — recent achievements across all users
- [ ] 4.4 `GET /api/gamification/badges` — all badge definitions with earned counts
- [ ] 4.5 `GET /api/gamification/team-standings` — team aggregate comparison
- [ ] 4.6 Cron: daily leaderboard snapshot at midnight

## Phase 5 — Slack Celebrations
- [ ] 5.1 Badge earned → post to configurable channel (emoji + name + badge + what they did)
- [ ] 5.2 Streak milestone (5/10/25/50) → fire emoji post
- [ ] 5.3 Weekly leaderboard → Monday 9 AM post (top 5 per team)
- [ ] 5.4 Monthly MVP → 1st of month post (#1 per team)
- [ ] 5.5 Team achievement → team shoutout when collective target hit
- [ ] 5.6 Format: Slack Block Kit with badges as emoji, clean tables, links to profiles

## Phase 6 — Dashboard UI (services dashboard `/gamification`)
- [ ] 6.1 Leaderboard page with period toggle (day/week/month/all-time)
- [ ] 6.2 Per-user profile card (points, badges, streaks, rank, sparkline)
- [ ] 6.3 Team comparison view (field ops vs design vs support)
- [ ] 6.4 Badge gallery (all badges, earned/locked state per user)
- [ ] 6.5 Live activity feed (scrolling recent achievements)
- [ ] 6.6 Sidebar nav link

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

**Current status:** Phase 1 — building gamification DB schema + engine
**Last updated:** 2026-05-20

### Phase 0 completed:
- [x] 0.1 — 15 staff seeded into crm.basheer.app (5 field ops, 5 design, 5 support)
- [ ] 0.2 — historical activity data (will seed after engine is built)
- [ ] 0.3 — verify in UI
