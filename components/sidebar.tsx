'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [userName, setUserName] = useState('')
  const [userRole, setUserRole] = useState('')

  useEffect(() => {
    const name = localStorage.getItem('userName')
    const role = localStorage.getItem('userRole')
    if (name) setUserName(name)
    if (role) setUserRole(role)
  }, [])

  const isActive = (path: string) => pathname.startsWith(path)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/events', label: 'Events' },
    { href: '/venues', label: 'Venues' },
    { href: '/staff', label: 'Staff' },
    { href: '/tickets', label: 'Tickets' },
    { href: '/settings', label: 'Automations' },
  ]

  const adminItems: { href: string; label: string }[] = [
  ]

  return (
    <div className="w-60 bg-[#0A1628] text-white h-screen flex flex-col fixed left-0 top-0 border-r border-[#0A1628]">
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
    </div>
  )
}
