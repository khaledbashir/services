**Subject:** Ready to retire Wrike + Airtable — proposal for the cutover

---

Hi Joe,

Over the last few sessions we've pushed the ANC Service Dashboard (services.ancsports.net) far enough that it can fully replace Wrike and Airtable for daily operations. The data migration is complete and every module the team uses is live behind your existing login. Sharing where we stand so we can plan the cutover.

**What's live today:**

- **Design Requests** — 20,188 Wrike records migrated (Creative, CG, proof links intact)
- **Time Entries** — 28,014 Wrike timelogs migrated, searchable by designer + date
- **Walkthroughs** — 15,465 historical walkthrough logs migrated; filter by venue + date works end-to-end
- **Inventory / Assets** — 1,656 assets with full Wrike-derived metadata
- **Content Schedule** — 2,817 in-venue runs with auto-stale logic for elapsed run-end-dates (Alexis's ask)
- **Print Requests (Britain workflow)** — Kanban view + CSV/XLSX export (Alexis)
- **Parts Ordering** — public form at `/forms/parts-request` + internal queue at `/parts-orders` (Gianni)
- **30/60/90 Stadium Opening Checklist** — Gianni's pre-season prep, with MLB and NHL templates seeded and bulk-clone per venue
- **Maintenance / RMA / Hours Budgets** — all Twenty-backed, with a daily 50%/75% budget alert cron firing to Slack + email
- **Client read-only portals** — per-venue signed tokens at `/portals/<token>`, auth-less, replaces Nick's Airtable view
- **Native proof pipeline** — MinIO-backed, file versioning + view-tracking, auto-fires the client-review email (replaces workspace.anc.com + FTP entirely)
- **Companies + Venues** — 3,761 companies and 375 venues populated in Twenty

**One pending item for full role-based access:** Charlie still owes us the Paychex staff list (name + email + venue linkage). Until that lands, only 3 technicians exist in Twenty and everyone else works as admin. That's not a blocker for cancelling Wrike and Airtable — but it is what's blocking per-technician venue scoping.

**Proposed next step — team walkthroughs this week:** I'd like 15 minutes each with Natalia (design), Gianni (parts + stadium checklist), Nick (assets + maintenance + client portals), Alexis (content + design + print), and Chris (ticketing + voicemail). Each lead signs off on their module, then we flip Wrike + Airtable to read-only, run one final data-parity sanity check, and archive both accounts. Best guess: a full cutover by end of next week if walkthroughs are clean.

Happy to schedule around whatever works for you.

— Ahmad
