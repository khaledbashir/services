'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo, ReactNode } from 'react'

type Role = 'admin' | 'tech_support' | 'manager' | 'technician' | 'any'

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
}

function Icon({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      {children}
    </svg>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState<Role>('any')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setUserName(localStorage.getItem('userName') || '')
    setUserRole((localStorage.getItem('userRole') as Role) || 'any')
    try {
      const stored = localStorage.getItem('sidebarSections')
      if (stored) setOpenSections(JSON.parse(stored))
    } catch {}
    setHydrated(true)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  const isAdmin = userRole === 'admin'
  const isTechSupport = userRole === 'tech_support' || isAdmin
  const isManager = userRole === 'manager' || isTechSupport
  const isTechnician = userRole === 'technician'

  const roleAllows = (min?: Role): boolean => {
    if (!min || min === 'any') return true
    if (min === 'admin') return isAdmin
    if (min === 'tech_support') return isTechSupport
    if (min === 'manager') return isManager
    if (min === 'technician') return isManager || isTechnician
    return false
  }

  const sections: NavSection[] = useMemo(() => [
    {
      key: 'people',
      label: isAdmin ? 'People' : 'External',
      icon: <Icon>{IC.people}</Icon>,
      role: 'manager',
      links: [
        { href: '/clients', label: 'Clients' },
        { href: '/staff', label: 'Staff', role: 'admin' },
        { href: '/portals', label: 'Client Portals' },
      ],
    },
    {
      key: 'operations',
      label: 'Operations',
      icon: <Icon>{IC.operations}</Icon>,
      links: [
        isTechnician
          ? { href: '/my-events', label: 'My Assignments', role: 'technician' }
          : { href: '/events', label: 'Events', role: 'manager' },
        !isTechnician ? { href: '/my-events', label: 'My Assignments', role: 'manager' } : null,
        { href: '/shifts', label: 'Shift Templates', role: 'manager' },
        { href: '/venues', label: 'Venues', role: 'manager' },
        { href: '/venues/map', label: 'Map View', role: 'manager' },
        { href: '/preview-tech', label: 'Preview Staff View', role: 'manager' },
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
        { href: '/gallery', label: 'Visual Gallery' },
        { href: '/reports', label: 'Reports' },
      ],
    },
    {
      key: 'service-ops',
      label: 'Service Ops',
      icon: <Icon>{IC.service}</Icon>,
      role: 'technician',
      links: [
        { href: '/maintenance', label: 'Maintenance' },
        { href: '/walkthroughs', label: 'Walkthroughs' },
        { href: '/checklists', label: 'Checklists' },
        { href: '/rma', label: 'RMA Tracker', role: 'manager' },
        { href: '/parts-orders', label: 'Parts Orders', role: 'manager' },
        { href: '/parts', label: 'Parts Catalog', role: 'manager' },
      ],
    },
    {
      key: 'creative',
      label: 'Creative',
      icon: <Icon>{IC.creative}</Icon>,
      role: 'technician',
      links: [
        { href: '/designs', label: 'Design Requests' },
        { href: '/cg-designs', label: 'CG Designs' },
        { href: '/content-schedules', label: 'Content Schedule' },
        { href: '/prints', label: 'Print Requests', role: 'manager' },
        { href: '/hours-budgets', label: 'Hours Budgets', role: 'manager' },
        { href: '/time-entries', label: 'Time Entries' },
      ],
    },
    {
      key: 'system',
      label: 'System',
      icon: <Icon>{IC.system}</Icon>,
      role: 'tech_support',
      links: [
        { href: '/inventory', label: 'Inventory' },
        { href: '/settings', label: 'Settings', role: 'admin' },
      ],
    },
  ], [userRole, isTechnician, isAdmin, isTechSupport])

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
    setOpenSections(prev => {
      const next = { ...prev, [key]: !prev[key] }
      try { localStorage.setItem('sidebarSections', JSON.stringify(next)) } catch {}
      return next
    })
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
      <Link href="/dashboard" className="block p-6 border-b border-white/5 hover:bg-white/[0.03] transition-colors">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7" />
        <p className="text-zinc-500 text-[11px] mt-1.5 font-medium tracking-wider uppercase">Services</p>
      </Link>

      <nav className="flex-1 p-3 overflow-y-auto space-y-0.5">
        {/* Top-level: Dashboard / My Events */}
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
          if (!roleAllows(section.role)) return null
          const visibleLinks = section.links.filter(l => roleAllows(l.role))
          if (visibleLinks.length === 0) return null

          const containsActive = visibleLinks.some(l => isLinkActive(l.href, l.exact))
          const isOpen = openSections[section.key] ?? containsActive

          return (
            <div key={section.key} className="pt-2">
              <button
                onClick={() => toggleSection(section.key)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="opacity-70">{section.icon}</span>
                  {section.label}
                  {(section.key === 'service-ops' || section.key === 'creative') && (
                    <span className="ml-1 inline-flex items-center rounded-sm bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-sm">
                      WIP
                    </span>
                  )}
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

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-[#0A1628] text-white p-2 rounded-md shadow-lg"
        aria-label="Open menu"
      >
        <Icon className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></Icon>
      </button>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-[#0A1628] text-white flex flex-col transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white z-10"
          aria-label="Close menu"
        >
          <Icon className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></Icon>
        </button>
        {sidebarContent}
      </div>

      <div className="hidden lg:flex w-60 bg-[#0A1628] text-white h-screen flex-col fixed left-0 top-0 border-r border-white/5">
        {sidebarContent}
      </div>
    </>
  )
}
