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
