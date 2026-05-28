'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, ReactNode } from 'react'
import { ThemeToggle } from './theme-toggle'

type Role = 'admin' | 'tech_support' | 'manager' | 'technician' | 'designer' | 'design_contractor' | 'any'

// Feature flags — flip to true to bring back. Hidden 5/6 per Ahmad
// ("hide everything walk issues etc that is custom and hide the tab that
// says voice"). Code paths + routes left intact so /walkthroughs etc still
// work directly via URL — just removed from nav discoverability.
const SHOW_OPS_TABLES = false
const SHOW_VOICE_AGENT_DEMO = false

interface NavLink {
  href: string
  label: string
  role?: Role      // minimum role required
  exact?: boolean  // use exact path match instead of startsWith
}

interface NavSection {
  key: string
  label: string
  icon: ReactNode
  role?: Role       // minimum role to see the whole section
  links: NavLink[]
  defaultOpen?: boolean // expand on first visit (overridden once the user toggles)
}

// --- icons ---
const IC = {
  operations: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18M6 12h12M9 17h6" />
  ),
  support: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  ),
  service: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  creative: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
  ),
  people: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" />
  ),
  system: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2z" />
  ),
  chevron: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
  ),
  voice: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3m-4 0h8M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z" />
  ),
  tables: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4V4zm0 6h16M10 4v16M16 4v16" />
  ),
}

function Icon({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      {children}
    </svg>
  )
}

// Module-level cache survives Sidebar remounts. Every page wraps itself in
// <DashboardLayout>, so the Sidebar unmounts on every client-side nav and
// loses local state — without this, the rail snaps shut whenever the user
// clicks a link. localStorage seeds the cache on first load so the choice
// also survives a full page reload.
let cachedExpanded = false
let cachedSections: Record<string, boolean> = {}
let cachedSeeded = false

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<Role>('any')
  const [mobileOpen, setMobileOpen] = useState(false)
  // Desktop expand state — default collapsed (icon-only rail). When the user
  // clicks the chevron OR any section icon while collapsed, we expand. The
  // CSS variable --anc-sidebar-w drives DashboardLayout's content margin so
  // the page reflows responsively (push, not overlay).
  const [desktopExpanded, setDesktopExpandedRaw] = useState(cachedExpanded)
  const [openSections, setOpenSectionsRaw] = useState<Record<string, boolean>>(cachedSections)
  const [hydrated, setHydrated] = useState(false)

  const setDesktopExpanded: typeof setDesktopExpandedRaw = (v) => {
    setDesktopExpandedRaw(prev => {
      const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v
      cachedExpanded = next
      try { localStorage.setItem('sidebarExpanded', String(next)) } catch {}
      return next
    })
  }

  const setOpenSections: typeof setOpenSectionsRaw = (v) => {
    setOpenSectionsRaw(prev => {
      const next = typeof v === 'function' ? (v as (p: Record<string, boolean>) => Record<string, boolean>)(prev) : v
      cachedSections = next
      try { localStorage.setItem('sidebarSections', JSON.stringify(next)) } catch {}
      return next
    })
  }

  useEffect(() => {
    setUserName(localStorage.getItem('userName') || '')
    setUserRole((localStorage.getItem('userRole') as Role) || 'any')
    if (!cachedSeeded) {
      cachedSeeded = true
      try {
        if (localStorage.getItem('sidebarExpanded') === 'true') {
          cachedExpanded = true
          setDesktopExpandedRaw(true)
        }
        const stored = localStorage.getItem('sidebarSections')
        if (stored) {
          const parsed = JSON.parse(stored)
          cachedSections = parsed
          setOpenSectionsRaw(parsed)
        }
      } catch {}
    }
    setHydrated(true)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isAdmin = userRole === 'admin'
  const isTechSupport = userRole === 'tech_support' || isAdmin
  const isManager = userRole === 'manager' || isTechSupport
  const isTechnician = userRole === 'technician'
  const isDesigner = userRole === 'designer'
  const isDesignContractor = userRole === 'design_contractor'

  const roleAllows = (min?: Role): boolean => {
    if (!min || min === 'any') return true
    if (min === 'admin') return isAdmin
    if (min === 'tech_support') return isTechSupport
    if (min === 'manager') return isManager
    // Designer + Design Contractor count as technicians for endpoints that
    // require 'technician' (read-only design data). Section-level visibility
    // is gated below — they don't see Support, Field Ops, External, Admin.
    if (min === 'technician') return isManager || isTechnician || isDesigner || isDesignContractor
    if (min === 'designer') return isDesigner || isManager
    if (min === 'design_contractor') return isDesignContractor
    return false
  }

  // Per Alexis's 5/6 Slack spec — exact link sets per narrow role.
  //   Designer: Design Request, CG Designs, Venues, Events, Time Entries,
  //             Hour Budgets.
  //   Design Consultant (stored as `design_contractor`): Design Request,
  //             CG Design only.
  // Everyone else falls back to the standard role-min check.
  const DESIGNER_ALLOWED_HREFS = new Set([
    '/designs', '/cg-designs', '/reports/designs-by-client',
    '/venues', '/venues/map',
    '/events', '/my-events', '/time-entries', '/hours-budgets',
  ])
  const DESIGN_CONSULTANT_ALLOWED_HREFS = new Set(['/designs', '/cg-designs'])

  const sectionVisibleForUser = (section: NavSection): boolean => {
    if (isDesignContractor) {
      return section.key === 'design'
    }
    if (isDesigner) {
      return section.key === 'events' || section.key === 'design'
    }
    return roleAllows(section.role)
  }

  const linkVisibleForUser = (link: NavLink): boolean => {
    if (isDesignContractor) return DESIGN_CONSULTANT_ALLOWED_HREFS.has(link.href)
    if (isDesigner) return DESIGNER_ALLOWED_HREFS.has(link.href)
    return roleAllows(link.role)
  }

  const sections: NavSection[] = useMemo(() => [
    ...(SHOW_OPS_TABLES ? [{
      // Native Airtable-style DataGrid pages (live as of 5/6 pivot). UI is
      // hand-rolled (TanStack Table + custom cells + Tailwind) so we own
      // every knob — group-by, view tabs, locked views, inline cell edit,
      // calendar/gallery/kanban views, drag-and-drop. Pinned to the top of
      // nav and default-open so it's the most prominent section.
      key: 'ops-tables',
      label: 'Ops Tables',
      icon: <Icon>{IC.tables}</Icon>,
      role: 'technician' as Role,
      defaultOpen: true,
      links: [
        { href: '/noco', label: 'All Tables' },
        { href: '/walkthroughs', label: 'Walkthroughs' },
        { href: '/walkthroughs/new', label: 'New Walkthrough' },
        { href: '/issues', label: 'Issues' },
        { href: '/displays', label: 'Displays' },
        { href: '/display-locations', label: 'Display Locations' },
        { href: '/inventory', label: 'Inventory', role: 'manager' as Role },
        { href: '/maintenance', label: 'Maintenance' },
        { href: '/rma', label: 'RMA Tracker', role: 'manager' as Role },
        { href: '/parts', label: 'Parts Catalog', role: 'manager' as Role },
        { href: '/parts-orders', label: 'Parts Orders', role: 'manager' as Role },
      ] as NavLink[],
    } as NavSection] : []),
    {
      key: 'events',
      label: 'Events & Schedule',
      icon: <Icon>{IC.operations}</Icon>,
      links: [
        isTechnician
          ? { href: '/my-events', label: 'My Assignments', role: 'technician' }
          : { href: '/events', label: 'Events', role: 'manager' },
        !isTechnician ? { href: '/my-events', label: 'My Assignments', role: 'manager' } : null,
        { href: '/venues', label: 'Venues', role: 'manager' },
        { href: '/venues/map', label: 'Map View', role: 'manager' },
        { href: '/shifts', label: 'Shift Templates', role: 'manager' },
      ].filter(Boolean) as NavLink[],
    },
    {
      key: 'support',
      label: 'Support',
      icon: <Icon>{IC.support}</Icon>,
      role: 'manager',
      links: [
        { href: '/tickets', label: 'Tickets' },
        { href: '/kb', label: 'Knowledge Base' },
        { href: '/reports', label: 'Reports' },
      ],
    },
    {
      key: 'design',
      label: 'Design & Creative',
      icon: <Icon>{IC.creative}</Icon>,
      role: 'technician',
      links: [
        { href: '/designs', label: 'Design Requests' },
        { href: '/cg-designs', label: 'CG Designs' },
        { href: '/reports/designs-by-client', label: 'Requests by Client' },
        { href: '/content-schedules', label: 'Content Schedule' },
        { href: '/marketing-hub', label: 'Marketing Hub', role: 'manager' },
        { href: '/print-requests', label: 'Print Requests', role: 'manager' },
        { href: '/gallery', label: 'Visual Gallery' },
        { href: '/time-entries', label: 'Time Entries' },
        { href: '/hours-budgets', label: 'Hours Budgets', role: 'manager' },
      ],
    },
    {
      key: 'media-sponsorship',
      label: 'Media & Sponsorship',
      icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" /></Icon>,
      role: 'manager',
      links: [
        { href: '/ms', label: 'All Teams' },
      ],
    },
    {
      // The NocoDB-backed "Operations Workspace" embed (ops.ancsports.net)
      // stays available alongside the native tables for now per Ahmad 5/6 —
      // both accordions show, each in its own section.
      key: 'field-ops',
      label: 'Field Ops',
      icon: <Icon>{IC.service}</Icon>,
      role: 'technician',
      links: [
        { href: '/operations', label: 'Operations Workspace' },
        { href: '/opening-checklists', label: 'Stadium Prep', role: 'manager' },
      ],
    },
    // Hidden 2026-05-02 — work in progress, surface to the team once Joe/
    // Charlie sign off. Route still works at /voice-agents direct.
    // {
    //   key: 'voice-agents',
    //   label: 'Voice Agents',
    //   icon: <Icon>{IC.voice}</Icon>,
    //   role: 'technician',
    //   links: [
    //     { href: '/voice-agents', label: 'All voice agents' },
    //   ],
    // },
    // External section hidden — exposes multi-tenant architecture to ANC staff
    // {
    //   key: 'external',
    //   label: 'External',
    //   icon: <Icon>{IC.people}</Icon>,
    //   role: 'manager',
    //   links: [
    //     { href: '/clients', label: 'Clients' },
    //     { href: '/portals', label: 'Client Portals' },
    //     { href: '/service-log', label: 'Service Log', role: 'manager' },
    //     ...(SHOW_VOICE_AGENT_DEMO ? [{ href: '/voice-agent-demo', label: 'Voice Agent Demo' }] : []),
    //   ],
    // },
    // {
    //   key: 'gamification',
    //   label: 'Leaderboard',
    //   icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M16 4v6l-4 2-4-2V4M6 20h12M8 20v-4h8v4M12 12v4" /></Icon>,
    //   links: [
    //     { href: '/gamification', label: 'Leaderboard' },
    //     { href: '/gamification/badges', label: 'Badges' },
    //     { href: '/gamification/feed', label: 'Activity Feed' },
    //   ],
    // },
    {
      key: 'team',
      label: 'Team',
      icon: <Icon>{IC.people}</Icon>,
      role: 'admin',
      links: [
        { href: '/staff', label: 'Users', role: 'admin' },
      ],
    },
    // Rest of legacy Admin section stays hidden — exposes infrastructure tooling.
    // Pages still accessible by direct URL.
    // {
    //   key: 'admin',
    //   label: 'Admin',
    //   icon: <Icon>{IC.system}</Icon>,
    //   role: 'tech_support',
    //   links: [
    //     { href: '/admin/feed-finder', label: 'Feed URL Finder', role: 'manager' },
    //     { href: '/admin/tenants', label: 'Client Switchboard', role: 'admin' },
    //     { href: '/expenses', label: 'Expenses', role: 'admin' },
    //     { href: '/settings', label: 'Settings', role: 'admin' },
    //     { href: '/preview-tech', label: 'Preview Staff View', role: 'manager' },
    //   ],
    // },
  ], [userRole, isTechnician, isAdmin, isTechSupport, isDesigner, isDesignContractor])

  const isLinkActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/') || pathname === href

  // Auto-open section that contains the current page (once hydrated).
  useEffect(() => {
    if (!hydrated) return
    const sectionToOpen = sections.find(s => s.links.some(l => isLinkActive(l.href)))
    if (sectionToOpen && openSections[sectionToOpen.key] === undefined) {
      setOpenSections(prev => ({ ...prev, [sectionToOpen.key]: true }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, hydrated])

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('userName')
    localStorage.removeItem('userRole')
    localStorage.removeItem('userId')
    router.push('/login')
  }

  const sidebarContent = (
    <>
      <Link href="/hub" className="block p-6 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7" />
        <p className="text-zinc-500 text-[11px] mt-1.5 font-medium tracking-wider uppercase">Services</p>
      </Link>

      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        <Link
          href="/hub"
          className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
            isLinkActive('/hub', true)
              ? 'bg-[#0A52EF]/15 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h7v7H4V5zm9 0h7v7h-7V5zM4 14h7v5H4v-5zm9 0h7v5h-7v-5z" /></Icon>
          ANC Hub
        </Link>

        {/* Top-level link — manager+ → Dashboard, designer/contractor →
            Design Requests (their primary surface), technician → My Events. */}
        {isManager ? (
          <Link
            href="/dashboard"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
              isLinkActive('/dashboard', true)
                ? 'bg-[#0A52EF]/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10h14V10" /></Icon>
            Dashboard
          </Link>
        ) : (isDesigner || isDesignContractor) ? (
          <Link
            href="/designs"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
              isLinkActive('/designs')
                ? 'bg-[#0A52EF]/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="h-4 w-4 opacity-70">{IC.creative}</Icon>
            My Design Queue
          </Link>
        ) : (
          <Link
            href="/my-events"
            className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
              isLinkActive('/my-events')
                ? 'bg-[#0A52EF]/15 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            My Events
          </Link>
        )}

        {sections.map(section => {
          if (!sectionVisibleForUser(section)) return null
          const visibleLinks = section.links.filter(l => linkVisibleForUser(l))
          if (visibleLinks.length === 0) return null

          const containsActive = visibleLinks.some(l => isLinkActive(l.href, l.exact))
          const isOpen = openSections[section.key] ?? (section.defaultOpen || containsActive)

          return (
            <div key={section.key} className="pt-2">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="opacity-70">{section.icon}</span>
                  {section.label}
                </span>
                <Icon className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}>{IC.chevron}</Icon>
              </button>
              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {visibleLinks.map(link => {
                    const active = isLinkActive(link.href, link.exact)
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        className={`block pl-9 pr-3 py-1.5 rounded-md text-[13px] transition-colors ${
                          active
                            ? 'bg-[#0A52EF]/15 text-white font-medium'
                            : 'text-zinc-400 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {link.label}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className="p-3 border-t border-white/5">
        {userName && (
          <div className="px-3 py-2 mb-1">
            <p className="text-zinc-500 text-[10px] font-medium uppercase tracking-wider">Signed in</p>
            <p className="text-white text-[13px] font-medium truncate mt-0.5">{userName}</p>
          </div>
        )}
        <Link
          href="/account"
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" /></Icon>
          Account
        </Link>
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></Icon>
          Sign out
        </button>
      </div>
    </>
  )

  // Compact collapsed rail — section icons only. Click any icon to expand
  // the full sidebar (and auto-open that section).
  const collapsedRail = (
    <>
      <Link href="/hub" className="block py-4 border-b border-white/5 hover:bg-white/[0.03] transition-colors flex justify-center">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-6 w-auto" />
      </Link>
      <nav className="flex-1 py-3 overflow-y-auto flex flex-col items-center gap-1">
        {sections.map(section => {
          if (!sectionVisibleForUser(section)) return null
          const visibleLinks = section.links.filter(l => linkVisibleForUser(l))
          if (visibleLinks.length === 0) return null
          const containsActive = visibleLinks.some(l => isLinkActive(l.href, l.exact))
          return (
            <button
              key={section.key}
              onClick={() => {
                setDesktopExpanded(true)
                setOpenSections(prev => ({ ...prev, [section.key]: true }))
              }}
              title={section.label}
              className={`w-10 h-10 flex items-center justify-center rounded-md transition-colors ${
                containsActive
                  ? 'bg-[#0A52EF]/15 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {section.icon}
            </button>
          )
        })}
      </nav>
      <div className="py-3 border-t border-white/5 flex flex-col items-center gap-1">
        <Link href="/account" title="Account" className="w-10 h-10 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors">
          <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M12 11c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z" /></Icon>
        </Link>
        <button
          onClick={handleLogout}
          title="Sign out"
          className="w-10 h-10 flex items-center justify-center rounded-md text-zinc-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <Icon className="h-4 w-4 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></Icon>
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile: hamburger overlay drawer (unchanged from original) */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-[var(--anc-sidebar)] text-white p-2 rounded-md shadow-lg"
        aria-label="Open menu"
      >
        <Icon className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></Icon>
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-[var(--anc-sidebar)] text-white flex flex-col transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white z-10"
          aria-label="Close menu"
        >
          <Icon className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></Icon>
        </button>
        {sidebarContent}
      </div>

      {/* Desktop: persistent rail. Width animates between 16 (collapsed,
          icon-only) and 60 (expanded). The chevron toggle sits at the top-
          right of the rail and flips direction with the state. The page
          content reads --anc-sidebar-w to set its left margin. */}
      <div
        className={`hidden lg:flex bg-[var(--anc-sidebar)] text-white h-screen flex-col fixed left-0 top-0 border-r border-white/5 transition-[width] duration-200 ease-out ${
          desktopExpanded ? 'w-60' : 'w-16'
        }`}
      >
        <button
          onClick={() => setDesktopExpanded(v => !v)}
          aria-label={desktopExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          className="absolute -right-3 top-6 z-10 w-6 h-6 rounded-full bg-[var(--anc-sidebar)] border border-white/10 text-zinc-400 hover:text-white hover:border-white/30 transition-colors flex items-center justify-center shadow-md"
        >
          <Icon className={`h-3 w-3 transition-transform duration-200 ${desktopExpanded ? 'rotate-180' : ''}`}>
            {IC.chevron}
          </Icon>
        </button>
        {desktopExpanded ? sidebarContent : collapsedRail}
      </div>

      {/* Publish the desktop rail width as a CSS variable so DashboardLayout
          (and any other consumer) can offset content responsively. Mobile
          stays at 0 — the drawer overlays. */}
      <style jsx global>{`
        :root { --anc-sidebar-w: 0px; }
        @media (min-width: 1024px) {
          :root { --anc-sidebar-w: ${desktopExpanded ? '15rem' : '4rem'}; }
        }
      `}</style>
    </>
  )
}
