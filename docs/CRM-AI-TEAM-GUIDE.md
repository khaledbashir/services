# 🚀 Your New AI Assistants — ANC CRM

**For:** Alexis, Nick, Gianni
**Built:** April 10, 2026
**What this is:** Ten AI assistants (we call them "skills") now live inside Twenty CRM. They know your data, your workflows, and your clients. You chat with them in plain English and they do the work.

---

## 🎯 TL;DR

- **Log into Twenty CRM:** https://abc-twenty.izcgmb.easypanel.host
- **Find the AI panel:** click the chat icon (bottom right or sidebar — look for the sparkle ✨)
- **Pick your skill from the dropdown** — each person has 3-4 skills tuned for their role
- **Type in plain English** — the AI knows the data, don't over-explain
- **Try the test prompts below** and send me feedback within 24 hours

**No training needed. No docs to read. Just open it and talk.**

---

# 🎨 Alexis — Your 4 skills

| Skill | What it does |
|---|---|
| **Design Request Triage** | Paste a client email or Slack message → AI creates the full Design Request record with estimated hours, assignee, and similar past jobs |
| **Similar Design Finder** | Semantic search across all 20,165 historical design requests. "Find past Celtics halftime graphics" → returns top 5 matches with file paths and hours |
| **Designer Hours Watchdog** | Track client hour budgets vs contracted. "How are we pacing on the Knicks this month?" |
| **Print Request Assistant** | Britten workflow helper — pricing math, margin calculator, Britten visibility checks, draft order emails |

## 🧪 Test prompts for Alexis

Open Twenty → AI chat → pick **"Design Request Triage"** and paste this:

> *"New request from the Red Sox — they want a center-hung ribbon graphic for opening night April 10, same format as last year with the updated 2026 logo"*

**What should happen:** AI creates a Design Request record, estimates hours based on your 2025 + 2024 + 2023 opening night ribbons (real historical data), suggests an assignee, flags any budget concerns.

---

Then switch to **"Similar Design Finder"** and try:

> *"Find past Celtics halftime graphics"*

**What should happen:** Returns the 5 closest past jobs with hours spent, assignees, and FTP file paths — straight from your 20K history.

---

Then **"Designer Hours Watchdog"**:

> *"How are we pacing on the Knicks this month?"*

**What should happen:** Shows hours used vs contracted, days remaining, projected burn, and the top time sinks for the month.

---

Then **"Print Request Assistant"**:

> *"Price out 4 home plates and 2 small home plates for Red Sox, standard turn, Britten quoted $480/HP and $320/SHP, thinking $650/HP and $450/SHP on our side"*

**What should happen:** Full ANC vs Britten breakdown with margin calculation, ready to create a Print Request.

---

# 🔧 Nick — Your 3 skills

| Skill | What it does |
|---|---|
| **Failure Pattern Detective** | Analyzes your full 41K Airtable ops history to find recurring failures. "What's breaking most at Prudential?" → top 5 patterns with recommendations |
| **Walkthrough Scribe** | Dictate or type walkthrough notes informally, AI creates a clean Walkthrough Log + auto-creates linked Issues for anything flagged |
| **Inventory Locator** | Unified search across all 4 merged inventory bases (WMATA + NY + South + Inventory Tracking). "Do we have 3x Samsung 55" and where?" |

## 🧪 Test prompts for Nick

Pick **"Failure Pattern Detective"**:

> *"What's been breaking most at Prudential this year?"*

**What should happen:** Queries your WMATA + NY + service ticket history, ranks top 5 failure modes, and gives specific recommendations (which assets to replace, which patterns are accelerating).

---

Then **"Walkthrough Scribe"** — dictate (or type) informally:

> *"Just finished Barclays walkthrough. Everything good except the north ribbon section 114 has two dim pixels, not critical but worth getting to this week. Also the rack 3 cooling fan is loud, not impacting anything yet."*

**What should happen:** Creates a Walkthrough Log record with result "Partial" and auto-creates two linked Service Tickets (T-xxx for the pixels, T-xxx for the fan).

---

Then **"Inventory Locator"**:

> *"Do we have 3 Samsung 55" displays in stock, and where?"*

**What should happen:** Shows a location breakdown (NY Warehouse, WMATA closet, Barclays storage), quantities available, condition, and recommends the closest pull source.

---

# 🗺️ Gianni — Your 3 skills

| Skill | What it does |
|---|---|
| **Venue Readiness Scorer** | Gives every venue a 0-100 "ready for opening day" score based on checklist completion + walkthroughs + open tickets + parts delivered. "Which NFL venues are under 80%?" |
| **30/60/90 Checklist Builder** | Generates full pre-opening checklists from templates + historical patterns. "Build a 30/60/90 for Red Sox 2026 season" |
| **Parts Order Suggester** | Predicts parts needs based on upcoming events + historical failure rates + current stock. "What should I order this month?" |

## 🧪 Test prompts for Gianni

Pick **"Venue Readiness Scorer"**:

> *"Readiness score for Fenway Park"*

**What should happen:** Shows a score (0-100), the 4-dimension breakdown (checklist / walkthrough / tickets / parts), and specifically what's pulling the score down with recommended next actions.

---

Then try:

> *"Show me all NFL venues under 80% readiness"*

**What should happen:** Ranked list of NFL venues below the threshold with their scores and primary blockers.

---

Then **"30/60/90 Checklist Builder"**:

> *"Build a 30/60/90 checklist for Red Sox 2026 season, opening day April 10"*

**What should happen:** Generates a full ~38-item checklist grouped by stage (30-day / 60-day / 90-day), pulls venue-specific items from Fenway's history, suggests assignees based on past patterns, and creates the records in Twenty.

---

Then **"Parts Order Suggester"**:

> *"What should I order for the next 30 days?"*

**What should happen:** Analyzes upcoming events + historical failure rates + current stock, produces a risk-ranked parts order list with specific quantities, reasoning, and estimated cost.

---

# 🎁 Bonus — skills everyone can use

These were built earlier and already live in Twenty. Open the skill dropdown to see them:

- **anc-copilot** — general ANC assistant, knows all objects
- **ops-daily-digest** — morning briefing (today's events, open tickets, staffing)
- **ticket-triage** — auto-categorize service tickets
- **venue-health-report** — full report for any venue
- **event-staffing-assistant** — find unstaffed events, suggest assignments

Feel free to poke at any of them.

---

# 📝 Feedback loop

**What I need from you in the next 24 hours:**

1. **Run the test prompts above** (each takes 30 seconds)
2. **Reply with for each skill**:
   - ✅ What worked
   - ❌ What was wrong or missing
   - 💡 What you wish it did

The skills are **just markdown configuration** — I can update any of them in 60 seconds. If "Failure Pattern Detective" should also check warranty status, or "Checklist Builder" should include a specific ANC-only item — tell me and it ships tonight.

---

# 🚧 Coming next (forms)

Right now these skills work on data that's already in the CRM. **What's still missing is the intake surface** — a way for people to file new requests without a designer manually creating them.

Coming immediately after this:
- `services.anc.com/forms/design-request` — replaces the Wrike Request Form
- `services.anc.com/forms/print-request` — Britten print intake
- `services.anc.com/forms/parts-order` — Gianni's internal parts ordering

When those ship, the full flow becomes: **form submission → AI triage → structured record → chat assistants to manage it.**

---

# 💬 Questions?

Ping Ahmad on Slack. All 10 skills are live right now — start testing.

Built while migrating 23,614 Wrike tasks, 28,013 timelogs, and 41,444 Airtable records into Twenty in one all-nighter. Everything's there. Go break things. 🔨
