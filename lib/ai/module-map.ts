import type { AgentRole } from '@/lib/ai/types'

/**
 * The dashboard's module map, as the agent sees it.
 *
 * The agent has always had ui_navigate(path), but nothing ever told it which
 * paths exist — so it guessed, and it had no idea that Marketing Hub, the
 * project deployment workspace, gamification, hours budgets, the service
 * contract ledger or venue intelligence had shipped at all.
 *
 * Add a route here when you ship a module. This is what turns "the AI knows
 * the database" into "the AI knows the product".
 */

export interface AppModule {
  path: string
  /** What a staff member does here. Written for the model, not for docs. */
  purpose: string
  area: string
  /** Minimum role that should be sent here. Omit for everyone. */
  role?: Exclude<AgentRole, 'any'>
}

export const APP_MODULES: AppModule[] = [
  // Home
  { path: '/dashboard', purpose: 'Main dashboard: today\'s events, open tickets, headline counts.', area: 'Home' },
  { path: '/dashboard/ops-overview', purpose: 'Operations overview across venues.', area: 'Home', role: 'manager' },
  { path: '/dashboard/design-content', purpose: 'Design and content pipeline overview.', area: 'Home', role: 'manager' },
  { path: '/hub', purpose: 'Launcher tiles for every module.', area: 'Home' },
  { path: '/updates', purpose: 'Changelog of what shipped on the platform.', area: 'Home' },

  // Events
  { path: '/events', purpose: 'All events. Filter by venue, league, date, workflow status.', area: 'Events' },
  { path: '/events/[id]', purpose: 'One event: staffing, workflow, venue details.', area: 'Events' },
  { path: '/my-events', purpose: 'Events the signed-in staff member is assigned to.', area: 'Events' },
  { path: '/workflow/[eventId]', purpose: 'Game-day workflow: check-in, game-ready, post-game report.', area: 'Events' },
  { path: '/events/discovery-log', purpose: 'Audit of events auto-discovered from venue feeds.', area: 'Events', role: 'manager' },
  { path: '/shifts', purpose: 'Staff shift scheduling.', area: 'Events', role: 'manager' },

  // Venues
  { path: '/venues', purpose: 'All venues ANC services.', area: 'Venues' },
  { path: '/venues/[id]', purpose: 'One venue: contacts, screens, services, tickets, events, documents.', area: 'Venues' },
  { path: '/venues/map', purpose: 'Venues plotted on a map.', area: 'Venues' },
  { path: '/venue-intelligence', purpose: 'Venue intelligence pilot: signals and risk per venue.', area: 'Venues', role: 'manager' },
  { path: '/displays', purpose: 'LED displays across the estate.', area: 'Venues' },
  { path: '/display-locations', purpose: 'Physical locations of displays within venues.', area: 'Venues' },

  // Support
  { path: '/tickets', purpose: 'Support tickets. Sortable by priority, status, venue, assignee.', area: 'Support' },
  { path: '/tickets/[id]', purpose: 'One ticket: timeline, internal notes, client replies, assignees.', area: 'Support' },
  { path: '/issues', purpose: 'Issues surfaced from walkthroughs and maintenance.', area: 'Support' },

  // Service ops
  { path: '/maintenance', purpose: 'Maintenance logs against venue assets.', area: 'Service Ops' },
  { path: '/walkthroughs', purpose: 'Technician venue walkthroughs.', area: 'Service Ops' },
  { path: '/walkthroughs/new', purpose: 'Log a new walkthrough.', area: 'Service Ops' },
  { path: '/checklists', purpose: 'Pre-event checklists.', area: 'Service Ops' },
  { path: '/opening-checklists', purpose: 'Venue opening checklists.', area: 'Service Ops' },
  { path: '/inventory', purpose: 'Installed assets: displays, processors, IPs, locations.', area: 'Service Ops' },
  { path: '/parts', purpose: 'Parts catalog and stock levels.', area: 'Service Ops' },
  { path: '/parts-orders', purpose: 'Parts order requests.', area: 'Service Ops' },
  { path: '/rma', purpose: 'RMA tracker for failed LED parts.', area: 'Service Ops' },

  // Creative
  { path: '/designs', purpose: 'Design requests pipeline (request_submitted → … → done).', area: 'Creative' },
  { path: '/designs/[id]', purpose: 'One design request: brief, proofs, comments, designer, hours.', area: 'Creative' },
  { path: '/designs/templates', purpose: 'Reusable design-request templates.', area: 'Creative' },
  { path: '/designs/samples', purpose: 'Design sample packs to share with clients.', area: 'Creative' },
  { path: '/designs/internal-hours', purpose: 'Internal design hours tracking.', area: 'Creative', role: 'manager' },
  { path: '/cg-designs', purpose: 'Character-generator (broadcast graphics) design jobs.', area: 'Creative' },
  { path: '/content-schedules', purpose: 'Scheduled content runs on venue displays.', area: 'Creative' },
  { path: '/print-requests', purpose: 'Large-format print jobs, vendor cost and shipping.', area: 'Creative' },
  { path: '/hours-budgets', purpose: 'Contracted design hours per client, rolled up by tri-code.', area: 'Creative', role: 'manager' },
  { path: '/forms/design-request', purpose: 'Intake form for a new design request.', area: 'Creative' },
  { path: '/forms/print-request', purpose: 'Intake form for a new print request.', area: 'Creative' },
  { path: '/forms/parts-order', purpose: 'Intake form for a new parts order.', area: 'Creative' },
  { path: '/proof-admin', purpose: 'Manage client proof shares and approvals.', area: 'Creative', role: 'manager' },

  // Projects
  { path: '/project-schedule', purpose: 'Project deployment workspace: submittal register, install readiness, PM agenda.', area: 'Projects', role: 'manager' },
  { path: '/project-schedule/[id]', purpose: 'One deployment project: tasks, submittals, transmittals, logistics.', area: 'Projects', role: 'manager' },

  // Clients & contract
  { path: '/clients', purpose: 'Client accounts.', area: 'Clients' },
  { path: '/clients/[id]', purpose: 'One client: venues, services, contacts.', area: 'Clients' },
  { path: '/client-portals', purpose: 'Client-facing portal configuration.', area: 'Clients', role: 'manager' },
  { path: '/service-log', purpose: 'Service contract work log.', area: 'Clients', role: 'manager' },
  { path: '/service-log/change-orders', purpose: 'Change orders against the service contract.', area: 'Clients', role: 'manager' },
  { path: '/transparency', purpose: 'Transparency ledger — what was delivered against the contract.', area: 'Clients', role: 'manager' },
  { path: '/expenses', purpose: 'Infrastructure expenses and receipts.', area: 'Clients', role: 'manager' },

  // Marketing
  { path: '/marketing-hub', purpose: 'Marketing hub home: campaigns and content.', area: 'Marketing', role: 'manager' },
  { path: '/marketing-hub/compose', purpose: 'Compose a newsletter or campaign email.', area: 'Marketing', role: 'manager' },
  { path: '/marketing-hub/studio', purpose: 'Marketing agent studio for generated creative.', area: 'Marketing', role: 'manager' },
  { path: '/marketing/audiences', purpose: 'Audience segments and membership.', area: 'Marketing', role: 'manager' },
  { path: '/marketing/calendar', purpose: 'Campaign and social posting calendar.', area: 'Marketing', role: 'manager' },
  { path: '/marketing/insights', purpose: 'Campaign performance: opens, clicks, conversions.', area: 'Marketing', role: 'manager' },

  // Reporting & data
  { path: '/reports', purpose: 'Report index.', area: 'Reporting' },
  { path: '/reports/hours-by-client', purpose: 'Design hours consumed per client.', area: 'Reporting', role: 'manager' },
  { path: '/reports/tickets-by-tech', purpose: 'Ticket volume and resolution per technician.', area: 'Reporting', role: 'manager' },
  { path: '/reports/tickets-by-venue', purpose: 'Ticket volume per venue.', area: 'Reporting', role: 'manager' },
  { path: '/reports/designs-by-client', purpose: 'Design request volume per client.', area: 'Reporting', role: 'manager' },
  { path: '/operations', purpose: 'Embedded operations data workspace (use the ops_* tools to read/write it).', area: 'Reporting' },

  // Staff & knowledge
  { path: '/staff', purpose: 'Staff directory.', area: 'Staff' },
  { path: '/staff/[id]', purpose: 'One staff member: venues, workload, assignments.', area: 'Staff' },
  { path: '/time-entries', purpose: 'Designer time entries against hours budgets.', area: 'Staff' },
  { path: '/gamification', purpose: 'Points, streaks and leaderboard for field staff.', area: 'Staff' },
  { path: '/gamification/badges', purpose: 'Badge definitions and who earned them.', area: 'Staff' },
  { path: '/kb', purpose: 'Internal knowledge base.', area: 'Knowledge' },

  // Admin
  { path: '/settings', purpose: 'Platform settings.', area: 'Admin', role: 'admin' },
  { path: '/account', purpose: 'The signed-in user\'s own account.', area: 'Admin' },
  { path: '/admin/portal-users', purpose: 'Manage external client portal users.', area: 'Admin', role: 'admin' },
  { path: '/admin/tenants', purpose: 'Manage tenants.', area: 'Admin', role: 'admin' },
  { path: '/voice-agents', purpose: 'Configure voice agents.', area: 'Admin', role: 'manager' },
]

/**
 * Compact, role-filtered module list for the system prompt. Dynamic segments
 * stay as [id] so the model knows to substitute a real id it has looked up.
 */
export function moduleMapForPrompt(userRole: AgentRole): string {
  const rank: Record<string, number> = { any: 0, designer: 1, design_contractor: 1, technician: 1, manager: 2, tech_support: 3, admin: 4 }
  const visible = APP_MODULES.filter(m => !m.role || (rank[userRole] ?? 0) >= (rank[m.role] ?? 0))

  const byArea = new Map<string, AppModule[]>()
  for (const m of visible) {
    if (!byArea.has(m.area)) byArea.set(m.area, [])
    byArea.get(m.area)!.push(m)
  }

  const lines: string[] = []
  for (const [area, mods] of byArea) {
    lines.push(`${area}:`)
    for (const m of mods) lines.push(`  ${m.path} — ${m.purpose}`)
  }
  return lines.join('\n')
}
