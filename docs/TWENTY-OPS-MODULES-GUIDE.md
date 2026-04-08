# ANC Operations — Twenty CRM Modules Guide

All 13 modules are live in Twenty CRM at **https://abc-twenty.izcgmb.easypanel.host**. Each module appears in the left sidebar as a custom object. You can view records as a table, Kanban board, or list.

---

## Quick Reference

| Module | Sidebar Name | Who Uses It | Kanban Field |
|---|---|---|---|
| RMA Tracker | RMA Trackers | Nick, Gianni | Status |
| Maintenance Log | Maintenance Logs | Nick, Technicians | Status |
| Inventory Asset | Inventory Assets | Nick | — (table view) |
| Designer Time Entry | Designer Time Entries | Alexis, Designers | Category |
| Designer Hours Budget | Designer Hours Budgets | Alexis | Status |
| Design Request | Design Requests | Alexis, Designers | Status |
| Content Schedule | Content Schedules | Alexis, Operators | Status |
| Print Request | Print Requests | Alexis | Status |
| CG Design Request | CG Design Requests | Alexis, CG Designer | Status |
| Checklist Item | Checklist Items | Gianni | Status |
| Parts Order | Parts Orders | Gianni | Status |
| Walkthrough Log | Walkthrough Logs | Nick, Technicians | Result |
| Client Portal View | Client Portal Views | Nick | — (table view) |

---

## Module Details

### 1. RMA Tracker
**Purpose:** Track Return Merchandise Authorizations from submission through repair and resolution.

**Status Flow:**
```
Submitted → In Repair → Shipped → Resolved
```

**How to use:**
1. Click **RMA Trackers** in the sidebar
2. Click **+ New** to create an RMA
3. Fill in: Description, Model #, Part Number, LED Manufacturer, Quantities
4. Set the Client (Company/Venue) relation
5. Add repair vendor and shipping info as the RMA progresses
6. Move through statuses as the repair lifecycle advances

**Key fields:**
- `Description` — What's wrong / what needs repair
- `Model #` / `Part Number` — Identifies the specific hardware
- `Project Code` — Internal tracking reference
- `Repair Vendor` — Who's doing the repair
- `Shipment Tracking` — Tracking number for shipped parts
- `Amount` — Cost of the repair/replacement
- `Remit to Stock` — Check if repaired part goes back to inventory
- `Client Name` / `Client Email` / `Client Phone` — External contact who submitted

**Tips:**
- Use the Kanban view grouped by Status to see the full pipeline
- Filter by repair vendor to track vendor performance
- When an RMA is resolved, create a corresponding Inventory Asset if parts were added

---

### 2. Maintenance Log
**Purpose:** Track scheduled and reactive maintenance at venues. Rolls up into venue profiles for service history.

**Status Flow:**
```
Open → In Progress → Resolved
```

**How to use:**
1. Click **Maintenance Logs** in the sidebar
2. Click **+ New** when a maintenance event is scheduled or an issue is reported
3. Set the **Venue** and **Technician** relations
4. Fill in: Issue title, Issue Summary (rich text for details), Location Reported
5. Update `Details to Resolve` as work progresses
6. Mark as Resolved when complete

**Key fields:**
- `Issue` — Short title (e.g., "LED module replacement — Section 102")
- `Issue Summary` — Rich text with full details, photos, etc.
- `Location Reported` — Specific area within the venue
- `Details to Resolve` — What needs to happen to fix it

**Tips:**
- Go to any Venue record → scroll to "Maintenance Logs" relation to see full service history
- Filter by Venue to see all maintenance at one location
- Track how many maintenance visits per venue over time to forecast parts needs
- Compare with Walkthrough Logs to see if reported problems led to maintenance

---

### 3. Inventory Asset
**Purpose:** Track parts, equipment, and connected devices at each venue.

**How to use:**
1. Click **Inventory Assets** in the sidebar
2. Click **+ New** to add a part or piece of equipment
3. Fill in: Part Name, Part Number, Manufacturer, Quantity
4. Set the **Venue** relation
5. Add location details: Room #, Screen Location
6. For networked equipment: add IP Address and Connected Devices

**Key fields:**
- `Part Name` / `Part Number` — Identifies the component
- `Project Code` — Links to the installation project
- `Manufacturer` — LED manufacturer or equipment maker
- `Location / Room #` — Physical location within venue
- `Screen Location` — Which display this part is installed in
- `IP Address` — Network address for connected equipment
- `Connected Devices` — Signal flow / what this connects to
- `Quantity` — How many on hand

**Tips:**
- Filter by Venue to see everything installed at one location
- Search by IP Address for remote troubleshooting
- Filter by Manufacturer to track vendor-specific inventory
- When a part is used in a repair (RMA), update the quantity here

---

### 4. Designer Time Entry
**Purpose:** Track hours per designer per client task. Replaces Wrike time reports.

**How to use:**
1. Click **Designer Time Entries** in the sidebar
2. Click **+ New** to log time
3. Set the **Designer** (Person) and **Client** (Company) relations
4. Fill in: Task Name, Date, Hours Spent
5. Select a Category and Billing Type
6. Add any comments about the work

**Categories:**
| Category | Typical % | Description |
|---|---|---|
| Initial Design Time | ~71% | First pass on a new design |
| Revision Design Time | ~12% | Changes after client feedback |
| Posting | ~6% | Uploading final files to FTP/system |
| Administrative Tasks | ~1% | Kickoff calls, coordination |
| Internal Review Time | ~1% | QC before sending to client |
| Uncategorized | ~10% | Other work |

**Billing Types:** Billable / Non-billable

**Tips:**
- Filter by Client to see total hours for one account
- Filter by Designer to see individual workload
- Group by Category to understand where time is going
- Export to Excel for client reporting (use Twenty's built-in export)

---

### 5. Designer Hours Budget
**Purpose:** Monitor contracted hour limits per client with automatic threshold alerts.

**Status Flow:**
```
Active → Paused → Exceeded
```

**How to use:**
1. Click **Designer Hours Budgets** in the sidebar
2. Click **+ New** to set up a client's budget
3. Set the **Client** (Company) relation
4. Enter `Contracted Hours` and select the `Period` (Monthly/Quarterly/Annual)
5. Toggle `Alert at 50%` and `Alert at 75%` on or off
6. `Current Hours Used` updates automatically via the hourly sync

**Key fields:**
- `Contracted Hours` — Total hours the client has purchased
- `Period` — Monthly, Quarterly, or Annual
- `Current Hours Used` — Auto-calculated from Designer Time Entries
- `Alert at 50%` / `Alert at 75%` — Enable/disable threshold notifications

**Tips:**
- Check this before starting a large design job to see how many hours remain
- When status changes to "Exceeded", notify the client and discuss additional hours
- Use the AI assistant: "How many hours does Indiana Fever have left this quarter?"

---

### 6. Design Request
**Purpose:** Track design jobs from request through FTP delivery. Replaces the Wrike design dashboard.

**Status Flow:**
```
Request Submitted → In Queue → In Progress → Quality Control → Client Review → Approved → Done
```

**How to use:**
1. Click **Design Requests** in the sidebar
2. Click **+ New** when a client requests a design
3. Set the **Client** and **Assignee** (designer) relations
4. Fill in: Description, Board/Section, Sizes Needed
5. Add FTP Proof Link once proofs are uploaded
6. Move through statuses as the job progresses
7. Add FTP Final Files link when posting the final files

**Workflow (step by step):**
| Step | Who | Action | Status |
|---|---|---|---|
| 1 | Enterprise Solutions | Enters request with all info | Request Submitted |
| 2 | Enterprise Solutions | Confirms all info is complete | In Queue |
| 3 | Designer | Starts working | In Progress |
| 4 | Designer | Uploads proofs to FTP | Quality Control |
| 5 | Enterprise Solutions | Sends proofs to client | Client Review |
| 6 | Client | Approves the design | Approved |
| 7 | Designer | Posts final files on FTP | Done |

**Tips:**
- Use Kanban view grouped by Status to see the full pipeline at a glance
- Filter by Assignee to see one designer's workload
- Filter by Client to see all active requests for one account
- Link to Designer Time Entries to track hours spent on each request

---

### 7. Content Schedule
**Purpose:** Schedule operator content with date-based status tracking. Replaces Wrike content scheduling.

**Status Flow:**
```
In Queue → Scheduled to Launch → Content Live → Confirmed with Client
```

**How to use:**
1. Click **Content Schedules** in the sidebar
2. Click **+ New** to schedule content
3. Set the **Client** and **Venue** relations
4. Fill in: Content Title, Start Date, End Date, Operator
5. Toggle `Files Ready` when files are prepared
6. Move through statuses as content goes live

**Key fields:**
- `Start Date` — When content begins playing
- `End Date` — When content stops
- `Operator` — Name of the person scheduling in the proprietary software
- `Files Ready` — Boolean flag for file preparation

**Tips:**
- Filter by Venue to see all content scheduled at one location
- Sort by Start Date to see upcoming launches
- Flag any records where End Date has passed but status isn't "Confirmed with Client"

---

### 8. Print Request
**Purpose:** Third-party print signage workflow for baseball clients. Moved from ClickUp.

**Status Flow:**
```
New Job → Waiting Layout → Awaiting Approval → Approved → In Production → Shipped → Invoiced
```

**How to use:**
1. Click **Print Requests** in the sidebar
2. Click **+ New** to enter a print job
3. Set the **Client** and **Assignee** relations
4. Fill in: Job Title, Notes with specifications
5. Add Cost when the third party quotes
6. Add Shipping Address for delivery
7. Track through production, shipping, and invoicing

**Key fields:**
- `Cost` — What the third party charges ANC
- `Invoice Amount` — What ANC charges the client
- `Shipping Address` — Where to send the printed signage
- `Ship Date` / `Tracking Number` — Shipping details
- `Invoice Number` — For accounting reconciliation

**Tips:**
- Filter by Client (this was a key feature Alexis wanted from ClickUp)
- Use the Kanban view to see all jobs across the pipeline
- Track cost vs invoice amount to monitor margins

---

### 9. CG Design Request
**Purpose:** Computer graphics design workflow organized by sport and team. The CG designer built this workflow and it should be kept exactly as-is.

**Status Flow:**
```
Request Submitted → In Queue → In Progress → Review → Revisions → Approved → Posted
```

**How to use:**
1. Click **CG Design Requests** in the sidebar
2. Click **+ New** to enter a CG request
3. Select the **Sport** (NFL, NBA, MLB, NHL, WNBA, NCAA, MLS, Other)
4. Enter the **Team** name
5. Set the **Client** and **CG Designer** relations
6. Fill in: Request Title, Notes, Due Date
7. The CG designer manages status from there

**Tips:**
- Filter by Sport to see all requests for one league
- Filter by Team within a sport to see that team's requests
- The CG designer controls the workflow — don't skip statuses

---

### 10. Checklist Item (30/60/90 Day)
**Purpose:** Pre-opening day task tracking by league and team. Used for seasonal preparation.

**Status Flow:**
```
Not Started → In Progress → Done
```

**How to use:**
1. Click **Checklist Items** in the sidebar
2. Click **+ New** to create a task
3. Select **League** (MLB, NBA, NFL, etc.) and enter **Team** name
4. Select **Days Out** (90, 60, or 30 — the milestone)
5. Set the **Assignee** and **Venue** relations
6. Fill in: Task Description, Instructions (rich text), Due Date
7. Update status as tasks are completed

**Organization:**
```
League → Team → Days Out → Individual Tasks
```
Example: MLB → Boston Red Sox → 30 Days → "Verify all LED modules powered on"

**Tips:**
- Filter by League + Days Out to see all 30-day items across teams
- Filter by Assignee to see one person's checklist
- Sort by Due Date to prioritize
- Track completion percentage per team for readiness reporting

---

### 11. Parts Order
**Purpose:** Internal parts ordering with form-based submission. Replaces Gianni's Wrike form.

**Status Flow:**
```
Request Submitted → Ordered → Shipped → Delivered
```

**How to use:**
1. Click **Parts Orders** in the sidebar
2. Click **+ New** to submit a parts request
3. Set the **Venue** relation
4. Fill in: Parts Needed, Quantity, Shipping Address
5. Add Requestor Name and Email
6. Attach a Photo URL if needed
7. Gianni manages the order from there

**Tips:**
- Anyone can submit a parts order — internal and external
- Gianni gets notified on new submissions
- Filter by Venue to see all orders for one location
- Once delivered, update Inventory Assets with the new parts

---

### 12. Walkthrough Log
**Purpose:** Daily technician walkthrough reports at venues. Tracks status and problem detection.

**Result Options:**
```
Good Walkthrough | Problem Detected | Partial Check
```

**How to use:**
1. Click **Walkthrough Logs** in the sidebar
2. Click **+ New** after completing a walkthrough
3. Set the **Venue** and **Technician** relations
4. Fill in: Date, Time, Result
5. If "Problem Detected": add details in Issues Found
6. Toggle `In Person` to indicate on-site vs remote check

**Tips:**
- Filter by Venue + sort by Date to see recent walkthroughs
- Filter by Result = "Problem Detected" to see all flagged issues
- If a problem is detected, create a Maintenance Log entry to track resolution
- Flag venues with no walkthroughs in 7+ days

---

### 13. Client Portal View
**Purpose:** Configure read-only dashboards for external stakeholders (e.g., Cushman & Wakefield).

**Access Levels:**
```
Read Only | Can Comment
```

**How to use:**
1. Click **Client Portal Views** in the sidebar
2. Click **+ New** to set up a portal for a client
3. Set the **Venue** and **Client** relations
4. Toggle what they can see: Issues, Display Status, Maintenance, Events
5. Add the Portal URL and Access Emails
6. Share the link with the client contact

**Tips:**
- Each venue can have multiple portal views for different clients
- Use the toggles to control exactly what external users see
- Keep notes on what was shared and when

---

## Using the AI Assistant

Twenty CRM has built-in AI that knows all 13 modules. Click the AI chat in the bottom-right corner and try:

**Operations queries:**
- "Show me all open RMAs older than 14 days"
- "What maintenance has been done at Prudential Center this month?"
- "Find all inventory with manufacturer Daktronics"
- "List parts orders that haven't been delivered yet"
- "Which venues haven't had a walkthrough this week?"

**Design & creative queries:**
- "How many hours has Peter Blank logged for Indiana Fever?"
- "What's the hours budget status for all active clients?"
- "Show me all design requests in Client Review"
- "List all print requests for the Red Sox that haven't been invoiced"
- "What CG design requests are pending for NFL teams?"

**Checklist queries:**
- "Show me MLB 30-day checklist completion by team"
- "Which teams have overdue checklist items?"
- "Create a standard 90-day checklist for the Dodgers"

**Cross-module queries:**
- "Give me a full venue health report for Prudential Center" (combines walkthroughs + maintenance + inventory + issues)
- "How much design work has been done for Indiana Fever this quarter vs their budget?"
- "Show me all open items across all modules for the Red Sox"

---

## Views & Kanban Boards

For any module with a Status field, you can switch to **Kanban view**:
1. Open the module from the sidebar
2. Click the view switcher (top-left, next to the module name)
3. Select **Kanban** and choose the Status field as the column

This gives you drag-and-drop cards across status columns — exactly like Wrike and ClickUp.

---

## Filtering & Sorting

Every module supports:
- **Filter by any field** — Click the filter icon, select a field, set a condition
- **Sort by any field** — Click the sort icon, choose ascending/descending
- **Group by** — Group records by any SELECT field (Status, League, Sport, Category)
- **Save views** — Create named views with specific filters/sorts for quick access

**Recommended saved views:**
- "My Active RMAs" — Filter: Status ≠ Resolved
- "This Week's Walkthroughs" — Filter: Date = This Week
- "Overdue Checklists" — Filter: Due Date < Today, Status ≠ Done
- "Design Pipeline" — Kanban by Status, Filter: Status ≠ Done
- "Client Hours Dashboard" — Group by Client, Sort by Current Hours Used desc

---

## Connecting Modules

Records link together through relations. When you set a Venue on a Maintenance Log, you can:
1. Go to that Venue's record
2. Scroll down to see "Maintenance Logs" as a related list
3. See the full service history for that venue

This works for all relations — Clients, Venues, People (designers/technicians).

**Example: Full venue picture**
Open a Venue record and scroll through:
- Maintenance Logs — service history
- Inventory Assets — installed equipment
- Walkthrough Logs — daily status checks
- Parts Orders — pending/delivered parts
- Content Schedules — upcoming content
- Checklist Items — pre-season preparation
- Client Portal Views — external access config
