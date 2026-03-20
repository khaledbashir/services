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

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/events', label: 'Events' },
    { href: '/venues', label: 'Venues' },
    ...(isManager ? [{ href: '/tickets', label: 'Tickets' }] : []),
  ]

  const adminItems = isAdmin ? [
    { href: '/staff', label: 'Staff' },
    { href: '/settings', label: 'Settings' },
  ] : []

  const sidebarContent = (
    <>
      {/* Logo Area */}
      <div className="p-6 border-b border-[#0A1628]">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
        <p className="text-zinc-500 text-xs mt-2 font-medium">Services</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? 'block px-4 py-2.5 rounded transition-all text-[13px] font-medium bg-[#0A52EF]/15 text-white border-l-2 border-[#0A52EF] pl-3' : 'block px-4 py-2.5 rounded transition-all text-[13px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}
          >
            {item.label}
          </Link>
        ))}

        {userRole === 'admin' && (
          <>
            <div className="py-2" />
            {adminItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={isActive(item.href) ? 'block px-4 py-2.5 rounded transition-all text-[13px] font-medium bg-[#0A52EF]/15 text-white border-l-2 border-[#0A52EF] pl-3' : 'block px-4 py-2.5 rounded transition-all text-[13px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5'}
              >
                {item.label}
              </Link>
            ))}
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
        className="md:hidden fixed top-4 left-4 z-50 bg-[#0A1628] text-white p-2 rounded shadow-lg"
        aria-label="Open menu"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <div className={`md:hidden fixed inset-y-0 left-0 z-50 w-60 bg-[#0A1628] text-white flex flex-col transform transition-transform duration-200 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
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
      <div className="hidden md:flex w-60 bg-[#0A1628] text-white h-screen flex-col fixed left-0 top-0 border-r border-[#0A1628]">
        {sidebarContent}
      </div>
    </>
  )
}
