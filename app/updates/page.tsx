'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-12">
    <h2 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
      <span className="w-8 h-px bg-[#0A52EF]"></span>
      {title}
    </h2>
    {children}
  </div>
)

const Feature = ({ title, description, details }: { title: string; description: string; details: Array<{ label: string; explain: string }> }) => (
  <div className="mb-8 pl-4 border-l-2 border-zinc-100">
    <h3 className="text-sm font-bold text-zinc-900">{title}</h3>
    <p className="text-sm text-zinc-600 mt-1 leading-relaxed">{description}</p>
    {details.length > 0 && (
      <table className="w-full mt-3 text-sm">
        <tbody>
          {details.map((d, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <td className="py-2 pr-4 text-zinc-400 font-medium whitespace-nowrap align-top w-40">{d.label}</td>
              <td className="py-2 text-zinc-700 leading-relaxed">{d.explain}</td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
  </div>
)

export default function UpdatesPage() {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto py-4">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs font-semibold text-[#0A52EF] uppercase tracking-wider mb-2">Platform Update</p>
          <h1 className="text-2xl font-bold text-zinc-900">What&apos;s New</h1>
          <p className="text-sm text-zinc-500 mt-2">April 2026 — Everything built from your feedback, plus some things you didn&apos;t ask for but we think you&apos;ll want.</p>
        </div>

        {/* ═══ VENUES ═══ */}
        <Section title="Venues">
          <Feature
            title="Venue Profile Cards"
            description="Every venue is now a branded profile — not a database row. Cover image, logo, key personnel, contracted services, and an AI briefing all visible at a glance."
            details={[
              { label: 'Cover Image', explain: 'Upload a photo of the venue (arena exterior, field, etc.) in Settings > Branding. Shows as a banner at the top of the venue page.' },
              { label: 'Logo', explain: 'Upload a venue or team logo in Settings > Branding. Also appears on the venue list cards. Falls back to initials if not set.' },
              { label: 'Venue Manager', explain: 'Assign the person responsible for day-to-day operations at this venue. Displayed in the venue header. Set it in Settings > Venue Roles.' },
              { label: 'Lead Field Rep', explain: 'Assign the lead technician on the ground. Same location — Settings > Venue Roles.' },
              { label: 'Contracted Services', explain: 'Toggle which services ANC is contracted to provide (Full Service, LED Maintenance, Content Management, etc.) in Settings. Active services show as green pills in the venue header.' },
            ]}
          />

          <Feature
            title="AI Venue Intel"
            description="Every venue page includes an AI briefing card that analyzes the current situation and tells you what needs attention."
            details={[
              { label: 'What it checks', explain: 'Unassigned events, missing roles, open tickets, overdue post-game reports, coverage rate, and workflow completion.' },
              { label: 'What it shows', explain: 'A natural-language summary of the venue\'s status, stat pills (coverage %, workflows %), and a recommendation for what to do next.' },
              { label: 'Refresh', explain: 'Click the refresh button to regenerate the briefing with current data. Cached for 5 minutes to keep page loads fast.' },
              { label: 'All clear state', explain: 'When everything is staffed and there are no issues, it shows a green "All clear" message instead of cluttering with empty stats.' },
            ]}
          />
        </Section>

        {/* ═══ TICKETS ═══ */}
        <Section title="Tickets">
          <Feature
            title="Salesforce Case Parity"
            description="The ticket system now matches Salesforce's Service Console field-for-field. If you used SF Cases before, this will feel familiar — but with real-time Slack integration, SLA tracking, and AI diagnostics that SF doesn't have."
            details={[
              { label: 'Source tracking', explain: 'Every ticket tracks where it came from — Email, Voicemail, Web, Phone, Slack, or Portal. Set automatically on creation, editable after.' },
              { label: 'Ticket types', explain: 'Support (standard service case) or Dev Ticket (internal development task spawned from a support case).' },
              { label: 'Contact info', explain: 'Contact name, email, and phone stored directly on the ticket. Click any field to edit inline.' },
              { label: 'Parent/child linking', explain: 'Link tickets together. Clone a ticket or create a Dev Ticket from the action menu — both auto-link as children to the original case.' },
              { label: 'SF Case Number', explain: 'Migrated tickets preserve the original Salesforce case number for cross-reference. Displayed in the Details tab.' },
            ]}
          />

          <Feature
            title="Ticket Detail Page"
            description="Three-column layout modeled after the SF Service Console. Left sidebar for quick edits, center for timeline and details, right sidebar for related objects."
            details={[
              { label: 'Feed tab', explain: 'The main timeline — comments, status changes, assignment changes, all in chronological order. Write comments, toggle between client-visible and internal notes.' },
              { label: 'Details tab', explain: 'Two-column field grid showing every field on the ticket. All inline-editable — click any value to change it. Matches the SF Details view.' },
              { label: 'Communication tab', explain: 'Shows email history for email tickets and the transcript, caller, and recording for voicemail tickets. The label changes based on case origin.' },
              { label: 'Notes tab', explain: 'Internal-only notes that venue contacts and clients cannot see. Use for internal coordination — "spoke to vendor, part ships Monday" etc.' },
              { label: 'Right sidebar', explain: 'Collapsible panels for Related Cases, Dev Tickets, Account Assets, and Parts. Matches the SF right sidebar layout.' },
              { label: 'Action menu', explain: '"Send to Slack" button with dropdown: Change Owner, Clone Ticket, Create Dev Ticket, Print View.' },
              { label: 'Mark Complete', explain: 'Green button in the header — one click to close the ticket.' },
              { label: 'SLA tracking', explain: 'Response and resolution deadlines with progress bars. Shows Met/Overdue/Breached status automatically.' },
            ]}
          />

          <Feature
            title="Inline Editing"
            description="Click any field to edit it directly — no forms, no modals, no 'edit mode.' Works across tickets, staff profiles, and venue pages."
            details={[
              { label: 'How it works', explain: 'Hover over a field to see the pencil icon. Click to edit. Press Enter or click away to save. Press Escape to cancel.' },
              { label: 'Text fields', explain: 'Title, contact name, email, phone, description — click and type.' },
              { label: 'Dropdowns', explain: 'Owner, priority, category, source, type — click and select from a dropdown.' },
              { label: 'Where it works', explain: 'Ticket detail page, staff profile page, venue detail page. Every detail page supports inline editing.' },
            ]}
          />

          <Feature
            title="Salesforce Migration"
            description="Full case history pulled from Salesforce into the dashboard."
            details={[
              { label: 'What migrated', explain: '2,174 cases across 167 accounts. Case numbers, status, priority, origin, contact info, and timestamps all preserved.' },
              { label: 'Venue matching', explain: 'SF Account names are fuzzy-matched to dashboard venues. Venues that don\'t exist are auto-created.' },
              { label: 'Deduplication', explain: 'Cases are matched by SF case number — re-running the import won\'t create duplicates.' },
            ]}
          />
        </Section>

        {/* ═══ AI DIAGNOSTICS ═══ */}
        <Section title="AI Diagnostics">
          <Feature
            title="Knowledge Base"
            description="An AI-powered diagnostic tool for LED display issues. A technician photographs a problem, and AI identifies it, suggests a fix, and finds similar past issues — all in seconds."
            details={[
              { label: 'How to use it', explain: 'Go to Support > Knowledge Base. Drop a photo or describe the issue in the input field. Click Diagnose.' },
              { label: 'What AI returns', explain: 'Issue title, type (Dead Pixels, Module Failure, Signal Loss, etc.), description of what it sees, likely cause, step-by-step fix instructions, and urgency level (Low/Medium/High/Critical).' },
              { label: 'Similar past issues', explain: 'After diagnosing, automatically searches the knowledge base using vector embeddings for visually and textually similar past issues. Shows similarity percentage.' },
              { label: 'Resolved tickets', explain: 'Also searches resolved tickets with resolution notes — "How we fixed this before." Shows the actual fix that worked, with a link to the ticket.' },
              { label: 'Create Ticket', explain: 'One-click button on the diagnosis card. Select a venue, and a ticket is created with everything pre-filled — title, description (with AI analysis), priority auto-mapped from urgency, category auto-detected.' },
              { label: 'Save to KB', explain: 'Saves the diagnosis to the knowledge base with vector embeddings. Future similar issues will find this entry as a reference.' },
              { label: 'Trending strip', explain: 'Top of the page shows the most common issue types across all KB entries. Click one to filter.' },
              { label: 'Manual add', explain: 'Collapsible form at the bottom for adding entries manually without AI. For when someone knows the issue and fix already.' },
            ]}
          />
        </Section>

        {/* ═══ SCHEDULING ═══ */}
        <Section title="Scheduling">
          <Feature
            title="Shift Templates"
            description="Create recurring shift patterns and auto-generate schedules. Instead of creating each shift one by one, define a template and generate a full week in one click."
            details={[
              { label: 'Create a template', explain: 'Go to Events > Shift Templates. Click New Template. Set a name (e.g. "Morning Shift"), pick a venue, set start/end times, select how many staff are needed.' },
              { label: 'Recurrence patterns', explain: 'Daily, Weekdays (Mon–Fri), Mon/Wed/Fri, Tue/Thu, Weekends, or Custom (pick individual days).' },
              { label: 'Generate shifts', explain: 'Click Generate on a template. Pick a date range, optionally select staff to auto-assign, preview the shifts that will be created, then confirm.' },
              { label: 'Duplicate detection', explain: 'Won\'t recreate shifts that already exist for the same template, date, and venue.' },
              { label: 'Auto-assign', explain: 'Select staff during generation and they\'re automatically assigned to every shift. Hours calculated from the template\'s time range.' },
              { label: 'Pause/Resume', explain: 'Pause a template to stop generating from it without deleting it. Resume anytime.' },
            ]}
          />
        </Section>

        {/* ═══ STAFF ═══ */}
        <Section title="Staff">
          <Feature
            title="CSV Import with Venue Linking"
            description="Upload a spreadsheet to bulk-create staff and link them to venues in one step."
            details={[
              { label: 'Format', explain: 'CSV or Excel with columns: Venue, Full Name, Email, Phone, Role. Download the template from the Staff page for the exact format.' },
              { label: 'Preview step', explain: 'After uploading, see a preview table showing what will be created (green), what already exists (blue), and what has errors (red). Nothing commits until you confirm.' },
              { label: 'Venue linking', explain: 'Each row\'s venue name is fuzzy-matched to existing venues. Staff are automatically linked to their venue.' },
              { label: 'Role assignment', explain: 'If Role is "Manager", that person is also set as the Venue Manager. If "Lead Field Rep", set as Lead Field Rep. Auto-configures the venue hierarchy.' },
              { label: 'Drag and drop', explain: 'Drag a CSV file onto the "Drop CSV or Click" button. No file picker needed.' },
            ]}
          />

          <Feature
            title="Technician Scoped Views"
            description="Staff with the Technician role only see events they're personally assigned to."
            details={[
              { label: 'What changes', explain: 'Dashboard stats, charts, alerts, and the events list all filter to show only the technician\'s assigned events.' },
              { label: 'Manager/Admin', explain: 'Managers and admins see everything — no change.' },
              { label: 'Why it matters', explain: 'A technician opens the dashboard and sees only their shifts, their venues, their events. No noise, no confusion.' },
            ]}
          />
        </Section>

        {/* ═══ QUALITY OF LIFE ═══ */}
        <Section title="Quality of Life">
          <Feature
            title="Sidebar Navigation"
            description="Reorganized into logical groups instead of a flat list."
            details={[
              { label: 'Operations', explain: 'Events, Shift Templates, Venues — day-to-day ops.' },
              { label: 'Support', explain: 'Tickets, Knowledge Base, Reports — issue tracking and reporting.' },
              { label: 'People', explain: 'Staff, Client Portals — team and external access.' },
              { label: 'System', explain: 'Inventory, Settings — admin configuration.' },
            ]}
          />

          <Feature
            title="Drag and Drop Everywhere"
            description="Every file upload in the platform supports drag-and-drop."
            details={[
              { label: 'Staff CSV import', explain: 'Drag a spreadsheet onto the import button.' },
              { label: 'Venue logo', explain: 'Drag an image onto the logo square in Settings > Branding.' },
              { label: 'Venue cover', explain: 'Drag an image onto the cover area in Settings > Branding.' },
              { label: 'KB diagnosis', explain: 'Drag a photo onto the AI Diagnostics input.' },
            ]}
          />

          <Feature
            title="View Preferences"
            description="Your preferred view (Calendar vs List on Events, Cards vs List on other pages) is saved per user in the database — not in the browser. Switch devices and your preferences follow you."
            details={[]}
          />
        </Section>

        <div className="border-t border-zinc-200 pt-6 mt-12">
          <p className="text-xs text-zinc-400 text-center">ANC Service Dashboard — April 2026 Update</p>
        </div>
      </div>
    </DashboardLayout>
  )
}
