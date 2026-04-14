# ANC Platform — What's New

A plain-English log of what's being built on the CRM, for Alexis, Gianni, Nick, and the rest of the team.
Updated as we ship.

## How the pieces fit

- **Twenty CRM** (`abc-twenty.izcgmb.easypanel.host`) — the source of truth. Companies, venues, tasks, tickets, design/print/content requests, inventory, etc.
- **ANC Forms** — a separate app (`abc-formss.izcgmb.easypanel.host`) that renders intake forms. Shows up as the **ANC Forms** tab inside Twenty. Every form submission can write a record back into Twenty.
- **ANC Services** (`proposals.anc.com`) — the back-office app. Runs the background jobs, the proof-share client portal, Slack notifications, and cron schedules.

Most of what's in this changelog is either a new feature on one of those three, or an automation that connects them.

---

## April 14, 2026 — Proof Sharing (replaces workspace.anc.com for proofs)

### What changed
You used to save files to the FTP, open workspace.anc.com, generate a link, paste it into Wrike, and email the client. Now it's one step.

**New flow:**
1. Drop the proof file onto the design record in the CRM.
2. Click "Share with client" → client gets a clean email with a preview thumbnail and two big buttons: **Approve** / **Request Changes**.
3. You see everything in the CRM — sent, opened, responded.

### What you'll see on every design record
- **Sent:** the date the proof link went out.
- **Opened:** how many times the client clicked the link (e.g. "3×, last 1h ago") — no more "did you get a chance to look?" emails.
- **Responded:** if and when they clicked Approve or Request Changes, plus any comments they typed.

### Automatic behind the scenes
- **New version uploaded?** Old link dies automatically, client gets re-emailed with the new one. They can't accidentally approve stale work.
- **Client hasn't opened in 48 hours?** Slack pings you + a polite nudge email goes to the client. You don't have to remember.
- **Client clicks Approve?** Record status flips to Approved, a Slack alert fires in the team channel, and the responded-at timestamp is saved.
- **Client clicks Request Changes?** They type what they want, it lands as a comment on the record, status flips back so you know to revise.

### What this replaces
- The FTP "generate link" step on workspace.anc.com — for proofs only. **Large final files still go to the FTP as before.**
- Manual follow-up emails asking if the client looked at the proof.
- Manual status updates after approvals come back.

### What stays the same (for now)
- Your existing 20,000+ Wrike design records keep their old FTP links for history.
- Final-file delivery still flows through FTP.

---

## April 14, 2026 — Less typing (batch 1)

These fire silently on the ANC Forms tab in the CRM. No new buttons to learn, just fewer fields to type.

### New smart field types available in the form builder

**1. Client auto-detects from email domain**
On any email field, turn on "auto-fill client target." When the submitter types their email (e.g. `matt@mlb.com`) and tabs away, the target field fills in with "Boston Red Sox" automatically. Free-mail addresses (gmail, yahoo) don't trigger it, so nothing gets mis-tagged. They can overwrite it if the guess is wrong.

**2. Venue typeahead field**
A new field type. The submitter types two letters — "Fe…" — and gets a list of matching venues from the CRM. They pick one → the form now knows exactly which venue it is, not just a typed string.

**3. Shipping address auto-fills from the venue**
On a venue field, turn on "shipping target" and pick another field. When a venue is picked, that target field fills in with the venue's street address/city/state/zip. Saves a lot of typing for repeat locations.

**4. Asset / board picker field**
A new field type (`venue_assets`). Point it at a venue field above it on the form. Once the venue is picked, the asset picker shows every display/board we have in inventory at that venue as tap-to-select chips. No more typing "center-hung, ribbon section 4, courtside east" by hand.

### Automatic behind the scenes

**5. Content Schedule auto-dates** *(Alexis — your #1 complaint from the call)*
Status → "Scheduled to Launch" or "Live" and no start date set? → start date becomes today.
Status → "Confirmed with Client" or "Done" and no end date set? → end date becomes today.
A background job runs every 15 minutes. Only fills empty date fields — never overwrites what you've manually set.

### How to use
Nothing for the submitter to learn — fields fill themselves in as they type.
For the form builder (you/Ahmad), when editing a form's JSON schema:
- **Email field:** add `"autoFillClientTarget": "<client-field-id>"`
- **Venue field:** use `"type": "venue"` and optionally `"shippingTarget": "<shipping-field-id>"`
- **Asset picker:** use `"type": "venue_assets"` with `"venueFieldId": "<venue-field-id>"`

### Quick win demo for Alexis
Open ANC Forms tab → Design Request form → type an `@mlb.com` email → watch the client field fill on its own. Pick a venue → watch the board/section chips appear.

---

## April 14, 2026 — Design Request form is live with auto-fills

Cleaned up 6 duplicate forms that were floating around (3× Design Request, 3× Parts Order — all had zero submissions). One canonical copy of each form now.

**The Design Request form is fully switched on:**
- Email field auto-fills the Client Name from the sender's domain
- Venue field is a typeahead (type "Fen" → pick Fenway)
- New "Which boards / sections?" chip picker appears after venue is picked, pulled from the inventory we have at that venue

**Company domain coverage** — 2,990 of 3,719 companies in the CRM have a domain set (80%), so the email→client fill will work for most teams. The 729 without domains will just skip the auto-fill silently (user types the name as normal).

**Next up:** turning on the same auto-fills on Parts Order (venue → shipping address), Print Request (email → client), and CG Design Request (email → client).

---

## April 14, 2026 — NYC Airtable migration into Twenty (in progress)

Started the full migration of Nick's NYC Airtable base into the CRM. What landed so far:

| What | Count | Where it now lives in Twenty |
|---|---|---|
| NYC venues | 17 | Venues (10 matched, 7 newly created — Fairleigh Dickinson, Grand Central Madison, NBC-30 Rock, Grand Central Terminal, AT&T 3 Times Sq, JP Morgan 390 Madison, St Johns) |
| Displays | 337 | Inventory Assets (linked to venue, with make, model, orientation, resolution, IP, ownership, install phase) |
| Issues | 925 | Service Tickets (priority + open/closed + details) |
| Maintenance Events | 89 | Maintenance Logs (type, scheduled date, scope of work) |

**Wave 2 (done):** switched to direct-DB bulk load to bypass CRM rate limits (3 hours → 3 minutes). Added 3 new Twenty objects for Nick's infrastructure backbone, plus backfilled missing fields on records imported earlier.

| Object | Records |
|---|---|
| venue | 372 |
| inventoryAsset (displays) | 1,656 |
| serviceTicket (issues) | 3,900 |
| walkthroughLog | 15,465 |
| maintenanceLog | 432 |
| displayLocation (NEW) | 296 |
| rack (NEW) | 43 |
| rackDevice (NEW) | 2,827 |

**Backfilled fields** on records migrated earlier:
- Displays — photo URL, render name, physical dimensions, location code, three-letter code
- Tickets — observed state, player name, date reported, closed date
- Maintenance — escort info, techs scheduled, end time
- Walkthrough — three-letter code, locations visited, technician name

**Wave 3 (done):** WMATA shipping chain + Stations

6 more new Twenty objects: `shippingCase`, `frame`, `loadUnit`, `lcdUnit`, `station`, `rmaEvent`.

| New Object | Records | What it is |
|---|---|---|
| shippingCase | 478 | Crates that hold display frames in transit |
| frame | 907 | Individual LED frames shipped in cases |
| loadUnit | 2 | Shippable parts going out for RMA |
| lcdUnit | 1 | Bare LCD panels |
| station | 120 | WMATA metro stations |
| rmaEvent | 1 | Return shipment events |

**Also fixed:** 28,013 Designer Time Entries were showing as "Untitled" in Twenty. They now show real project names (e.g. "Indy College Basketball Events - 2026 — Apr 01, 2026 · 0.25h") by joining against the matching `designRequest` and `contentSchedule` records via their Wrike task IDs.

**Wave 4 (done):** Migration effectively complete.

Migrated the Inventory Tracking parts chain + ANC Advertising base:
- 21 Manufacturers · 9 Parts · 9 Restock Orders
- 4 Ad Campaigns · 82 Ad Deliverables · 9 Ad Channels

### Final migration totals

| Object | Records |
|---|---|
| venue | 372 |
| inventoryAsset | 1,656 |
| serviceTicket | 3,900 |
| walkthroughLog | 15,465 |
| maintenanceLog | 432 |
| displayLocation | 296 |
| rack | 43 |
| rackDevice | 2,827 |
| shippingCase | 478 |
| frame | 907 |
| station | 120 |
| manufacturer | 21 |
| part | 9 |
| restockOrder | 9 |
| adCampaign | 4 |
| adDeliverable | 82 |
| adChannel | 9 |
| **Total** | **26,630** |

---

## April 14, 2026 — Asset History Timeline

The piece that ties all the migration data together. Click any display (inventoryAsset) and see **one chronological feed** of every ticket, maintenance event, and walkthrough that's ever touched that display — unified from what used to be separate Airtable tabs.

**How it works:**
- Every display record now has a **"View History Timeline"** link at the top.
- Clicking opens a clean page showing: photo, spec row (manufacturer/model/resolution/IP), three summary counts (tickets / maintenance / walkthroughs), and a vertical timeline of every event sorted newest-first.
- Each event shows date, title, who worked on it, priority/status badges, and a 2-line excerpt of the details.

**Try it** with `Screen #5 [WST-WTC-E/W]` — 71 tickets + 6 maintenance events. Or `Main Train Hall Display 2 [PST-MOY-MCM #21.3]` — 33 tickets + 25 maintenance events + 100s of walkthroughs.

**For Nick:** this is the replacement for Airtable's "Active Issues" + "Resolved Issues" + maintenance history + walkthrough log, all merged into one view per display.

---

## April 14, 2026 — Relations wired + WMATA display names fixed

**Relations wired** — the data now behaves like a graph, not flat tables:

| From → To | Records linked |
|---|---|
| display → venue | 1,290 |
| display → display location | 376 |
| display → station (WMATA) | 1,273 |
| ticket → display | 888 |
| maintenance → display | 294 |
| maintenance → station | 109 |
| walkthrough → display location | 7,186 |
| walkthrough → venue | 5,626 |
| rack device → rack | 375 |
| rack → venue | 42 |

**Why this matters:** on a venue page you can now see every display, location, rack, and device at that venue. On a station page you see its displays and maintenance. On a display you see its tickets and walkthroughs. The data unifies — no more jumping between tabs.

**WMATA display names fixed** — 1,274 WMATA displays had imported with placeholder names like "Display rec02qy8..." because the ANC Service-WMATA Airtable base uses `Name (no alerts)` instead of `Display Name`. They now have their real names: `C13-MZ48-KID-01`, `B08-PL3-CID-02`, etc. — the names techs actually reference in the field.

---

## April 14, 2026 — Opening-Day Readiness Dashboard (Gianni)

One page that answers "is opening day going to be a disaster?" at a glance.

**URL:** `/dashboard/readiness` on anc-services.

**What it shows:**
- A card for every team with a 30/60/90 checklist
- Big number: days until that team's opening day (computed from the latest checklist item due date)
- Progress bar + % complete
- 4-count breakdown: Done / In Progress / Not Started / Overdue
- "Up next" preview showing the nearest unfinished checklist item and when it's due

**Color coding:**
- Red card if opening day is within 14 days — stop everything, this team is in crunch
- Orange if 15–45 days out — push hard
- Green if 45+ days out or already past opening

**For Gianni:** instead of clicking through each team's folder, you open one page and see every team's readiness ranked by urgency. If the Red Sox has 82% complete and 2 overdue items with 18 days out, the card catches your eye before you even scroll.

Data updates live from the Twenty CRM every time the page is opened. As checklist items flip to Done, the progress bar and count update.

**What this unlocks:**
- On the Design Request form, picking any of those 17 NYC venues now shows the actual displays at that venue in the chip picker. Alexis clicks real boards, not types them.
- Every display record in Twenty can show its full ticket/maintenance history once we wire the relation displays (coming).

---

## Coming next

### Bigger features being planned

### More auto-fills (batch 2)
- **Pre-fill from last request per client** — repeat orders clone from the client's last request; you edit only deltas.
- **Smart due-date defaults** — design = +10 business days, print = +14, parts depends on urgency.
- **Assignee round-robin** — CG requests auto-assign to the designer with the fewest open jobs.
- **Paste a client email → AI fills the whole form** — designer drops the email thread, AI extracts what they want, deadline, boards, urgency. One paste replaces most of the form.
- **Photo → asset tags** (for Nick) — snap a display, AI detects make/model/serial from the label.
- **Voice walkthrough** (for techs) — speak notes into the phone, we create the walkthrough log + any service tickets automatically.

### Bigger features being planned
- **Opening-day readiness dashboard** (for Gianni) — per team card: "Red Sox opens in 18 days · 82% of checklist done · 2 items blocked on parts order."
- **Asset history timeline** (for Nick) — click any display → full chronological stream: maintenance, issues, walkthroughs, RMAs. One click, everything.
- **External client portal** — a per-client page (Cushman, Matthew Bradley, etc.) showing their displays, ticket status, and issue counts. Replaces the Airtable share links with something 10× more polished.
- **Morning Slack digest** — every morning: "Alexis, 3 proofs awaiting client >48h · Gianni, Red Sox at 82% with 2 blockers · Nick, 5 open tickets, 1 SLA at risk."

---

## How to reach us
Questions or something feels off? Message Ahmad on Slack. Every feature here is built to save you time — if it doesn't, tell us and we'll fix it fast.
