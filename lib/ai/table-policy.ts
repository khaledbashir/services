import type { AgentRole, SkillCategory } from '@/lib/ai/types'

/**
 * The ONLY hand-maintained list in the AI data layer.
 *
 * It declares *intent* — which tables the agent may touch, who may touch
 * them, and where the record lives in the UI. Everything mechanical
 * (columns, types, required fields, primary keys, valid status values,
 * searchable columns) is introspected at runtime by lib/ai/schema.ts, so
 * shipping a migration can no longer leave the agent behind.
 *
 * Adding a table here is a one-line change. Omitting a table means the
 * agent cannot read or write it at all — that is the intended default for
 * plumbing (oauth state, webhook dedupe logs, message history, backups).
 */

export interface TablePolicy {
  table: string
  /** One line the model reads in its table catalog. Say what the table is FOR. */
  purpose: string
  category: SkillCategory
  icon: string
  /**
   * Hot tables get dedicated, named CRUD tools (find_many_events, …) because
   * the model reaches for them constantly and a named tool beats a generic
   * one with a `table` argument. Everything else is served by the generic
   * record tools. Requires `singular` + `plural`.
   */
  primary?: boolean
  singular?: string
  plural?: string
  /** Minimum role to read. Default: any authenticated user. */
  read?: Exclude<AgentRole, 'any'>
  /** Minimum role to create/update. Default: manager. */
  write?: Exclude<AgentRole, 'any'>
  /** Minimum role to delete. `false` = the agent may never delete this table. */
  remove?: Exclude<AgentRole, 'any'> | false
  /** No writes at all — audit trails, derived data, uploaded blobs. */
  readOnly?: boolean
  /** Detail-page prefix, e.g. '/tickets' → '/tickets/<id>'. Enables deep links. */
  pagePath?: string
}

export const TABLE_POLICIES: TablePolicy[] = [
  // ---- Core records (named CRUD tools) -----------------------------------
  {
    table: 'events', purpose: 'Games and events at venues, with workflow status and staffing need.',
    category: 'Events', icon: '📅', primary: true, singular: 'event', plural: 'events',
    write: 'manager', remove: 'admin', pagePath: '/events',
  },
  {
    table: 'venues', purpose: 'Arenas, stadiums and sites ANC services.',
    category: 'Venues', icon: '📍', primary: true, singular: 'venue', plural: 'venues',
    write: 'manager', remove: 'admin', pagePath: '/venues',
  },
  {
    table: 'staff', purpose: 'ANC employees and technicians, their role and contact info.',
    category: 'Staff', icon: '👤', primary: true, singular: 'staff_member', plural: 'staff_members',
    write: 'admin', remove: 'admin', pagePath: '/staff',
  },
  {
    table: 'tickets', purpose: 'Support tickets raised against a venue. Priority + status drive SLA.',
    category: 'Support', icon: '🎫', primary: true, singular: 'ticket', plural: 'tickets',
    write: 'technician', remove: 'admin', pagePath: '/tickets',
  },
  {
    table: 'clients', purpose: 'Client accounts (teams, arenas, advertisers) ANC contracts with.',
    category: 'Clients', icon: '🏢', primary: true, singular: 'client', plural: 'clients',
    write: 'manager', remove: 'admin', pagePath: '/clients',
  },
  {
    table: 'design_requests', purpose: 'Creative design jobs: boards, sizes, designer, hours, proof links.',
    category: 'Creative', icon: '🎨', primary: true, singular: 'design_request', plural: 'design_requests',
    write: 'technician', remove: 'admin', pagePath: '/designs',
  },

  // ---- Tickets & support -------------------------------------------------
  { table: 'ticket_comments', purpose: 'Comments on a ticket. `is_internal` separates staff notes from client-visible replies.', category: 'Support', icon: '💬', write: 'technician', remove: 'manager' },
  { table: 'ticket_assignees', purpose: 'Multi-assignee roster for a ticket. tickets.assigned_to is the primary owner.', category: 'Support', icon: '👥', write: 'technician', remove: 'manager' },
  { table: 'ticket_attachments', purpose: 'Files attached to tickets.', category: 'Support', icon: '📎', readOnly: true },
  { table: 'canned_responses', purpose: 'Reusable reply templates for tickets.', category: 'Support', icon: '📝', write: 'manager', remove: 'manager' },
  { table: 'sla_policies', purpose: 'Response/resolution time targets per priority.', category: 'Support', icon: '⏰', write: 'admin', remove: 'admin' },
  { table: 'service_requests', purpose: 'Inbound service requests from clients before they become tickets.', category: 'Support', icon: '📥', write: 'technician', remove: 'manager' },

  // ---- Events, scheduling & staffing -------------------------------------
  { table: 'event_assignments', purpose: 'Which staff are assigned to which event. Absence here = unstaffed event.', category: 'Events', icon: '🧑‍🤝‍🧑', write: 'manager', remove: 'manager' },
  { table: 'assignment_rules', purpose: 'Auto-assignment rules mapping venues/leagues to staff.', category: 'Events', icon: '⚙️', write: 'manager', remove: 'admin' },
  { table: 'league_settings', purpose: 'Per-league configuration (NBA, NHL, …).', category: 'Events', icon: '🏆', write: 'manager', remove: 'admin' },
  { table: 'shift_templates', purpose: 'Reusable shift patterns for scheduling staff.', category: 'Staff', icon: '🗓️', write: 'manager', remove: 'manager' },
  { table: 'staff_venues', purpose: 'Which venues each staff member is linked to. Drives familiarity scoring.', category: 'Staff', icon: '🔗', write: 'manager', remove: 'manager' },
  { table: 'workflow_submissions', purpose: 'Game-day workflow submissions: check_in, game_ready, post_game_report.', category: 'Events', icon: '✔️', write: 'technician', remove: 'manager' },
  { table: 'discovery_log', purpose: 'Audit of automatic event discovery from venue feeds.', category: 'Events', icon: '🔎', readOnly: true },

  // ---- Service operations ------------------------------------------------
  { table: 'maintenance_logs', purpose: 'Maintenance work on venue assets: issue, technician, scheduled/completed dates.', category: 'Service Ops', icon: '🔧', write: 'technician', remove: 'admin', pagePath: '/maintenance' },
  { table: 'walkthrough_logs', purpose: 'Technician venue walkthroughs: locations visited, issues found, result.', category: 'Service Ops', icon: '🚶', write: 'technician', remove: 'manager', pagePath: '/walkthroughs' },
  { table: 'checklist_items', purpose: 'Pre-event checklist tasks with days-out timing and assignee.', category: 'Service Ops', icon: '✅', write: 'technician', remove: 'manager' },
  { table: 'rma_trackers', purpose: 'Return-merchandise authorizations for failed LED parts.', category: 'Service Ops', icon: '↩️', write: 'manager', remove: 'admin' },
  { table: 'parts', purpose: 'Parts catalog with unit cost, quantity on hand and reorder threshold.', category: 'Service Ops', icon: '🔩', write: 'manager', remove: 'admin' },
  { table: 'parts_orders', purpose: 'Requests to order parts for a venue.', category: 'Service Ops', icon: '📦', write: 'technician', remove: 'manager' },
  { table: 'inventory', purpose: 'Physical assets installed at venues: displays, processors, IPs, locations.', category: 'Service Ops', icon: '🗄️', write: 'manager', remove: 'admin' },
  { table: 'stations', purpose: 'Control-room stations and workstations at a venue.', category: 'Service Ops', icon: '🖥️', write: 'manager', remove: 'admin' },
  { table: 'venue_screens', purpose: 'Individual LED screens/displays at a venue.', category: 'Venues', icon: '📺', write: 'manager', remove: 'admin' },
  { table: 'venue_documents', purpose: 'Documents attached to a venue (manuals, contracts, drawings).', category: 'Venues', icon: '📄', write: 'manager', remove: 'manager' },
  { table: 'venue_notes', purpose: 'Free-form operational notes about a venue.', category: 'Venues', icon: '🗒️', write: 'technician', remove: 'manager' },
  { table: 'venue_briefings', purpose: 'Briefing content shown to techs before working a venue.', category: 'Venues', icon: '📋', write: 'manager', remove: 'manager' },
  { table: 'venue_services', purpose: 'Which contracted services are switched on for a venue.', category: 'Venues', icon: '🧰', write: 'manager', remove: 'admin' },
  { table: 'service_types', purpose: 'Catalog of contracted service types ANC offers.', category: 'Clients', icon: '🏷️', write: 'admin', remove: 'admin' },

  // ---- Clients, contracts & money ----------------------------------------
  { table: 'client_venues', purpose: 'Which venues belong to which client account.', category: 'Clients', icon: '🔗', write: 'manager', remove: 'manager' },
  { table: 'client_services', purpose: 'Contracted services per client.', category: 'Clients', icon: '🧾', write: 'manager', remove: 'admin' },
  { table: 'service_payments', purpose: 'Payments recorded against a service contract.', category: 'Clients', icon: '💵', read: 'manager', write: 'admin', remove: false },
  { table: 'proposed_change_orders', purpose: 'Change orders proposed against a service contract.', category: 'Clients', icon: '📑', read: 'manager', write: 'manager', remove: 'admin' },
  { table: 'infra_receipts', purpose: 'Infrastructure expense receipts logged against the contract.', category: 'Clients', icon: '🧾', read: 'manager', write: 'manager', remove: 'admin' },
  { table: 'retainer_alerts', purpose: 'Alerts fired when a retainer or hours budget nears its limit.', category: 'Clients', icon: '🚨', readOnly: true },
  { table: 'client_portals', purpose: 'Client-facing portal configs. Share tokens are never exposed.', category: 'Clients', icon: '🌐', read: 'manager', write: 'manager', remove: 'admin' },
  { table: 'portal_users', purpose: 'External client users with portal logins. Credentials never exposed.', category: 'Clients', icon: '🔑', read: 'manager', write: 'admin', remove: 'admin' },
  { table: 'tenants', purpose: 'Multi-tenant workspaces on the platform.', category: 'System', icon: '🏛️', read: 'admin', write: 'admin', remove: false },
  { table: 'markets', purpose: 'Geographic markets venues are grouped into.', category: 'Venues', icon: '🗺️', write: 'admin', remove: 'admin' },
  { table: 'platforms', purpose: 'Display/content platforms in use across venues.', category: 'Venues', icon: '🧱', write: 'admin', remove: 'admin' },

  // ---- Creative pipeline -------------------------------------------------
  { table: 'cg_design_requests', purpose: 'Character-generator (broadcast graphics) design jobs.', category: 'Creative', icon: '🖼️', write: 'technician', remove: 'admin', pagePath: '/cg-designs' },
  { table: 'cg_design_comments', purpose: 'Comments on a CG design request.', category: 'Creative', icon: '💬', write: 'technician', remove: 'manager' },
  { table: 'cg_design_finals', purpose: 'Final delivered files for a CG design request.', category: 'Creative', icon: '📤', readOnly: true },
  { table: 'design_request_comments', purpose: 'Comment thread on a design request.', category: 'Creative', icon: '💬', write: 'technician', remove: 'manager' },
  { table: 'design_request_files', purpose: 'Uploaded files/proofs on a design request.', category: 'Creative', icon: '📎', readOnly: true },
  { table: 'design_request_designers', purpose: 'Designers assigned to a design request.', category: 'Creative', icon: '🧑‍🎨', write: 'technician', remove: 'manager' },
  { table: 'design_request_templates', purpose: 'Reusable templates for new design requests.', category: 'Creative', icon: '🗂️', write: 'manager', remove: 'manager' },
  { table: 'content_schedules', purpose: 'Scheduled content runs on venue displays.', category: 'Creative', icon: '📺', write: 'technician', remove: 'admin' },
  { table: 'content_schedule_templates', purpose: 'Reusable content-schedule templates.', category: 'Creative', icon: '🗂️', write: 'manager', remove: 'manager' },
  { table: 'print_requests', purpose: 'Large-format print jobs, vendor cost, shipping and tracking.', category: 'Creative', icon: '🖨️', write: 'manager', remove: 'admin' },
  { table: 'print_request_comments', purpose: 'Comment thread on a print request.', category: 'Creative', icon: '💬', write: 'technician', remove: 'manager' },
  { table: 'designer_hours_budgets', purpose: 'Contracted design hours per client/season. Grouped by tri-code.', category: 'Creative', icon: '⏱️', write: 'manager', remove: 'admin', pagePath: '/hours-budgets' },
  { table: 'designer_time_entries', purpose: 'Individual time entries that draw down an hours budget.', category: 'Creative', icon: '⌛', write: 'technician', remove: 'manager' },

  // ---- Project schedule / deployment -------------------------------------
  { table: 'project_schedule_tasks', purpose: 'Tasks on a deployment project schedule.', category: 'Projects', icon: '🗓️', write: 'manager', remove: 'manager' },
  { table: 'project_transmittals', purpose: 'Transmittals issued for a project submittal.', category: 'Projects', icon: '📨', write: 'manager', remove: 'manager' },
  { table: 'project_schedule_extra_submittals', purpose: 'Submittal register rows added beyond the imported set.', category: 'Projects', icon: '📗', write: 'manager', remove: 'manager' },

  // ---- Marketing hub -----------------------------------------------------
  { table: 'marketing_contacts', purpose: 'Marketing contact records (leads and client contacts).', category: 'Marketing', icon: '📇', write: 'manager', remove: 'manager' },
  { table: 'marketing_audiences', purpose: 'Named audience segments for campaigns.', category: 'Marketing', icon: '🎯', write: 'manager', remove: 'manager' },
  { table: 'marketing_audience_members', purpose: 'Membership rows linking contacts to audiences.', category: 'Marketing', icon: '👥', write: 'manager', remove: 'manager' },
  { table: 'newsletter_campaigns', purpose: 'Email campaigns: subject, body, schedule, send status.', category: 'Marketing', icon: '✉️', write: 'manager', remove: 'manager' },
  { table: 'newsletter_campaign_recipients', purpose: 'Per-recipient delivery/open/click state for a campaign.', category: 'Marketing', icon: '📬', readOnly: true },
  { table: 'marketing_templates', purpose: 'Reusable email/newsletter templates.', category: 'Marketing', icon: '🗂️', write: 'manager', remove: 'manager' },
  { table: 'marketing_social_posts', purpose: 'Scheduled and published social posts.', category: 'Marketing', icon: '📢', write: 'manager', remove: 'manager' },
  { table: 'marketing_form_submissions', purpose: 'Inbound marketing form submissions.', category: 'Marketing', icon: '📥', readOnly: true },

  // ---- Gamification ------------------------------------------------------
  { table: 'gamification_points', purpose: 'Points awarded to staff for completed work.', category: 'Gamification', icon: '⭐', write: 'manager', remove: 'admin' },
  { table: 'gamification_badges', purpose: 'Badge definitions staff can earn.', category: 'Gamification', icon: '🏅', write: 'manager', remove: 'admin' },
  { table: 'gamification_user_badges', purpose: 'Badges earned by each staff member.', category: 'Gamification', icon: '🎖️', write: 'manager', remove: 'admin' },
  { table: 'gamification_streaks', purpose: 'Consecutive-day activity streaks per staff member.', category: 'Gamification', icon: '🔥', readOnly: true },

  // ---- Knowledge & audit -------------------------------------------------
  { table: 'kb_entries', purpose: 'Internal knowledge-base articles.', category: 'Knowledge', icon: '📚', write: 'technician', remove: 'manager', pagePath: '/kb' },
  { table: 'report_schedules', purpose: 'Recurring report deliveries to clients/staff.', category: 'Knowledge', icon: '📊', write: 'manager', remove: 'manager' },
  { table: 'activity_log', purpose: 'Append-only audit trail of platform actions.', category: 'System', icon: '📜', readOnly: true },
]

const BY_TABLE = new Map(TABLE_POLICIES.map(p => [p.table, p]))

export function getPolicy(table: string): TablePolicy | undefined {
  return BY_TABLE.get(table)
}

/** Tables the agent may touch at all. Anything absent is invisible by design. */
export function exposedTables(): string[] {
  return TABLE_POLICIES.map(p => p.table)
}

export function primaryPolicies(): TablePolicy[] {
  return TABLE_POLICIES.filter(p => p.primary)
}

/** Effective role gates, with the defaults applied. */
export function readRole(p: TablePolicy): Exclude<AgentRole, 'any'> | undefined {
  return p.read
}
export function writeRole(p: TablePolicy): Exclude<AgentRole, 'any'> | undefined {
  return p.readOnly ? undefined : (p.write || 'manager')
}
export function deleteRole(p: TablePolicy): Exclude<AgentRole, 'any'> | undefined {
  if (p.readOnly || p.remove === false || p.remove === undefined) return undefined
  return p.remove
}
export function canWrite(p: TablePolicy): boolean {
  return !p.readOnly
}
export function canDelete(p: TablePolicy): boolean {
  return !p.readOnly && p.remove !== false && p.remove !== undefined
}
