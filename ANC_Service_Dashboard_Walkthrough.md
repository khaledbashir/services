# ANC Service Dashboard — Complete Platform Walkthrough

## For Video Voiceover / Demo Script

---

## 1. LOGIN & FIRST IMPRESSION

**What to show:** Navigate to `services.anc.com` → login page

**Script:**
The Service Dashboard lives at services.anc.com. Clean login page with the ANC logo. Every user gets their own credentials — admin, manager, or technician — and each role sees a different experience tailored to what they need.

When you log in, the system knows who you are. The dashboard greets you by name: "Welcome back, Joe." Not generic. Personal.

---

## 2. DASHBOARD — THE COMMAND CENTER

**What to show:** Dashboard with all 5 stat cards, alerts, timeline, charts

**Script:**
This is the operations nerve center. Five stat cards across the top — each one clickable:

- **Today's Events** — click it, you're on the events page filtered to today
- **Staff Assigned** — how many techs are working right now
- **Open Tickets** — click to see every open support issue
- **Pending Workflows** — events where techs haven't checked in yet
- **Estimated Labor Hours** — total projected hours for the week

Below that, **alerts**. This is key — the system tells you what's wrong so you don't have to hunt for it. Red means critical: "5 events today with no staff assigned." Amber means warning: "2 techs haven't checked in and the game starts in an hour." Blue is informational: "12 events this week still need assignment."

Each alert has a "View" link that takes you directly to the problem.

On the left, **Today's Timeline** — every event happening today with color-coded workflow status. Click any event to drill in.

On the right, **Workflow Status** donut chart showing how many events are completed vs in progress vs pending. Below that, **Labor Budget** showing which staff members have the most hours this week — with progress bars.

At the bottom, **Markets This Week** — cards for each market showing event counts. Click any market to see those events.

---

## 3. EVENTS — CALENDAR & LIST VIEWS

**What to show:** Events page, toggle between calendar and list, use search, click an event

**Script:**
Events page gives you two views — Calendar and List. Toggle between them with one click.

**Calendar view** shows a weekly grid. Each event is a colored card — orange for NBA, blue for NHL, purple for college. Click any event to see details. And now, staff names show up right on the calendar card. No more clicking into each event to find out who's working.

**List view** is a table: date, time, event name, venue, league, assigned techs, and workflow status. There's a search bar — type "Celtics" and instantly filter to just Celtics games. Type "TD Garden" and see everything at that venue.

Filter buttons at the top: Today, Week, Month, All.

**Click into an event** and you get the full detail page. On the left: event info, workflow progress stepper (Check-in → Game Ready → Post-Game), and the workflow timeline showing exactly when each step happened and who did it.

On the right: **Assigned Technicians** with an "Add Technician" button. Click it and a searchable dropdown appears. Each tech in the dropdown shows their **weekly hours** — green if under 30h, amber under 40h, red over 40h. This prevents overloading anyone. Select a tech and their estimated hours auto-populate based on the league (NBA = 7.5 hours, configurable in settings).

Below that: a **Workflow Link** you can copy and send to the tech. They open it on their phone and tap through each stage. And **Quick Actions** to create a ticket or send a reminder.

---

## 4. VENUES — ASSIGNMENT TRACKING & SPECS

**What to show:** Venues list with red/green indicators, click into a venue, show all tabs

**Script:**
The Venues page shows every venue as a card with a colored bar at the top. **Green** means all events are staffed. **Red** means some events still need assignment. Gray means it's a support-only venue — no assignment required.

Each card shows: venue name, market, event count, and an assignment tracker like "4/6 assigned." Filter by Today, Week, or Month. Search by venue name or market.

**Click into a venue** and you get a tabbed layout:

**Events tab** — upcoming events with league badges, assigned techs, and workflow status. Click any event to drill in.

**Staff tab** — every technician who's been assigned to events at this venue. Avatars with initials, clickable to see their full profile.

**Specs tab** — this is the venue documentation portal. Shows installed LED displays with full specs: manufacturer, model, pixel pitch, dimensions, brightness, location zone, install date. These specs **auto-populate from the Proposal Engine** — when a proposal is signed, screens flow in automatically. No manual data entry.

**Settings tab** — two-column layout:
- **Client Portal link** — copy and share with venue contacts
- **Assignment toggle** — flip between "Required" and "Support only"
- **Slack Channel** — map a Slack channel for ticket notifications
- **Contracted Services** — toggle which services this venue is contracted for (Full Service, On-Call Support, LED Maintenance, etc.)
- **Contact Info** — primary contact name and email

---

## 5. STAFF — PROFILES & WORKLOAD

**What to show:** Staff page with card view, list view, search, click into a profile

**Script:**
Staff page gives you card view and list view. Card view shows profile photos (or colored avatar initials), name, title, role badge, active status, and contact info.

Hover over any photo and a camera icon appears — click to upload a new profile image. Photos are stored directly in the system, survive deployments.

**Download Template** button gives you a CSV with the right column headers. Fill it in with your 150 techs, click **Import**, done. Or just @Claw in Slack and paste a messy list — the AI handles parsing.

Search bar filters by name, email, city, or title. Role dropdown filters by Admin, Manager, or Technician.

**Click any staff member** and you get their full profile page:

- Header with photo, name, title, role badge, contact info, and a **completion rate ring** — percentage of assigned events where the full workflow was completed
- Four stat cards: hours this week, hours this month, all-time events, workflow breakdown (done/in progress/pending)
- **Upcoming Events** table showing every event they're assigned to with league, venue, hours, and status
- Sidebar: markets they cover, top venues they work at, recent activity (when they last checked in, submitted reports)

This is how you answer "Is this tech reliable?" in 3 seconds.

---

## 6. TICKETS — ENTERPRISE TICKETING

**What to show:** Tickets page, card/list view, create ticket, show detail page with comments and SLA

**Script:**
Tickets page — cards and list view, just like staff. Cards show a priority color strip (red for critical, amber for medium), ticket number, status badge, title, venue, category, and who it's assigned to.

**Status filter pills** at the top: Active, Open, In Progress, Resolved, All — each with a count. Click "Open" to see just open tickets.

Search across ticket titles, venues, assignees, and categories.

**Click "New Ticket"** and the form appears: title, venue, event (optional), category (hardware/software/content/operational), priority, and assignee. If you don't pick an assignee, **auto-assignment rules** kick in — hardware tickets go to Chris D, software tickets to whoever is configured.

**SLA is automatic.** When you create a ticket:
- Critical: 1 hour to respond, 4 hours to resolve
- High: 2 hours / 8 hours
- Medium: 4 hours / 24 hours
- Low: 8 hours / 72 hours

The clock starts ticking immediately.

**Click into a ticket** and you get the full detail page:

- Header with priority color strip, all badges inline, meta line showing who opened it, when, venue link
- **Comment section** with two modes: "Client-visible" (blue) and "Internal only" (amber with left border). Internal comments are never shown to clients on the portal
- **Quick Replies button** — click it and 8 pre-loaded templates appear: "Acknowledged," "Technician Dispatched," "Issue Resolved," etc. Click one and it fills the comment box. Professional responses in one click
- Sidebar: Owner card with avatar, status as clickable buttons (click Open/In Progress/Resolved/Closed to change), priority buttons, category buttons
- **SLA card** showing response deadline and resolution deadline — green if met, red if overdue
- Activity timeline showing every status change

When a ticket is resolved, the SLA card shows whether response and resolution targets were met or breached.

**Slack integration:** Every ticket created posts to the venue's Slack channel with rich formatting. Status changes post updates. Resolutions post confirmations. Real-time, zero manual steps.

---

## 7. CLIENT PORTAL — THE WOW FACTOR

**What to show:** Open a portal link, walk through all tabs

**Script:**
This is what venue contacts see. Each venue gets a unique link — no login required. The VP of Operations at TD Garden clicks their link and this is what they get:

**Service Level Banner** — a gradient blue header showing the numbers that matter: 100% coverage rate, 18 events covered, all reports filed, average resolution time. And a "Download Monthly Report" button that generates a branded PDF they can forward to their boss.

**Live Game Day View** — on game day, this section appears with a pulsing green "Live" dot. Each event shows a real-time timeline:
- 6:00 PM — John Smith checked in on site
- 6:45 PM — Game readiness confirmed
- 9:30 PM — Post-game report submitted

Like FedEx tracking, but for venue services. The client watches their event coverage unfold in real time.

**Your ANC Team** — profile photos, names, and titles of every technician assigned to upcoming events. The client sees WHO is coming to their building. Makes ANC feel premium.

**Events tab** — upcoming and recent events with expandable workflow timelines. Click any event to see the check-in/game ready/post-game steps.

**Tickets tab** — this is where the AI comes in. There's a gradient blue banner at the top: "Report an Issue." The client types in plain English: "The left LED panel on the scoreboard went dark during the third quarter." The AI:
- Categorizes it: Hardware
- Sets priority: High
- Writes a clean title: "LED panel failure — scoreboard section"
- Creates the ticket automatically

The client can also view their ticket history, see status updates, and read resolution notes. They only see external comments — internal ANC discussions are hidden.

**Services & Specs tab** — shows contracted services and installed LED displays with full specs. All auto-populated from the Proposal Engine.

**Monthly Service Report** — one click generates a branded PDF: coverage rate, workflow compliance, tickets handled, team deployed. Filename: "ANC_Service_Report_TD_Garden_Mar_2026.pdf". This is the document that justifies the ANC contract at budget review time.

---

## 8. REPORTS — PRINTABLE OPS REPORTS

**What to show:** Reports page, toggle week/month, export PDF

**Script:**
Reports page gives managers and admins a comprehensive operations view. Toggle between Week and Month.

Three big headline numbers: Coverage Rate, Workflow Completion, Total Labor Hours.

Below that, **SLA metrics**: total tickets, SLA response compliance %, SLA resolution compliance %, average response time. Green if targets met, red if breached.

Two-column tables: Coverage by Market (events/covered/hours per market) and Events by League.

Top Staff by Hours — who's working the most, with completion counts.

Top Venues — busiest venues with coverage ratios.

**Export PDF** button generates a branded report via Browserless (headless Chrome, not browser print). ANC gradient header with brand slashes, clean tables, footer with www.anc.com. Professional enough to hand to a board member.

---

## 9. SETTINGS — LEAGUE HOURS & AUTOMATIONS

**What to show:** Settings page with league hours and cron jobs

**Script:**
Settings is admin-only. Two sections:

**League Settings** — set estimated hours per game type. NBA = 7.5, NHL = 7.0, MLB = 8.0, and so on. These auto-populate when techs are assigned to events. Click a number, change it, hit Save.

**Automations** — Slack bot scheduled tasks:
- Daily Event Digest at 8 AM
- Escalation Alerts every 30 minutes
- Post-Game Summaries every hour
- Weekly Report on Monday mornings

Toggle them on/off, create new ones, delete old ones.

---

## 10. INVENTORY

**What to show:** Inventory page with items, low stock filter

**Script:**
Inventory management for spare parts and equipment across all venues. Add items with venue, name, SKU, quantity, and threshold.

Click any quantity number to edit it inline — type the new number, hit Enter. Low stock items are highlighted in red with a "Low Stock" badge. Filter to see just low-stock items with one click.

Search by item name, venue, or SKU. Filter by venue dropdown.

---

## 11. AI SLACK BOT (CLAW)

**What to show:** Slack channel, ask Claw questions

**Script:**
Claw lives in the #external--ai-services Slack channel. Ask it anything:

- "What games are tonight?" → queries the live database, lists events with venues and times
- "Who's working at TD Garden?" → shows assigned techs
- "Any open tickets?" → lists tickets by priority
- "How many events this week?" → event count with coverage stats

It also runs automated tasks: daily game slate at 8 AM, escalation alerts every 30 minutes (silent when everything's fine), post-game summaries, and weekly ops reports.

Staff import: paste a messy list of names and emails into Slack, Claw parses it and imports them all.

---

## 12. PROPOSAL ENGINE INTEGRATION

**What to show:** Explain the webhook flow

**Script:**
When a proposal is signed in the Proposal Engine, a webhook fires to the Service Dashboard. This automatically:
- Creates the venue (or links to existing)
- Imports installed screen specifications (manufacturer, model, pixel pitch, dimensions)
- Generates a portal token for the client portal
- Enables "Full Service" by default
- Posts a "Deal Won!" notification to Slack

Sales closes a deal → operations is immediately set up. No manual handoff, no copy-paste, no "hey can you add this venue to the system."

---

## 13. MOBILE EXPERIENCE

**What to show:** Resize browser or show on phone

**Script:**
Everything works on mobile. The sidebar collapses into a hamburger menu on screens under 1024px. Content takes full width. Grids reflow from 3-4 columns on desktop to 1-2 on mobile.

Techs open their workflow link on their phone — tap Check In, tap Game Ready, fill out the post-game report. Three taps and they're done.

Venue contacts open their portal on their phone — same clean experience, all tabs work.

---

## 14. SECURITY & PERMISSIONS

**What to show:** Sidebar changing per role

**Script:**
Three roles, hierarchical:

**Admin** sees everything: Dashboard, Events, Venues, Tickets, Reports, Staff, Inventory, Settings, Client Portals.

**Manager** sees: Dashboard, Events, Venues, Tickets, Reports, Client Portals. Can assign staff and manage tickets. Cannot access Staff management or Settings.

**Technician** sees: Dashboard, Events, Venues. Can view assigned events and submit workflows. Cannot assign staff, manage tickets, or access admin areas.

Every API endpoint checks roles server-side. Frontend hides unauthorized pages. Even if someone crafts a direct URL, the backend rejects it.

Client portal is completely separate — no auth required but token-scoped per venue. Clients only see their venue's data and external comments.

---

## KEY NUMBERS

- 43+ venues across 15 markets
- 150+ field technicians
- 250+ events loaded and syncing
- 12 installed screen specs imported from Proposal Engine
- 8 canned response templates
- 4 SLA tiers (Critical → Low)
- 5 dashboard alert types
- 3 roles (Admin/Manager/Technician)
- 0 per-user pricing
- Auto-deploys on every git push

---

## TECH STACK

- Next.js 14 + React + Tailwind CSS
- PostgreSQL 17
- Docker on dedicated VPS via EasyPanel
- Google Calendar API (15-min sync)
- Slack Bot (OpenClaw + MiniMax M2.7)
- Browserless (headless Chrome for PDFs)
- Claude API / MiniMax for AI ticket parsing
- JWT auth with bcrypt password hashing
- GitHub auto-deploy pipeline
