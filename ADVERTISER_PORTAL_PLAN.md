# ANC Advertiser Portal — Product Plan

## The Business Context

ANC makes money three ways:
1. **Install projects** — design + install LED displays, sound, broadcast systems ($5M-$50M per venue)
2. **Operations & support** — annual contracts for on-site techs, maintenance, 24/7 support (what the current dashboard manages)
3. **Media & sponsorship** — selling ad space on the screens ANC installed across 43+ venues

Stream #3 is the highest margin. The hardware is already paid for — every ad dollar is mostly profit. ANC's media team (led by John Obropta) sells packages to brands like Coca-Cola, Nike, local dealerships, etc. Revenue is split with venues.

**The problem:** Right now, ANC sells ad space with PDFs, PowerPoints, and handshake deals. Brands have zero visibility into what they're actually getting. No proof of delivery, no impression data, no self-service portal. ANC can't command premium pricing because they can't prove premium value.

**The opportunity:** Build an advertiser-facing portal that gives brands real-time visibility into their campaigns across ANC's venue network. This turns ANC from "we sell ad space" into "we run a measurable ad platform." That's a completely different price conversation.

---

## The Upsell Strategy

This is NOT part of the original $6,000 dashboard contract. It's a **separate product** pitched as:

> "You hired us to build your operations dashboard. Now that it's live — look what else is possible with the same infrastructure. What if your media team could give Coca-Cola a login where they see exactly what they're getting?"

- New SOW, new budget
- No changes to existing dashboard or venue portals
- Built on the same codebase, same auth patterns, same infrastructure
- Demonstrates platform thinking, not just one-off project work

---

## What Advertisers Want to See

### Campaign Dashboard (Home)
- Active campaigns across all venues
- Total impressions delivered this period
- Number of venues running their content
- Number of events where their ads appeared
- Contract value vs delivered value
- Next renewal date

### Venue Breakdown
- List of all venues where their ads are running
- Per-venue metrics: events, estimated impressions, screen placements
- Which specific screens show their content (ribbon, scoreboard, concourse, courtside)
- Venue attendance data (feeds into impression calculation)

### Creative Assets
- What's currently running (images, videos, animations)
- Which creative is assigned to which venue/screen type
- Upload new creative (pending ANC approval)
- Asset specifications per screen type (resolution, format, duration)

### Proof of Delivery
- Screenshots/recordings of their ads actually on screens during live events
- Timestamped confirmation: "Your ad ran on Fenway Park ribbon board during Red Sox vs Yankees, 7:05 PM, attendance: 37,305"
- Monthly delivery report (PDF export)

### Analytics & ROI
- Impressions over time (chart)
- Cost per impression vs industry benchmarks
- Venue-by-venue performance comparison
- Peak vs off-peak performance
- League breakdown (NBA vs NHL vs MLB reach)

### Contract & Billing
- Current contract terms
- Renewal timeline
- Invoice history
- Add-on opportunities (more venues, more screen types, premium placements)

---

## Technical Architecture

### Auth & Access
- Same pattern as venue portals: token-based access via `/sponsor/[token]`
- Each sponsor gets a unique portal link
- No shared login with venue portals or internal dashboard
- Sponsors table: `id, name, contact_name, contact_email, portal_token, logo_url, contract_start, contract_end`

### Data Model

```
sponsors
├── id, name, logo_url, portal_token
├── contact_name, contact_email
├── contract_start, contract_end, contract_value
└── is_active

sponsor_placements (which screens at which venues)
├── id, sponsor_id, venue_id
├── screen_types[] (ribbon, scoreboard, courtside, concourse, fascia)
├── start_date, end_date
└── is_active

sponsor_impressions (calculated per event)
├── id, sponsor_id, venue_id, event_id
├── screen_type, estimated_impressions
├── attendance, duration_seconds
└── recorded_at

sponsor_assets (creative files)
├── id, sponsor_id, name, file_url
├── asset_type (image, video, animation)
├── resolution, format, duration_seconds
├── status (pending, approved, active, archived)
└── uploaded_at
```

### Impression Calculation
Impressions aren't pixel-tracked like web ads. They're estimated:
- `impressions = attendance × screen_visibility_factor × rotation_share × duration_factor`
- Screen visibility factor: scoreboard (0.95), ribbon (0.80), courtside (0.70), concourse (0.40)
- Rotation share: if 4 sponsors share a ribbon, each gets 0.25
- Duration factor: 30s spot vs full-game placement

This is industry standard for venue advertising — no one expects pixel-level tracking.

### API Routes
```
/api/sponsor/[token]           — sponsor overview + stats
/api/sponsor/[token]/venues    — venue breakdown with per-venue metrics
/api/sponsor/[token]/assets    — creative assets CRUD
/api/sponsor/[token]/report    — monthly delivery report PDF
```

### Portal Routes
```
/sponsor/[token]               — main sponsor portal page
```

---

## What Makes This Valuable to ANC

### For the Media Sales Team
- **Sell harder**: "We don't just put your logo up — we give you a dashboard proving it ran"
- **Premium pricing**: Measurable = more valuable. Brands pay more when they can see ROI
- **Faster renewals**: Sponsor sees their data, renewal is a 5-minute conversation
- **Upsell**: "Your concourse ads got 40% fewer impressions than ribbon — want to upgrade?"

### For Venue Relationships
- Venues get better sponsors because ANC can prove performance
- Revenue share becomes transparent — venues see what's being sold on their screens
- Venues can show their own stakeholders "here's the revenue our ANC displays generate"

### For ANC Leadership
- Platform play: ANC isn't just an installer anymore, they're an ad tech company
- Data moat: once sponsors are using the portal, switching to a competitor means losing their analytics history
- Scalable: adding a new venue to the platform adds it to every sponsor's dashboard automatically

---

## Competitive Advantage

No one in the venue display industry offers this. Not Daktronics, not Musco, not anyone. The closest thing is digital out-of-home (DOOH) platforms like Vistar Media, but those focus on billboards and transit, not live sports venues.

ANC would be the first to offer a self-service sponsor portal with per-venue, per-event impression tracking. That's a category-defining feature.

---

## Build Phases

### Phase 1 — Demo / POC ($X,XXX)
- Static sponsor portal page with mock Coca-Cola data
- Dashboard with charts (impressions, venue breakdown, campaign status)
- PDF export of monthly delivery report
- Goal: show Joe, Joe shows John Obropta (media team), they see the vision

### Phase 2 — MVP ($X,XXX)
- Database tables (sponsors, placements, impressions, assets)
- Real sponsor portal with token auth
- Admin UI to manage sponsors and placements
- Impression calculation engine (attendance × factors)
- Creative asset upload with approval workflow

### Phase 3 — Production ($X,XXX)
- Integration with event data (auto-calculate impressions per event)
- Automated monthly reports
- Sponsor-facing AI chat (trained on their campaign data)
- Multi-sponsor management for ANC media team
- Analytics dashboards with export

---

## Relationship to Existing System

The advertiser portal shares infrastructure with what's already built:
- Same Next.js codebase
- Same PostgreSQL database
- Same EasyPanel deployment
- Same token-based portal auth pattern
- Same AI chat widget pattern (AnythingLLM workspace per sponsor)
- Same PDF report generation

It does NOT touch:
- The internal dashboard (Joe's team)
- The venue portals (client-facing)
- Any existing tables or APIs

It's a parallel product built on the same platform.

---

## Key Questions for Joe

1. How does the media team currently report to sponsors? What do they send them?
2. Is impression data tracked anywhere today, or is it all estimates?
3. Who on the media team would use this? John Obropta directly?
4. What's the average sponsor contract value? (Helps size the ROI argument)
5. How many active sponsors does ANC have across all venues?
6. Is there appetite for a self-service asset upload, or does ANC want to control all creative?
7. Would ANC want sponsors to see venue-level data, or only aggregate?

---

## The One-Liner

**"ANC installed the screens. ANC runs the operations. Now ANC owns the ad platform too."**
