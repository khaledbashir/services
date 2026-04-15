'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const name = localStorage.getItem('userName')
    const role = localStorage.getItem('userRole')
    if (name) setUserName(name)
    if (role) setUserRole(role)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const isActive = (path: string) => pathname.startsWith(path)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    localStorage.removeItem('userName')
    localStorage.removeItem('userRole')
    localStorage.removeItem('userId')
    router.push('/login')
  }

  const isAdmin = userRole === 'admin'
  const isManager = userRole === 'manager' || isAdmin
  const isTechnician = userRole === 'technician'

  const linkClass = (path: string) =>
    isActive(path)
      ? 'block px-4 py-2 rounded text-[13px] font-medium bg-[#0A52EF]/15 text-white border-l-2 border-[#0A52EF] pl-3 transition-all'
      : 'block px-4 py-2 rounded text-[13px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-all'

  const subLinkClass = (path: string) =>
    isActive(path)
      ? 'block pl-9 pr-4 py-1.5 rounded text-[12px] font-medium text-white bg-[#0A52EF]/10 transition-all'
      : 'block pl-9 pr-4 py-1.5 rounded text-[12px] text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-all'

  const sectionLabel = (text: string) => (
    <div className="pt-4 pb-1">
      <p className="px-4 text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">{text}</p>
    </div>
  )

  const sidebarContent = (
    <>
      {/* Logo Area */}
      <Link href="/dashboard" className="block p-6 border-b border-[#0A1628] hover:bg-[#0A1628]/50 transition-colors">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
        <p className="text-zinc-500 text-xs mt-2 font-medium">Services</p>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {isManager ? (
          <Link href="/dashboard" className={linkClass('/dashboard')}>Dashboard</Link>
        ) : (
          <Link href="/my-events" className={linkClass('/my-events')}>My Events</Link>
        )}

        {/* Operations */}
        {sectionLabel('Operations')}
        {isTechnician ? (
          <Link href="/my-events" className={linkClass('/my-events')}>My Assignments</Link>
        ) : (
          <Link href="/events" className={linkClass('/events')}>Events</Link>
        )}
        {isManager && <Link href="/shifts" className={subLinkClass('/shifts')}>Shift Templates</Link>}
        {!isTechnician && <Link href="/venues" className={linkClass('/venues')}>Venues</Link>}
        {isManager && <Link href="/venues/map" className={subLinkClass('/venues/map')}>Map View</Link>}

        {/* Support */}
        {isManager && (
          <>
            {sectionLabel('Support')}
            <Link href="/tickets" className={linkClass('/tickets')}>Tickets</Link>
            <Link href="/kb" className={subLinkClass('/kb')}>Knowledge Base</Link>
            <Link href="/gallery" className={subLinkClass('/gallery')}>Visual Gallery</Link>
            <Link href="/reports" className={linkClass('/reports')}>Reports</Link>
          </>
        )}

        {/* Service Ops */}
        {(isManager || isTechnician) && (
          <>
            {sectionLabel('Service Ops')}
            <Link href="/maintenance" className={linkClass('/maintenance')}>Maintenance</Link>
            <Link href="/walkthroughs" className={linkClass('/walkthroughs')}>Walkthroughs</Link>
            <Link href="/checklists" className={linkClass('/checklists')}>Checklists</Link>
            {isManager && <Link href="/rma" className={linkClass('/rma')}>RMA Tracker</Link>}
            {isManager && <Link href="/parts-orders" className={linkClass('/parts-orders')}>Parts Orders</Link>}
            {isManager && <Link href="/parts" className={subLinkClass('/parts')}>Parts Catalog</Link>}
          </>
        )}

        {/* Creative Ops */}
        {(isManager || isTechnician) && (
          <>
            {sectionLabel('Creative')}
            <Link href="/cg-designs" className={linkClass('/cg-designs')}>CG Designs</Link>
            <Link href="/content-schedules" className={linkClass('/content-schedules')}>Content Schedule</Link>
            {isManager && <Link href="/prints" className={linkClass('/prints')}>Print Requests</Link>}
          </>
        )}

        {/* People */}
        {isAdmin && (
          <>
            {sectionLabel('People')}
            <Link href="/staff" className={linkClass('/staff')}>Staff</Link>
            <Link href="/portals" className={linkClass('/portals')}>Client Portals</Link>
          </>
        )}
        {isManager && !isAdmin && (
          <>
            {sectionLabel('External')}
            <Link href="/portals" className={linkClass('/portals')}>Client Portals</Link>
          </>
        )}

        {/* System */}
        {isAdmin && (
          <>
            {sectionLabel('System')}
            <Link href="/inventory" className={linkClass('/inventory')}>Inventory</Link>
            <Link href="/settings" className={linkClass('/settings')}>Settings</Link>
          </>
        )}
      </nav>

      {/* User Info + Logout */}
      <div className="p-4 border-t border-[#0A1628] space-y-4">
        {userName && (
          <div className="px-2 py-3">
            <p className="text-zinc-500 text-xs font-medium uppercase tracking-wide">Logged in as</p>
            <p className="text-white text-sm font-medium truncate mt-1">{userName}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2.5 text-zinc-500 hover:text-zinc-300 text-[13px] font-medium transition-colors"
        >
          Sign out
        </button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 bg-[#0A1628] text-white p-2 rounded shadow-lg"
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div className={`lg:hidden fixed inset-y-0 left-0 z-50 w-60 bg-[#0A1628] text-white flex flex-col transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <button
          onClick={() => setMobileOpen(false)}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white"
          aria-label="Close menu"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {sidebarContent}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex w-60 bg-[#0A1628] text-white h-screen flex-col fixed left-0 top-0 border-r border-[#0A1628]">
        {sidebarContent}
      </div>
    </>
  )
}
