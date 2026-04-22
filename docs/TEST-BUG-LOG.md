# Test Bug Log — 2026-04-22 QA round

Bugs found during the interactive test walkthrough. Fix after the whole round.

## Sidebar navigation
- [ ] **Inventory is miscategorized under "System"** — should move to Operations or Service Ops (it's operational, not sysadmin)
- [ ] **WIP badges still showing** on Service Ops + Creative sections — these modules are shipped now, drop the badges
- [ ] **No visible row count on list pages** — e.g. `/maintenance` doesn't show "432 logs" header. Inventory shows it, others don't. Consistency check across all 12 list pages.

## Maintenance
- [x] **Issue column blank** — fixed in `237b074` (fell back to `name` / `issueSummary` instead of unpopulated `issue` field)

---

(appending as Ahmad reports more)

## Walkthroughs
- [ ] **Page crashes (TypeError: cannot read properties of null reading 'replace')** at `app/walkthroughs/page.tsx:191` — code calls `w.result.replace('_', ' ')` but Twenty returns some rows with `result` = null. Needs `w.result?.replace(...) ?? 'unknown'`.
