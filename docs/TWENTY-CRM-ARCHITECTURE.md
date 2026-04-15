# ANC Twenty CRM — Unified Platform Architecture

> **Status:** Phase 1–4 Complete (schema, views, sync, integrations, Wrike cutover — 2026-04-08)
> **Author:** Ahmad Basheer
> **Date:** 2026-04-06
> **Audience:** Ahmad (architect), Joe (ops review), Nick & Gianni (Wrike replacement validation)
> **Instance:** https://abc-twenty.izcgmb.easypanel.host

---

## 1. Executive Summary

Twenty CRM replaces **Salesforce** (expiring), **Wrike** (project/task management), and **Airtable** (structured operational data) as a single self-hosted platform. It sits at the center of ANC's three existing systems:

```
┌──────────────────┐     ┌─────────────────────┐     ┌──────────────────────┐
│  Proposal Engine  │────▶│     TWENTY CRM       │◀────│  Service Dashboard   │
│  (rag2)           │     │  (single source of   │     │  (anc-services)      │
│  Natalia + Matt   │     │   truth)             │     │  Joe + Nick + Chris  │
└──────────────────┘     │                     │     └──────────────────────┘
                          │  Companies          │
                          │  People             │               ┌────────────┐
                          │  Opportunities      │◀──────────────│   Slack    │
                          │  Venues             │──────────────▶│  (#ops)    │
                          │  Services ← NEW     │               └────────────┘
                          │  Events             │
                          │  Tickets            │
                          │  Tasks ← ENHANCED   │
                          │  Staff/Technicians  │
                          └─────────────────────┘
```

**What's already in Twenty today:**
- 4 custom objects: Venue, Technician, VenueEvent, ServiceTicket
- 13 custom fields on Companies, 5 on People, 3 on Opportunities
- Cron sync every 15 min from Services Dashboard (events + tickets)
- ~53 real companies, ~49 venues, ~25 technicians

**What this document adds:**
- 1 new custom object: **Service** (contracted services per venue)
- Enhanced **Tasks** object to replace Wrike
- Views for every team role
- Integration map between all systems
- Full field specifications

---

## 2. Data Model Overview

```
Company (team/org/partner)
  │
  ├── 1:N ── Venues (physical locations)
  │            ├── 1:N ── Services (contracted service lines)
  │            ├── 1:N ── Events (games/concerts)
  │            └── 1:N ── Tickets (service issues)
  │
  ├── 1:N ── People (contacts at that company)
  │
  ├── 1:N ── Opportunities (deals/proposals)
  │
  └── 1:N ── Tasks (work items — replaces Wrike)

Technician (ANC field staff)
  ├── assigned to Events
  ├── assigned to Venues (home venue)
  └── assigned to Tasks

Service (contracted service line)
  ├── belongs to Venue
  └── linked to Company (via venue)
```

---

## 3. Object Definitions

### 3.1 Company (Standard Object — EXISTS)

**Purpose:** Parent entity for all client relationships. Teams, venues (as business entities), manufacturers, subcontractors.

**Metadata ID:** `ccd95b3f-4a9a-443c-b8f2-01bff6c479ab`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Built-in | Company/org name |
| Domain | `domainName` | LINKS | Built-in | Website URL |
| Address | `address` | ADDRESS | Built-in | Full address object |
| Employees | `employees` | NUMBER | Built-in | Employee count |
| Venue Type | `venueType` | SELECT | Exists | `STADIUM`, `ARENA`, `CONVENTION_CENTER`, `UNIVERSITY`, `RETAIL`, `TRANSIT`, `CORPORATE` |
| League/Org | `league` | SELECT | Exists | `NFL`, `NBA`, `MLB`, `MLS`, `NHL`, `NCAA`, `INDEPENDENT` |
| Region | `region` | SELECT | Exists | `NORTHEAST`, `SOUTHEAST`, `MIDWEST`, `SOUTHWEST`, `WEST`, `INTERNATIONAL` |
| Service Status | `serviceStatus` | SELECT | Exists | `PROSPECT`, `ACTIVE_INSTALL`, `UNDER_WARRANTY`, `POST_WARRANTY`, `RECURRING`, `CHURNED` |
| Revenue Type | `revenueType` | SELECT | Exists | `TECHNOLOGY`, `VENUE_SERVICES`, `MEDIA_SPONSORSHIP`, `HYBRID` |
| Total LED SqFt | `totalLedSqFt` | SELECT | Exists | `SMALL`, `MEDIUM`, `LARGE`, `MASSIVE` |
| Display Count | `displayCount` | SELECT | Exists | `ONE_TO_FIVE`, `SIX_TO_TWENTY`, `TWENTYONE_TO_FIFTY`, `FIFTY_PLUS` |
| Venue Name | `venueName` | TEXT | Exists | Physical venue name (e.g. "Bank of America Stadium") |
| Capacity | `capacity` | NUMBER | Exists | Seating capacity |
| Partner Type | `partnerType` | SELECT | Exists | `CLIENT`, `MANUFACTURER`, `SUBCONTRACTOR`, `CONSULTANT` |
| Contract Start | `contractStart` | DATE | Exists | ISO date |
| Contract End | `contractEnd` | DATE | Exists | ISO date |
| Annual Contract Value | `annualContractValue` | CURRENCY | Exists | `{amountMicros, currencyCode}` |
| **Account Owner** | **`accountOwnerId`** | **RELATION → Person** | **NEW** | ANC rep who owns this account (Jireh, Kirsten, etc.) |

**Relationships:**
- `Company → Venues` (1:N via `companyId` on Venue)
- `Company → People` (1:N via `companyId` on Person)
- `Company → Opportunities` (1:N via `companyId` on Opportunity)

---

### 3.2 Person (Standard Object — EXISTS)

**Purpose:** Contacts at client companies + ANC internal team members.

**Metadata ID:** `fb3ffcb0-ba14-4825-9cd6-1f797ebe417a`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | OBJECT | Built-in | `{firstName, lastName}` |
| Email | `emails` | OBJECT | Built-in | `{primaryEmail}` |
| Phone | `phones` | OBJECT | Built-in | `{primaryPhoneNumber}` |
| Company | `companyId` | UUID | Built-in | Links to parent company |
| Decision Role | `decisionRole` | SELECT | Exists | `ROLE_OWNER`, `ROLE_AD`, `ROLE_VPOPS`, `ROLE_FACILITIES`, `ROLE_AVDIRECTOR`, `ROLE_ESTIMATOR` |
| Department | `department` | SELECT | Exists | `OPERATIONS`, `AV_TECHNOLOGY`, `FACILITIES`, `EXECUTIVE`, `FINANCE`, `PROCUREMENT` |
| Preferred Contact | `preferredContact` | SELECT | Exists | `EMAIL`, `PHONE`, `SLACK`, `TEXT` |
| Relationship Strength | `relationshipStrength` | SELECT | Exists | `COLD`, `WARM`, `HOT`, `CHAMPION` |
| Last Contact Date | `lastContactDate` | DATE | Exists | ISO date |
| **Is ANC Staff** | **`isAncStaff`** | **BOOLEAN** | **NEW** | Distinguishes ANC team from external contacts |
| **Slack User ID** | **`slackUserId`** | **TEXT** | **NEW** | For Slack notification integrations |

**Key contacts to ensure are populated:**
- Joe Occhipinti (COO), Nicholas Delia (Ops), Chris DeBernardis (Support), Gianni Strano (Ops), Alexis Ventarola (Services), Charlie (Support)

---

### 3.3 Venue (Custom Object — EXISTS)

**Purpose:** Physical locations where ANC has LED equipment installed and/or provides services.

**Metadata ID:** `136fe14f-02d3-4a6f-bf4a-81abaf6f77f1`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Exists | Venue name (e.g. "Prudential Center") |
| Category | `venueCategory` | SELECT | Exists | `CAT_SPORTS`, `CAT_FACILITY`, `CAT_OOH` |
| Market | `market` | TEXT | Exists | Metro area |
| Contact Name | `contactName` | TEXT | Exists | Primary venue contact name |
| Contact Email | `contactEmail` | TEXT | Exists | Venue contact email |
| Services ID | `servicesId` | TEXT | Exists | UUID linking to Services Dashboard |
| Company | `companyId` | UUID | Exists | Links to parent company |
| **Venue Manager** | **`venueManagerId`** | **RELATION → Person** | **NEW** | ANC venue manager (per Joe's request) |
| **Lead Field Rep** | **`leadFieldRepId`** | **RELATION → Person** | **NEW** | Lead field representative (per Joe's request) |
| **Contracted Services Active** | **`hasContractedServices`** | **BOOLEAN** | **NEW** | Master toggle — does this venue have active contracted services? |
| **Address** | **`venueAddress`** | **ADDRESS** | **NEW** | Physical venue address |
| **Time Zone** | **`timeZone`** | **TEXT** | **NEW** | IANA timezone (e.g. "America/New_York") — needed for event scheduling |
| **Status** | **`venueStatus`** | **SELECT** | **NEW** | `ACTIVE`, `INACTIVE`, `DEACTIVATED` — supports venue deactivation (per April 1 meeting) |

**Relationships:**
- `Venue → Company` (N:1 via `companyId`)
- `Venue → Services` (1:N — new)
- `Venue → Events` (1:N via venue name match or venueId)
- `Venue → Tickets` (1:N via venue name match or venueId)

---

### 3.4 Opportunity (Standard Object — EXISTS)

**Purpose:** Deals, proposals, bids. Tracks the full sales lifecycle from RFP to win/loss.

**Metadata ID:** `c779922d-cf25-4a5e-9382-23eb1c02199e`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Built-in | Deal name |
| Stage | `stage` | SELECT | Built-in | `NEW`, `SCREENING`, `MEETING`, `PROPOSAL`, `CUSTOMER` |
| Company | `companyId` | UUID | Built-in | Links to parent company |
| Close Date | `closeDate` | DATE | Built-in | Expected close |
| Amount | `amount` | CURRENCY | Built-in | Deal value |
| Deal Size | `dealSize` | SELECT | Exists | `DEAL_UNDER100K`, `DEAL_100KTO500K`, `DEAL_500KTO2M`, `DEAL_OVER2M` |
| Project Type | `projectType` | SELECT | Exists | `NEW_BUILD`, `RENOVATION`, `EXPANSION`, `REPLACEMENT`, `SERVICE` |
| Bid Status | `bidStatus` | SELECT | Exists | `RFP_RECEIVED`, `SCOPING`, `BID_SUBMITTED`, `SHORTLISTED`, `WON`, `LOST`, `NO_BID` |
| **RFP Source** | **`rfpSource`** | **SELECT** | **NEW** | `BUILDING_CONNECTED`, `DIRECT`, `REFERRAL`, `COLD_OUTREACH` |
| **Proposal URL** | **`proposalUrl`** | **TEXT** | **NEW** | Link to generated proposal in Proposal Engine |
| **LED SqFt** | **`ledSqFt`** | **NUMBER** | **NEW** | Total display square footage |
| **Manufacturer** | **`manufacturer`** | **SELECT** | **NEW** | `LG`, `YAHAM`, `ABSEN`, `DAKTRONICS`, `SAMSUNG`, `OTHER` |
| **Assigned Estimator** | **`assignedEstimatorId`** | **RELATION → Person** | **NEW** | Who's scoping this deal |
| **Win/Loss Reason** | **`winLossReason`** | **TEXT** | **NEW** | Why we won or lost — critical for pipeline analysis |
| **Venue** | **`venueId`** | **RELATION → Venue** | **NEW** | Which venue this deal is for |

**Pipeline Stages (use built-in `stage` + custom `bidStatus` together):**

| Bid Status | Stage | Owner |
|------------|-------|-------|
| `RFP_RECEIVED` | `NEW` | Natalia |
| `SCOPING` | `SCREENING` | Matt/Jeremy |
| `BID_SUBMITTED` | `PROPOSAL` | Natalia |
| `SHORTLISTED` | `PROPOSAL` | Leadership |
| `WON` | `CUSTOMER` | Transitions to Services |
| `LOST` / `NO_BID` | (closed) | — |

---

### 3.5 Service (Custom Object — NEW)

**Purpose:** Contracted service lines per venue. This is the "contracted services toggle" Joe requested — each venue can have multiple service types, each independently toggled on/off.

**Endpoint (after creation):** `/rest/services`

| Field | API Name | Type | Values/Notes |
|-------|----------|------|--------------|
| Name | `name` | TEXT | Auto-generated: "{Venue Name} — {Service Type}" |
| Service Type | `serviceType` | SELECT | `LED_MAINTENANCE`, `CONTENT_MANAGEMENT`, `STAFFING`, `WARRANTY`, `INSTALLATION`, `CONSULTING`, `REMOTE_MONITORING` |
| Status | `serviceStatus` | SELECT | `ACTIVE`, `PAUSED`, `EXPIRED`, `PENDING` |
| Venue | `venueId` | RELATION → Venue | Which venue this service covers |
| Company | `companyId` | RELATION → Company | Redundant link for easier querying |
| Start Date | `startDate` | DATE | Service contract start |
| End Date | `endDate` | DATE | Service contract end |
| Monthly Value | `monthlyValue` | CURRENCY | Monthly recurring revenue |
| Requires Staffing | `requiresStaffing` | BOOLEAN | Does this service require tech assignments at events? |
| Notes | `serviceNotes` | TEXT | Scope notes, SLA details |

**Why this object exists:**
- Joe said some venues are "warranty-only" — they don't need staff assignments. Others need full staffing.
- The `requiresStaffing` flag determines whether events at this venue show up in the staffing workflow.
- When ANY service is active + `requiresStaffing = true` → events at this venue auto-pull and require tech assignments.
- When ALL services are warranty/paused → events still show but no staffing required.

**Relationships:**
- `Service → Venue` (N:1)
- `Service → Company` (N:1)

---

### 3.6 VenueEvent (Custom Object — EXISTS)

**Purpose:** Games, concerts, and other events at venues. Currently synced from Services Dashboard every 15 minutes.

**Metadata ID:** `25371460-c4b4-42f8-80f1-78f14a895818`
**Endpoint:** `/rest/venueEvents`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Exists | Event name |
| Event Date | `eventDate` | TEXT | Exists | Date string |
| Venue Name | `venueName` | TEXT | Exists | Venue where event occurs |
| League | `league` | SELECT | Exists | `LEAGUE_NFL`, etc. |
| Workflow Status | `workflowStatus` | SELECT | Exists | `STATUS_PENDING`, `STATUS_CONFIRMED`, `STATUS_STAFFED`, `STATUS_COMPLETED`, `STATUS_CANCELLED` |
| Assigned Techs | `assignedTechs` | TEXT | Exists | Comma-separated tech names |
| Summary | `summary` | TEXT | Exists | Event notes |
| Services ID | `servicesId` | TEXT | Exists | UUID linking to Services Dashboard |
| **Venue** | **`venueId`** | **RELATION → Venue** | **NEW** | Proper relation instead of text match |
| **Event Type** | **`eventType`** | **SELECT** | **NEW** | `GAME`, `CONCERT`, `CORPORATE`, `OTHER` |
| **Staffing Required** | **`staffingRequired`** | **BOOLEAN** | **NEW** | Derived from venue's contracted services |

**Note:** The `venueName` text field provides backward compatibility with the existing cron sync. The new `venueId` relation enables proper joins and filtering.

---

### 3.7 ServiceTicket (Custom Object — EXISTS)

**Purpose:** Support tickets for hardware, software, content, and operational issues at venues.

**Metadata ID:** `c91ebea2-7dc1-4498-bd54-ebfe89e38c41`
**Endpoint:** `/rest/serviceTickets`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Exists | Ticket title |
| Ticket Number | `ticketNumber` | TEXT | Exists | e.g. "T-258" |
| Ticket Status | `ticketStatus` | SELECT | Exists | `STATUS_NEW`, `STATUS_OPEN`, `STATUS_PROGRESS`, `STATUS_RESOLVED`, `STATUS_CLOSED` |
| Priority | `priority` | SELECT | Exists | `PRI_LOW`, `PRI_MEDIUM`, `PRI_HIGH` |
| Category | `category` | TEXT | Exists | "hardware", "software", "general" |
| Venue Name | `venueName` | TEXT | Exists | Venue where issue is |
| Assigned To | `assignedTo` | TEXT | Exists | Tech assigned |
| Services ID | `servicesId` | TEXT | Exists | UUID linking to Services Dashboard |
| **Venue** | **`venueId`** | **RELATION → Venue** | **NEW** | Proper relation |
| **Reported By** | **`reportedById`** | **RELATION → Person** | **NEW** | Who reported the issue |
| **SLA Due Date** | **`slaDueDate`** | **DATE** | **NEW** | When ticket must be resolved |
| **Resolution Notes** | **`resolutionNotes`** | **TEXT** | **NEW** | How the issue was resolved |
| **Source** | **`ticketSource`** | **SELECT** | **NEW** | `DASHBOARD`, `EMAIL`, `SLACK`, `AI_DETECTED`, `PHONE` |

---

### 3.8 Task (Standard Object — EXISTS, ENHANCED for Wrike Replacement)

**Purpose:** Operational work items. This is the primary Wrike replacement — tasks represent any assignable work: project milestones, follow-ups, maintenance work, administrative items.

**Metadata ID:** `6e513ef8-368d-4efe-a628-6de4b9de28e4`

Twenty's built-in Task object has: title, body, dueAt, status, assignee, taskTargets (links to any object).

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Title | `title` | TEXT | Built-in | Task name |
| Body | `body` | RICH_TEXT | Built-in | Description/details |
| Due Date | `dueAt` | DATE | Built-in | Deadline |
| Status | `status` | SELECT | Built-in | `TODO`, `IN_PROGRESS`, `DONE` |
| Assignee | `assigneeId` | RELATION → WorkspaceMember | Built-in | Who's responsible |
| Task Targets | `taskTargets` | RELATION | Built-in | Links to Company, Person, Opportunity, etc. |
| **Task Type** | **`taskType`** | **SELECT** | **NEW** | `PROJECT`, `MAINTENANCE`, `FOLLOW_UP`, `ADMINISTRATIVE`, `INSTALLATION`, `INSPECTION` |
| **Priority** | **`taskPriority`** | **SELECT** | **NEW** | `URGENT`, `HIGH`, `MEDIUM`, `LOW` |
| **Venue** | **`taskVenueId`** | **RELATION → Venue** | **NEW** | Which venue this task relates to |
| **Category** | **`taskCategory`** | **SELECT** | **NEW** | `HARDWARE`, `SOFTWARE`, `CONTENT`, `STAFFING`, `LOGISTICS`, `ADMIN`, `SALES` |
| **Start Date** | **`startDate`** | **DATE** | **NEW** | When work should begin |
| **Estimated Hours** | **`estimatedHours`** | **NUMBER** | **NEW** | Time estimate for planning |
| **Actual Hours** | **`actualHours`** | **NUMBER** | **NEW** | Time spent (entered by assignee) |

**Why this replaces Wrike:**
- Nick and Gianni currently use Wrike for task assignments, status tracking, and project management
- Twenty's Tasks + kanban views + filtering by assignee/venue/priority/due date covers the same ground
- The `taskTargets` built-in relation means any task can link to a venue, company, person, or opportunity
- Custom fields add the categorization and time tracking Wrike provides

**Task Status Workflow:**
```
TODO → IN_PROGRESS → DONE
                   ↘ BLOCKED (if we add this status)
```

---

### 3.9 Technician (Custom Object — EXISTS)

**Purpose:** ANC field technicians, managers, and admin staff who work at venues.

**Metadata ID:** `2b49694c-f341-4992-9675-a1f3b8e1e898`
**Endpoint:** `/rest/technicians`

| Field | API Name | Type | Status | Values/Notes |
|-------|----------|------|--------|--------------|
| Name | `name` | TEXT | Exists | Full name |
| Staff Role | `staffRole` | SELECT | Exists | `ROLE_TECH`, `ROLE_MANAGER`, `ROLE_ADMIN` |
| Title | `title` | TEXT | Exists | Job title |
| City | `city` | TEXT | Exists | Home city |
| Phone | `phone` | TEXT | Exists | Phone number |
| Email | `email` | TEXT | Exists | Email address |
| Services ID | `servicesId` | TEXT | Exists | UUID linking to Services Dashboard |
| **Home Venue** | **`homeVenueId`** | **RELATION → Venue** | **NEW** | Primary venue assignment |
| **Region** | **`techRegion`** | **SELECT** | **NEW** | `NORTHEAST`, `SOUTHEAST`, `MIDWEST`, `SOUTHWEST`, `WEST` |
| **Availability Status** | **`availabilityStatus`** | **SELECT** | **NEW** | `AVAILABLE`, `ASSIGNED`, `UNAVAILABLE`, `ON_LEAVE` |
| **Certifications** | **`certifications`** | **TEXT** | **NEW** | Comma-separated certs (e.g. "Novastar, Absen, OSHA") |

**Staff-to-Venue linking (per Joe's request from April 1):**
The import format Joe wants: `VENUE – MANAGER – LEAD FIELD REP – STAFF`
- This maps to: Venue.`venueManagerId`, Venue.`leadFieldRepId`, and Technician.`homeVenueId`
- A bulk import script will parse the spreadsheet and create these relationships

---

## 4. Relationship Map

```
┌─────────────┐
│   Company    │
│  (Account)   │
└──────┬───┬──┘
       │   │
       │   ├────────────── 1:N ── People (contacts)
       │   │
       │   ├────────────── 1:N ── Opportunities (deals)
       │   │                        │
       │   │                        └── N:1 → Venue (which venue the deal is for)
       │   │
       │   └────────────── 1:N ── Tasks (company-level work items)
       │
       ├── 1:N ── Venues
       │            │
       │            ├── 1:N ── Services (contracted service lines)
       │            │
       │            ├── 1:N ── Events (games/concerts)
       │            │            │
       │            │            └── N:N ── Technicians (assigned staff)
       │            │
       │            ├── 1:N ── Tickets (service issues)
       │            │
       │            ├── 1:N ── Tasks (venue-level work items)
       │            │
       │            ├── N:1 ── Person (Venue Manager)
       │            │
       │            └── N:1 ── Person (Lead Field Rep)
       │
       └── accountOwnerId → Person (ANC account rep)

Technician
  ├── homeVenueId → Venue (primary assignment)
  └── assigned to Events (via assignedTechs field or join table)
```

---

## 5. Views Configuration

### 5.1 Jireh / Leadership — Pipeline & Revenue

| View Name | Object | Type | Filter | Sort | Purpose |
|-----------|--------|------|--------|------|---------|
| **Active Pipeline** | Opportunities | Kanban (by `bidStatus`) | `bidStatus NOT IN (WON, LOST, NO_BID)` | `closeDate ASC` | All active deals by stage |
| **Won This Quarter** | Opportunities | Table | `bidStatus = WON` AND `closeDate >= quarter start` | `amount DESC` | Revenue tracking |
| **Expiring Contracts** | Companies | Table | `contractEnd <= 90 days from now` | `contractEnd ASC` | Renewal alerts |
| **Revenue by Region** | Companies | Table | `serviceStatus IN (ACTIVE_INSTALL, RECURRING)` | Group by `region` | Geographic revenue distribution |
| **Account Overview** | Companies | Table | `partnerType = CLIENT` | `annualContractValue DESC` | All clients ranked by value |

### 5.2 Natalia — Proposals & Deals

| View Name | Object | Type | Filter | Sort | Purpose |
|-----------|--------|------|--------|------|---------|
| **My Active Bids** | Opportunities | Kanban (by `bidStatus`) | `bidStatus IN (RFP_RECEIVED, SCOPING, BID_SUBMITTED, SHORTLISTED)` | `closeDate ASC` | Natalia's working pipeline |
| **Needs Proposal** | Opportunities | Table | `bidStatus = SCOPING` AND `proposalUrl IS NULL` | `closeDate ASC` | Deals waiting for proposal generation |
| **NFL Deals** | Opportunities | Table | Filter by company league = NFL | `amount DESC` | Segment by league |
| **Lost Deals** | Opportunities | Table | `bidStatus = LOST` | `closeDate DESC` | Win/loss analysis |

### 5.3 Joe / Ops — Venue Operations

| View Name | Object | Type | Filter | Sort | Purpose |
|-----------|--------|------|--------|------|---------|
| **All Venues** | Venues | Table | `venueStatus = ACTIVE` | `name ASC` | Master venue list |
| **Venues by Market** | Venues | Table | — | Group by `market` | Geographic view |
| **Active Services** | Services | Table | `serviceStatus = ACTIVE` | Group by `venueId` | What we're delivering where |
| **Upcoming Events** | VenueEvents | Table | `eventDate >= today` AND `workflowStatus != STATUS_CANCELLED` | `eventDate ASC` | Next events needing attention |
| **Open Tickets** | ServiceTickets | Kanban (by `ticketStatus`) | `ticketStatus NOT IN (STATUS_RESOLVED, STATUS_CLOSED)` | `priority DESC` | Active issues |
| **Staff by Venue** | Technicians | Table | — | Group by `homeVenueId` | Who's assigned where |

### 5.4 Nick & Gianni — Task Board (Wrike Replacement)

| View Name | Object | Type | Filter | Sort | Purpose |
|-----------|--------|------|--------|------|---------|
| **My Tasks** | Tasks | Kanban (by `status`) | `assigneeId = me` | `dueAt ASC` | Personal work board |
| **All Tasks** | Tasks | Kanban (by `status`) | — | `taskPriority DESC, dueAt ASC` | Team task board |
| **By Venue** | Tasks | Table | — | Group by `taskVenueId` | What work at which venue |
| **By Assignee** | Tasks | Table | — | Group by `assigneeId` | Who's doing what |
| **Overdue** | Tasks | Table | `dueAt < today` AND `status != DONE` | `dueAt ASC` | Overdue items — flag these |
| **This Week** | Tasks | Table | `dueAt >= Monday` AND `dueAt <= Friday` | `taskPriority DESC` | Current week workload |
| **By Category** | Tasks | Table | — | Group by `taskCategory` | Hardware vs software vs staffing work |

### 5.5 Chris / Support — Tickets

| View Name | Object | Type | Filter | Sort | Purpose |
|-----------|--------|------|--------|------|---------|
| **Ticket Board** | ServiceTickets | Kanban (by `ticketStatus`) | — | `priority DESC` | All tickets by status |
| **High Priority** | ServiceTickets | Table | `priority = PRI_HIGH` AND `ticketStatus != STATUS_CLOSED` | `createdAt ASC` | Critical issues |
| **By Venue** | ServiceTickets | Table | — | Group by `venueName` | Issue concentration |
| **SLA At Risk** | ServiceTickets | Table | `slaDueDate <= today + 24h` AND `ticketStatus NOT IN (RESOLVED, CLOSED)` | `slaDueDate ASC` | About to breach SLA |

---

## 6. Integration Architecture

### 6.1 Proposal Engine → Twenty (Write)

**Trigger:** RFP analyzed OR proposal generated in Proposal Engine
**Direction:** Proposal Engine writes to Twenty
**Method:** REST API calls from rag2 backend

```
Proposal Engine                          Twenty CRM
─────────────────                        ──────────
RFP Uploaded + Analyzed         ──POST──▶ Create/Update Opportunity
                                          - name, dealSize, projectType
                                          - bidStatus = SCOPING
                                          - ledSqFt, manufacturer
                                          - companyId (match or create)
                                          - venueId (match or create)

Proposal Generated              ──PATCH──▶ Update Opportunity
                                          - proposalUrl = link to PDF
                                          - bidStatus = BID_SUBMITTED
                                          - amount = calculated value

Deal Won (webhook exists)       ──PATCH──▶ Update Opportunity
                                          - bidStatus = WON
                                          - Create Service records
                                          - Update Company.serviceStatus
```

### 6.2 Service Dashboard → Twenty (Write)

**Trigger:** Cron sync every 15 minutes (already running)
**Direction:** Services Dashboard writes to Twenty
**Method:** REST API from cron script

```
Service Dashboard                        Twenty CRM
──────────────────                       ──────────
New Event Created               ──POST──▶ Create VenueEvent
Event Updated (staffing, etc)   ──PATCH──▶ Update VenueEvent
Ticket Created                  ──POST──▶ Create ServiceTicket
Ticket Updated                  ──PATCH──▶ Update ServiceTicket
Staff Imported                  ──POST──▶ Create/Update Technician
```

**Already working.** The existing cron sync handles events and tickets. Enhancements needed:
- Add `venueId` relation (currently uses `venueName` text match)
- Sync new fields (`eventType`, `staffingRequired`, `ticketSource`)

### 6.3 Service Dashboard ← Twenty (Read)

**Trigger:** Dashboard page load / API call
**Direction:** Dashboard reads from Twenty
**Method:** REST API queries from Next.js API routes

```
Service Dashboard                        Twenty CRM
──────────────────                       ──────────
Venue list page                 ──GET───▶ /rest/venues?filter=...
Venue detail                    ──GET───▶ /rest/services?filter=venueId[eq]:...
Staff assignments               ──GET───▶ /rest/technicians?filter=homeVenueId[eq]:...
Company info                    ──GET───▶ /rest/companies/{id}
Contact info                    ──GET───▶ /rest/people?filter=companyId[eq]:...
```

**Not yet implemented.** Currently the Dashboard has its own Postgres DB. The migration path:
1. Phase 1: Dashboard continues using its own DB, syncs TO Twenty
2. Phase 2: Dashboard reads FROM Twenty for venue/company/staff data
3. Phase 3: Twenty becomes the single source of truth; Dashboard DB only stores session/workflow state

### 6.4 Twenty → Slack (Notifications)

**Trigger:** Twenty Workflow automations
**Direction:** Twenty triggers, Slack receives
**Method:** Twenty Webhooks → OpenClaw/Slack bot

| Event | Slack Channel | Message |
|-------|---------------|---------|
| Opportunity.bidStatus → WON | #wins | "Deal won: {name} — ${amount}" |
| Task.status → TODO (new task created) | #ops | "New task: {title} assigned to {assignee}" |
| Task.dueAt passed + status != DONE | #ops | "Overdue: {title} was due {dueAt}" |
| ServiceTicket.priority = PRI_HIGH | #account-{venue} | "High priority ticket: {name}" |
| Service.endDate within 90 days | #ops | "Contract expiring: {venue} — {serviceType}" |

**Implementation:** Twenty has built-in Workflows (`/rest/metadata/objects` shows workflow-related objects). Configure workflows to send webhooks to OpenClaw, which posts to Slack.

### 6.5 Integration Summary Table

| Source | Target | Direction | Method | Trigger | Status |
|--------|--------|-----------|--------|---------|--------|
| Proposal Engine | Twenty | Write | REST API | RFP analysis, proposal gen | **Design only** |
| Service Dashboard | Twenty | Write | REST API (cron) | Every 15 min | **Running** (events + tickets) |
| Service Dashboard | Twenty | Read | REST API | Page load | **Design only** |
| Twenty | Slack | Write | Webhook → OpenClaw | Workflow triggers | **Design only** |
| Twenty | Service Dashboard | Write | Webhook | Deal won | **Exists** (won-proposal webhook) |

---

## 7. New Objects to Create

### 7.1 Service Object — Creation Plan

```bash
# Step 1: Create the Service custom object
POST /metadata
mutation {
  createOneObject(input: {
    object: {
      nameSingular: "service"
      namePlural: "services"
      labelSingular: "Service"
      labelPlural: "Services"
      icon: "IconTool"
      description: "Contracted service lines per venue"
      isLabelIdentifier: false
    }
  }) { id }
}

# Step 2: Create fields on the Service object
# - serviceType (SELECT)
# - serviceStatus (SELECT)
# - startDate (DATE)
# - endDate (DATE)
# - monthlyValue (CURRENCY)
# - requiresStaffing (BOOLEAN)
# - serviceNotes (TEXT)

# Step 3: Create relations
# - venueId (RELATION → Venue, MANY_TO_ONE)
# - companyId (RELATION → Company, MANY_TO_ONE)
```

### 7.2 New Fields on Existing Objects — Creation Plan

| Object | Field | Type | Priority |
|--------|-------|------|----------|
| Company | `accountOwnerId` | RELATION → Person | Medium |
| Person | `isAncStaff` | BOOLEAN | High |
| Person | `slackUserId` | TEXT | Medium |
| Venue | `venueManagerId` | RELATION → Person | High (Joe requested) |
| Venue | `leadFieldRepId` | RELATION → Person | High (Joe requested) |
| Venue | `hasContractedServices` | BOOLEAN | High |
| Venue | `venueAddress` | ADDRESS | Medium |
| Venue | `timeZone` | TEXT | Medium |
| Venue | `venueStatus` | SELECT | High |
| Opportunity | `rfpSource` | SELECT | Medium |
| Opportunity | `proposalUrl` | TEXT | Medium |
| Opportunity | `ledSqFt` | NUMBER | Medium |
| Opportunity | `manufacturer` | SELECT | Medium |
| Opportunity | `assignedEstimatorId` | RELATION → Person | Medium |
| Opportunity | `winLossReason` | TEXT | Low |
| Opportunity | `venueId` | RELATION → Venue | High |
| VenueEvent | `venueId` | RELATION → Venue | High |
| VenueEvent | `eventType` | SELECT | Medium |
| VenueEvent | `staffingRequired` | BOOLEAN | Medium |
| ServiceTicket | `venueId` | RELATION → Venue | High |
| ServiceTicket | `reportedById` | RELATION → Person | Low |
| ServiceTicket | `slaDueDate` | DATE | Medium |
| ServiceTicket | `resolutionNotes` | TEXT | Low |
| ServiceTicket | `ticketSource` | SELECT | Medium |
| Task | `taskType` | SELECT | High |
| Task | `taskPriority` | SELECT | High |
| Task | `taskVenueId` | RELATION → Venue | High |
| Task | `taskCategory` | SELECT | High |
| Task | `startDate` | DATE | Medium |
| Task | `estimatedHours` | NUMBER | Low |
| Task | `actualHours` | NUMBER | Low |
| Technician | `homeVenueId` | RELATION → Venue | High |
| Technician | `techRegion` | SELECT | Medium |
| Technician | `availabilityStatus` | SELECT | Medium |
| Technician | `certifications` | TEXT | Low |

---

## 8. Permissions Model

Twenty supports workspace members with roles. ANC needs three tiers (per April 1 decision):

| Role | Twenty Role | Access |
|------|-------------|--------|
| **Admin** | Admin | Full CRUD on all objects. Manage workspace settings, custom objects, fields. Joe, Ahmad. |
| **Manager** | Member | CRUD on Tasks, Events, Tickets. Assign staff to events. Read Companies, Venues, Opportunities. Nick, Gianni, Chris, Alexis. |
| **Technician** | Guest (or limited Member) | Read-only on assigned Events. Submit workflow forms. Cannot see pipeline, deals, or financial data. Field techs. |

**Note:** Twenty's RBAC is workspace-level, not object-level (as of current version). For true object-level permissions (hiding Opportunities from techs), the Service Dashboard acts as the access layer — techs use the Dashboard with role-based UI, not Twenty directly.

**Who uses what:**

| Person | Primary Tool | Twenty Access |
|--------|-------------|---------------|
| Joe (COO) | Twenty + Dashboard | Admin — sees everything |
| Jireh (Sales) | Twenty | Admin — manages pipeline, companies |
| Natalia (Proposals) | Proposal Engine + Twenty | Member — manages opportunities |
| Nick/Gianni (Ops) | Twenty (replaces Wrike) | Member — manages tasks, events |
| Chris (Support) | Dashboard + Twenty | Member — manages tickets |
| Field Techs | Dashboard only (mobile) | No direct Twenty access |
| Venue Contacts | Client Portal (future) | No Twenty access |

---

## 9. Migration Path

### Phase 1: Schema Setup (this sprint)
1. Create Service custom object with all fields
2. Add new fields to existing objects (prioritize High items)
3. Create all views listed in Section 5
4. Populate missing People records (Joe, Nick, Chris, Gianni, Alexis, Charlie)

### Phase 2: Data Enrichment (after Nick & Gianni confirm workflows)
1. Import staff-to-venue assignments from their spreadsheet
2. Create Service records for each venue (from Alexis's contracted services list)
3. Set up Venue Manager and Lead Field Rep assignments
4. Backfill Opportunity records from historical proposals

### Phase 3: Integration Wiring
1. Update cron sync to include new fields (venueId relations, eventType, ticketSource)
2. Build Proposal Engine → Twenty integration (auto-create Opportunities)
3. Build Twenty → Slack webhook workflows
4. Start reading venue/company data from Twenty in Dashboard

### Phase 4: Wrike Cutover
1. Import existing Wrike tasks into Twenty Tasks (with proper categorization)
2. Train Nick & Gianni on Twenty task views
3. Run both systems in parallel for 2 weeks
4. Deprecate Wrike

---

## 10. Platform Limitations & Mitigations

Issues discovered from Twenty CRM API research (April 2026):

| Limitation | Impact on ANC | Mitigation |
|-----------|---------------|------------|
| **RBAC is immature** — all workspace users currently have equal CRUD rights. No object-level or field-level permissions yet. | Joe wants 3 permission levels (Admin/Manager/Tech). Techs shouldn't see pipeline/financials. | **Field techs never log into Twenty directly.** They use the Service Dashboard, which enforces role-based UI. Managers/admins use Twenty. This sidesteps the RBAC gap entirely. |
| **Webhooks send ALL events** — no per-event filtering. Every create/update/delete on every object goes to one URL. | Our webhook handler will get a firehose of events. | Filter in the handler. OpenClaw receives all webhooks, routes based on `event` field (e.g. only act on `opportunity.updated` where bidStatus changed to WON). Low cost since ANC volume is modest (~50 users, not thousands). |
| **Rate limit: 100 requests/minute** | Tight for bulk imports (staff list, historical deals). Not an issue for normal operations. | Use batch endpoints (60 records per request). For imports, throttle with 1-second delays. Normal CRUD will never approach 100/min. |
| **Many-to-many relations are experimental** (Lab feature) | Event ↔ Technician assignment is logically M:N. | Keep the current `assignedTechs` text field on Events. The Service Dashboard manages the actual assignment logic and syncs a comma-separated list to Twenty. If M:N goes stable, migrate to a proper join. |
| **Email/calendar sync only works on standard objects** (People, Companies, Opportunities) | Custom objects (Venues, Events, Tickets) won't get email threading. | Not a problem — email threading is handled by the Service Dashboard's ticket system and Slack integration. Twenty is the data store, not the communication layer. |
| **REST metadata API is read-only** | Can't create objects/fields via REST. | Use GraphQL metadata endpoint (`/metadata`) for all schema mutations. Already documented in our skill file. |

---

## 11. Open Questions (for Nick & Gianni)

1. **Task categories:** Are the categories (`HARDWARE`, `SOFTWARE`, `CONTENT`, `STAFFING`, `LOGISTICS`, `ADMIN`, `SALES`) sufficient? What does a typical Wrike task look like?
2. **Task workflow:** Do tasks ever get "blocked"? Should we add a `BLOCKED` status? Do tasks have subtasks?
3. **Recurring tasks:** Are there tasks that repeat (e.g., "monthly firmware check at Prudential")? If so, we need a recurrence pattern.
4. **Project grouping:** In Wrike, tasks are grouped into projects. In Twenty, we can group by Company, Venue, or use tags. Which makes more sense?
5. **Time tracking:** Do they currently track hours in Wrike? Is `estimatedHours` / `actualHours` needed, or is it overhead?
6. **Airtable tables:** What exactly is tracked in Airtable? We've designed for common patterns but need to see the actual tables to ensure nothing is missed.
7. **Approval workflows:** Do any tasks require manager approval before closing? Or is it just assign → do → done?
8. **Cross-venue tasks:** Are there tasks that span multiple venues (e.g., "firmware update for all Northeast venues")?

---

## 12. What This Replaces

| Old Tool | What It Did | Twenty Replacement |
|----------|------------|-------------------|
| **Salesforce** | CRM, contacts, deals, tickets | Companies + People + Opportunities + ServiceTickets |
| **Wrike** | Task management, project boards, assignments | Tasks with kanban views, filtering by venue/assignee/priority |
| **Airtable** | Structured data (venues, services, schedules, equipment) | Venues + Services + custom fields on all objects |
| **Google Calendar** | Event scheduling | VenueEvents (direct event feed, not calendar sync) |
| **Excel/SharePoint** | Staff lists, reports | Technicians + Service Dashboard reports |

---

## Appendix A: Object Metadata IDs (Current)

| Object | Metadata ID | Custom? |
|--------|------------|---------|
| Company | `ccd95b3f-4a9a-443c-b8f2-01bff6c479ab` | No |
| Person | `fb3ffcb0-ba14-4825-9cd6-1f797ebe417a` | No |
| Opportunity | `c779922d-cf25-4a5e-9382-23eb1c02199e` | No |
| Task | `6e513ef8-368d-4efe-a628-6de4b9de28e4` | No |
| Venue | `136fe14f-02d3-4a6f-bf4a-81abaf6f77f1` | Yes |
| Technician | `2b49694c-f341-4992-9675-a1f3b8e1e898` | Yes |
| VenueEvent | `25371460-c4b4-42f8-80f1-78f14a895818` | Yes |
| ServiceTicket | `c91ebea2-7dc1-4498-bd54-ebfe89e38c41` | Yes |
| Service | `acdef7d4-9be2-4a3e-b671-235f9ee0bbb8` | Yes |

## Appendix B: API Quick Reference

```
Base URL:     https://abc-twenty.izcgmb.easypanel.host/rest
Metadata:     https://abc-twenty.izcgmb.easypanel.host/metadata (GraphQL)
Auth Header:  Authorization: Bearer <API_KEY>
Content-Type: application/json

CRUD Pattern:
  GET    /rest/{objects}              — List (paginated)
  GET    /rest/{objects}/{id}         — Get by ID
  POST   /rest/{objects}              — Create
  PATCH  /rest/{objects}/{id}         — Update
  DELETE /rest/{objects}/{id}         — Delete

Filtering:    ?filter=field[operator]:"value"
Pagination:   ?limit=60&starting_after={cursor}
```
