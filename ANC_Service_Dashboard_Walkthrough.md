# ANC Service Dashboard — Complete Platform Walkthrough

## For Video Voiceover / Demo Script

---

## 1. LOGIN & FIRST IMPRESSION

**What to show:** Navigate to the login page, show the ANC logo, type credentials, land on dashboard

**Script:**
The Service Dashboard lives at services.anc.com. Clean, professional login page with the ANC logo. Every user gets their own credentials — admin, manager, or technician — and each role gets a completely different experience tailored to what they need.

Log in and the dashboard greets you by name: "Welcome back, Joe." Not generic. Personal. The system knows who you are and shows you exactly what matters to your role.

---

## 2. DASHBOARD — THE COMMAND CENTER

**What to show:** Dashboard with all 5 stat cards, alerts section, timeline, donut chart, labor budget, market cards. Click a stat card to show navigation. Show an alert and click "View."

**Script:**
This is the operations nerve center. Five stat cards across the top — and every single one is clickable:

- **Today's Events** — click it, you're looking at today's schedule
- **Staff Assigned** — how many techs are deployed right now
- **Open Tickets** — one click to see every open support issue
- **Pending Workflows** — events where nobody has checked in yet
- **Estimated Labor Hours** — total projected hours for the week, pulled from league settings

Below that — and this is the key — **real-time alerts**. The system doesn't wait for you to find problems. It tells you. Red means critical: "5 events today with no staff assigned." Amber means warning: "2 techs haven't checked in and the game starts in an hour." Blue is informational: "12 events this week still need assignment." Each alert has a "View" link that takes you directly to the problem. One click, you're fixing it.

On the left, **Today's Timeline** — a live feed of every event happening today, color-coded by workflow status. Click any event to drill into the details.

On the right, **Workflow Status** — a donut chart showing completed vs in progress vs pending across all events. Below that, the **Labor Budget** panel — which staff members have the most hours this week, with visual progress bars. You can see at a glance if someone is overloaded.

At the bottom, **Markets This Week** — cards for every active market showing event counts. Click any market card and you jump straight to those events.

---

## 3. EVENTS — CALENDAR & LIST VIEWS

**What to show:** Events page. Toggle between calendar and list. Use the search bar. Click an event. Show the assignment dropdown with weekly hours.

**Script:**
The Events page gives you two ways to see your schedule — Calendar and List. Toggle between them with one click.

**Calendar view** shows a weekly grid. Each event is a colored card — orange for NBA, blue for NHL, purple for college basketball. And here's what Joe asked for: you can see the assigned staff names right on each event card. No more clicking into every event just to find out who's working.

**List view** is a compact table: date, time, event name, venue, league, assigned techs, and workflow status. There's a search bar at the top — type "Celtics" and instantly filter to just Celtics games. Type "TD Garden" and see everything happening at that venue. Type a tech's name and see all their assignments.

Filter buttons: Today, Week, Month, All.

Now click into an event. You get the full detail page. On the left: event info, and the workflow progress stepper — Check-in, Game Ready, Post-Game Report — with a timeline showing exactly when each step happened and who did it.

On the right: **Assigned Technicians**. Click "Add Technician" and here's where it gets smart. A searchable dropdown appears, and next to each tech's name you see their **weekly hours**. Green if they're under 30 hours, amber under 40, red over 40. You instantly know who has capacity and who's overloaded. Select someone and their estimated hours auto-populate based on the league — NBA games are 7.5 hours by default, NHL is 7 hours, all configurable.

Below that: a **Workflow Link** you can copy and send to the tech. They open it on their phone and tap through each stage. And **Quick Actions** — create a ticket or send a reminder with one click.

---

## 4. VENUES — ASSIGNMENT TRACKING & SPECS

**What to show:** Venues list page with red/green bars, filter toggles, search. Click into a venue. Walk through Events, Staff, Specs, and Settings tabs.

**Script:**
The Venues page shows all 43 venues as cards. And immediately you can see which ones need attention. **Green bar** at the top means all events are staffed. **Red bar** means some events still need assignment — and it tells you exactly how many, like "4 of 6 assigned." Gray means it's a support-only venue that doesn't require dedicated staffing.

Filter by Today, Week, or Month. Search by venue name or market. Joe asked about seeing event counts by different time periods — done.

Click into a venue and you get a tabbed layout. This keeps things clean — no more scrolling through a wall of information.

**Events tab** — upcoming events with league badges, time, assigned techs, and workflow status. Every row is clickable.

**Staff tab** — every technician who's been assigned to events at this venue. Profile avatars, clickable to see their full profile page.

**Specs tab** — this is the venue documentation portal. It shows every installed LED display with full technical specifications: manufacturer, model number, pixel pitch, dimensions, brightness, location zone like "Center Court Main Scoreboard" or "North Side Fascia." Here's the magic: these specs **auto-populate from the Proposal Engine**. When a deal is signed, the display data flows in automatically. No manual entry. No copy-paste. As of now, we have 12 screens synced across Crypto.com Arena and Gainbridge Fieldhouse.

**Settings tab** — two-column layout with everything you need to configure:
- **Client Portal link** — a unique URL for this venue's contacts, with a copy button
- **Assignment toggle** — flip between "Required" and "Support Only"
- **Slack Channel** — map a Slack channel so ticket notifications go to the right place
- **Contracted Services** — toggle which services this venue is contracted for: Full Service, On-Call Support, LED Maintenance, Content Management, Hardware Support
- **Contact Info** — primary contact name and email

---

## 5. STAFF — PROFILES, CARDS & WORKLOAD

**What to show:** Staff page. Show card view with photos. Toggle to list view. Use search and role filter. Click into a staff member's profile page.

**Script:**
Staff page — and this is one Joe's team loved. You get two views: **Card view** and **List view**, just like a modern HR system.

Card view shows each person with their profile photo — or colored initials if no photo yet. Name, title, role badge, active status, and contact details. Hover over any photo and a camera icon appears — click to upload a new image right there.

**Download Template** button gives you a CSV with the exact column headers the system expects. Fill it in with your 150 techs, upload it with **Import**, and they're all in the system. Or — and this is something the team loves — just message @Claw in Slack and paste a messy list. Names, emails, whatever format. The AI parses it and imports everyone.

Search bar filters by name, email, city, or title. Role dropdown to filter by Admin, Manager, or Technician.

Now click any staff member. This is the detail page — and it answers the question every manager has: "Is this tech reliable?"

At the top: profile photo, name, title, role badge, contact info, and a **completion rate ring** — the percentage of their assigned events where the full three-stage workflow was completed. Green if above 80%, amber above 50%, red below.

Four stat cards: hours this week, hours this month, all-time events, and workflow breakdown showing done, in progress, and pending counts.

Below that: **Upcoming Events** table — every event they're assigned to, with league, venue, estimated hours, and status. Click any event to drill in.

On the sidebar: which **markets** they cover with event counts, their **top venues**, and **recent activity** — when they last checked in, confirmed game ready, or submitted a report.

---

## 6. TICKETS — ENTERPRISE TICKETING WITH SLA

**What to show:** Tickets page with card view. Show status filter pills. Create a ticket. Show the detail page with comments, SLA card, canned responses, and clickable status buttons.

**Script:**
The ticketing system is built to replace Salesforce for ANC's workflow. Card view and list view, consistent with every other page.

Each ticket card has a **priority color strip** at the top — red for critical, orange for high, amber for medium. You see the ticket number, status badge, title, venue, category, and who it's assigned to, all at a glance.

**Status filter pills** across the top: Active, Open, In Progress, Resolved, All — each showing a count. One click to filter. Search bar covers ticket titles, venues, assignees, and categories.

Create a new ticket — title, venue, event, category, priority, assignee. But here's what makes this enterprise-grade: if you don't pick an assignee, **auto-assignment rules** kick in. Hardware tickets automatically go to Chris D. Software tickets go to whoever is configured. The most specific rule wins — you can set rules by category, by venue, or both.

**SLA is automatic.** The moment a ticket is created, the clock starts:
- Critical: 1 hour to respond, 4 hours to resolve
- High: 2 hours to respond, 8 hours to resolve
- Medium: 4 hours / 24 hours
- Low: 8 hours / 72 hours

Click into a ticket and you see everything. The header shows all badges inline. Below that, the **comment section** — and this is important for Chris D's workflow. Two modes: **Client-visible** in blue and **Internal only** in amber with a left border. Internal comments are never visible to clients on the portal. Toggle between them with one click.

**Quick Replies** button — click it and 8 pre-loaded templates appear: "We've received your report and a technician has been notified." "A technician has been assigned and is en route." "The reported issue has been resolved." One click, professional response, done.

On the sidebar: **Owner card** with avatar. **Status** as clickable buttons — don't waste time with dropdowns, just click Open, In Progress, Resolved, or Closed. Same for **Priority** and **Category**.

**SLA card** shows two deadlines: response and resolution. Green badge if met, red if overdue. When a ticket is resolved, you can see whether both SLA targets were hit.

Every ticket action fires a **Slack notification** to the venue's channel. Ticket created? Posted. Status changed? Posted. Resolved? Posted with a confirmation. Real-time, zero manual steps.

---

## 7. CLIENT PORTAL — THE WOW FACTOR

**What to show:** Open a portal link in a fresh browser/incognito. Walk through the overview slowly. Show the live game day view. Show the AI ticket creation. Download the monthly report PDF.

**Script:**
Now we step outside the admin dashboard. This is what your venue contacts see — and this is the thing that makes ANC look like a completely different level of service provider.

Each venue gets a unique link. No login required — the VP of Operations at TD Garden clicks their link and they're in.

First thing they see: **Service Level Banner** — a gradient blue header showing the numbers that matter. 100% coverage rate. 18 events covered. All reports filed. Average resolution time. These are the metrics that justify the ANC contract at budget review time. And right there, a **"Download Monthly Report"** button that generates a branded PDF they can forward to their boss or their board.

Below that — and this is the hero on game day — the **Live Game Day View**. A green pulsing dot with "Live" next to it. Each event shows a real-time timeline:

*6:00 PM — John Smith checked in on site*
*6:45 PM — Game readiness confirmed*
*9:30 PM — Post-game report submitted — all systems operational*

Like FedEx tracking, but for venue services. The client doesn't have to call and ask "Is someone there yet?" They can watch it happen.

**Your ANC Team** — profile photos, names, and titles of every technician assigned to upcoming events at this venue. The client sees who is physically coming to their building. Makes ANC feel premium, not anonymous. Not "a tech will be there" — "John Smith, Senior Field Technician, will be there."

**Events tab** — upcoming and recent events with expandable workflow timelines. Click any event and see the full check-in → game ready → post-game flow.

**Tickets tab** — and here's where the AI comes in. A gradient blue banner at the top says "Report an Issue." The venue contact types in plain English: *"The left LED panel on the scoreboard went dark during the third quarter."*

The AI automatically:
- Categorizes it: Hardware
- Sets priority: High
- Writes a clean title: "LED panel failure — scoreboard section"
- Creates the ticket

No forms, no dropdowns, no "what category is this?" Just describe the problem like you're texting a colleague, and the system handles the rest. The ticket shows up in ANC's ticketing system with full SLA tracking, auto-assigned to the right person, and a Slack notification in the venue channel.

Clients can also view their ticket history, see status updates, and read resolution notes. They only see external comments — internal ANC discussions stay private.

**Services & Specs tab** — contracted services and installed LED displays with full technical specifications. Auto-populated from the Proposal Engine.

The **Monthly Service Report** — click download, get a branded PDF. ANC header with brand slashes, four big stat cards (coverage rate, workflow completion, events covered, tickets), service summary with green/amber badges, the team that worked the venue that month, and a professional footer. Filename: "ANC_Service_Report_TD_Garden_Mar_2026.pdf."

This is the document that gets forwarded in the "Re: Annual Vendor Review" email thread. And it makes ANC look untouchable.

---

## 8. REPORTS — C-LEVEL OPS REPORTS

**What to show:** Reports page. Toggle week/month. Show the SLA metrics row. Click Export PDF and open it.

**Script:**
The Reports page is built for managers and executives. Toggle between Week and Month at the top.

Three headline metrics: Coverage Rate, Workflow Completion, Total Labor Hours.

Below that, the **SLA metrics row** — new addition: total tickets, SLA response compliance percentage, SLA resolution compliance percentage, and average response time. Green if targets are met, red if breached. This is how you prove your ticket system is working.

Two-column breakdown: Coverage by Market (with percentages, not just fractions) and Events by League. Then Top Staff by Hours and Top Venues by Event Volume.

Click **Export PDF** and it generates a proper executive report via Browserless — not a browser print hack. This report has:
- An **executive summary paragraph**: "This week ANC covered 7 of 9 events across 4 markets with 2 technicians..."
- **Key metrics with trend arrows** comparing to the previous period — coverage up 5%? Green arrow. Down 3%? Red arrow
- **Progress bars** under each metric
- **Highlights**: "100% coverage achieved", "Zero SLA breaches"
- **Attention Required**: "3 events went unstaffed", "Workflow completion below 80% target"
- **Action Items** in amber callout boxes: "5 events next week need staff assignment"
- Market breakdown, staff rankings, venue coverage

The kind of report you hand to a board member and they understand in 30 seconds what's going on.

---

## 9. SETTINGS — LEAGUE HOURS & AUTOMATIONS

**What to show:** Settings page. Edit a league hour value. Show the automations list.

**Script:**
Settings is admin-only. Two sections.

**League Settings** — set estimated hours per game type. NBA is 7.5 hours, NHL is 7.0, MLB is 8.0, and so on. Change any value, click Save. These hours auto-populate every time you assign a tech to an event. The labor budget tracking on the dashboard and reports uses these numbers.

**Automations** — the Slack bot's scheduled tasks. Daily Event Digest at 8 AM, Escalation Alerts every 30 minutes, Post-Game Summaries every hour, Weekly Report on Monday mornings. Toggle them on and off. Create new ones. Delete old ones.

---

## 10. INVENTORY

**What to show:** Inventory page. Add an item. Click a quantity to edit inline. Filter by low stock.

**Script:**
Inventory management for spare parts, replacement modules, and equipment across all 43 venues. Add items with venue, name, SKU, quantity, and low-stock threshold.

Click any quantity number to edit it inline — type the new number, hit Enter. No edit button, no modal, no friction.

Low stock items are highlighted in red with a "Low Stock" badge. Click the **Low Stock** filter button to see just the items that need restocking. Search by item name, venue, or SKU. Filter by venue dropdown.

---

## 11. AI SLACK BOT — CLAW

**What to show:** Slack channel with Claw. Ask a few questions. Show a staff import.

**Script:**
Claw lives in the #external--ai-services Slack channel. It's not a chatbot that gives generic answers — it queries the live database in real time.

Ask it: *"What games are tonight?"* — it pulls today's events with venues, times, and assigned techs.

*"Who's working at TD Garden?"* — shows the assigned technicians.

*"Any open tickets?"* — lists tickets by priority with venue names.

*"How many events this week?"* — gives you the count with coverage stats.

It also runs automated tasks on a schedule: daily game slate at 8 AM, escalation alerts every 30 minutes — but only when something needs attention, stays silent otherwise — post-game summaries, and weekly ops reports.

And for staff management: paste a messy list of names, emails, and phone numbers into Slack. Claw parses it — any format — and imports them all into the system with default passwords.

---

## 12. PROPOSAL ENGINE INTEGRATION

**What to show:** Explain the flow with a diagram or animation

**Script:**
This is where the two ANC platforms connect. The Proposal Engine handles sales — proposals, spec sheets, pricing, contracts. The Service Dashboard handles operations — events, staff, workflows, tickets.

When a proposal moves to Signed or Closed in the Proposal Engine, a webhook fires automatically. The Service Dashboard receives it and:
- Creates the venue — or links to an existing one
- Imports all installed screen specifications — manufacturer, model, pixel pitch, dimensions
- Generates a portal token so the client can access their portal immediately
- Enables Full Service by default
- Posts a "Deal Won!" notification to Slack with the venue and client details

Sales closes a deal → operations is immediately set up. No manual handoff. No "hey can you add this venue." No copy-pasting specifications between systems.

---

## 13. MOBILE EXPERIENCE

**What to show:** Resize the browser to mobile width. Show the hamburger menu. Navigate between pages. Show the workflow page on a phone-sized screen.

**Script:**
Everything works on mobile. The sidebar collapses into a hamburger menu on screens under 1024 pixels — that covers phones, tablets, and smaller laptops.

Content reflows: grids go from 3-4 columns on desktop to 1-2 on mobile. Cards stack vertically. Tables scroll horizontally. No pinching, no broken layouts.

For technicians, the workflow is phone-first. They get a link, open it on their phone, and tap through three stages: Check In, Game Ready, Post-Game Report. Three taps and they're done for the night.

The client portal works on mobile too — venue contacts can check event status, submit tickets, and download reports from their phone.

---

## 14. SECURITY & PERMISSIONS

**What to show:** Show the sidebar changing for different roles. Show an API rejection if someone tries to access admin routes.

**Script:**
Three roles, hierarchical — each one inherits from the one below:

**Admin** sees everything: Dashboard, Events, Venues, Tickets, Reports, Staff, Inventory, Settings, Client Portals.

**Manager** sees: Dashboard, Events, Venues, Tickets, Reports, Client Portals. They can assign staff to events and manage tickets. They cannot access Staff management, Inventory, or Settings.

**Technician** sees: Dashboard, Events, Venues. They can view their assigned events and submit workflow steps. They cannot assign staff, manage tickets, or access any admin areas.

Every API endpoint checks roles server-side — it's not just hiding buttons. Even if someone crafts a direct URL or API call, the backend returns a 403 Forbidden. Creating staff? Admin only. Changing settings? Admin only. Assigning techs? Manager or above.

The client portal is completely separate — no authentication required, but scoped by a unique token per venue. Clients only see their own venue's data. Internal comments are never exposed. The two worlds — ANC internal and client-facing — never cross.

---

## 15. CLIENT PORTAL MANAGEMENT

**What to show:** Client Portals page in the admin dashboard. Copy a link. Preview a portal.

**Script:**
The Client Portals page gives admins a central view of all 43 venue portal links in one place. A table showing venue name, market, primary contact, and the portal link.

Two actions per venue: **Copy Link** — copies the unique URL to clipboard, ready to paste into an email. **Preview** — opens the portal in a new tab so you can see what the client sees.

Search by venue name, market, or contact name. This is how Joe's team distributes portal access — find the venue, copy the link, send it to the contact. Done.

---

## KEY NUMBERS

- 43+ venues across 15 markets nationwide
- 150+ field technicians managed
- 250+ events loaded and auto-syncing
- 12 installed screen specs synced from Proposal Engine
- 8 canned response templates for professional ticket replies
- 4 SLA tiers with automated deadline tracking
- 5 real-time dashboard alert types
- 3 roles with full backend enforcement
- AI-powered ticket creation from natural language
- Branded PDF reports generated server-side
- Zero per-user pricing
- Auto-deploys on every git push

---

## TECH STACK

- **Frontend:** Next.js 14 + React + Tailwind CSS
- **Backend:** Next.js API routes + PostgreSQL 17
- **Hosting:** Dedicated VPS + Docker + EasyPanel
- **Calendar:** Google Calendar API (15-minute sync cycle)
- **AI:** MiniMax M2.7 for ticket parsing, Claude for Slack bot
- **PDF:** Browserless (headless Chrome) for branded report generation
- **Slack:** Real-time bot with OpenClaw framework
- **Auth:** JWT + bcrypt + role-based access control
- **Deployment:** GitHub → EasyPanel auto-build pipeline
