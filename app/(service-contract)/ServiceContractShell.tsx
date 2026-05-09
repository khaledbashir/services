'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

interface PageNav {
  href: string
  label: string
  description: string
  icon: string
  match: (path: string) => boolean
}

const PAGES: PageNav[] = [
  {
    href: '/transparency',
    label: 'Transparency',
    description: 'Live contract status',
    icon: '📊',
    match: (p) => p === '/transparency' || p.startsWith('/transparency/'),
  },
  {
    href: '/service-log/change-orders',
    label: 'Change Orders',
    description: 'Project pipelines',
    icon: '📋',
    match: (p) => p.startsWith('/service-log/change-orders'),
  },
  {
    href: '/service-contract/proposed',
    label: 'Explore',
    description: 'Ideas before you commit',
    icon: '💡',
    match: (p) => p.startsWith('/service-contract/proposed'),
  },
  {
    href: '/inbox',
    label: 'Morning Brief',
    description: 'What needs attention',
    icon: '☕',
    match: (p) => p === '/inbox' || p.startsWith('/inbox/'),
  },
  {
    href: '/service-log',
    label: 'Service Log',
    description: 'Full request table',
    icon: '📒',
    match: (p) => p === '/service-log',
  },
]

const STORAGE_KEY = 'anc-service-contract-sidebar-collapsed'

export default function ServiceContractShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const [collapsed, setCollapsed] = useState<boolean>(false)
  const [hydrated, setHydrated] = useState<boolean>(false)

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (raw === '1') setCollapsed(true)
    } catch {}
    setHydrated(true)
  }, [])

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev
      try { window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

  const sidebarWidth = collapsed ? '64px' : '260px'

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 text-zinc-900 dark:text-zinc-100">
      <div
        className="lg:grid"
        style={{ gridTemplateColumns: hydrated ? `${sidebarWidth} 1fr` : '260px 1fr' }}
      >
        {/* Sidebar — owns ALL chrome for the service-contract suite */}
        <aside
          data-no-print="true"
          className={`sticky top-0 self-start hidden lg:flex flex-col h-screen border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 transition-all duration-200 ${
            collapsed ? 'px-2 py-4' : 'px-5 py-6'
          }`}
          aria-label="Service contract"
        >
          {/* Brand block + collapse toggle */}
          <div className={`flex items-center justify-between mb-6 ${collapsed ? 'flex-col gap-3' : ''}`}>
            {!collapsed && (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" className="h-8 w-auto dark:hidden" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/ANC_Logo_2023_white.png" alt="ANC Sports" className="h-8 w-auto hidden dark:block" />
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 dark:text-zinc-400 leading-none mb-1">
                  Service
                </div>
                <div className="text-base font-bold text-zinc-900 dark:text-zinc-100 leading-tight tracking-tight">
                  Contract
                </div>
              </div>
            )}
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-7 h-7 flex items-center justify-center rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              <span className="text-sm">{collapsed ? '›' : '‹'}</span>
            </button>
          </div>

          {/* Page-level nav */}
          <nav className="flex flex-col gap-1 flex-1">
            {!collapsed && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2 px-3">
                Pages
              </div>
            )}
            {PAGES.map((p) => {
              const isActive = p.match(pathname)
              if (collapsed) {
                return (
                  <Link
                    key={p.href}
                    href={p.href}
                    title={p.label}
                    aria-label={p.label}
                    className={`flex items-center justify-center w-12 h-12 mx-auto rounded-md transition-colors ${
                      isActive
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
                        : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-100'
                    }`}
                  >
                    <span className="text-lg">{p.icon}</span>
                  </Link>
                )
              }
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className={`group block px-3 py-2.5 rounded-md transition-colors border-l-2 ${
                    isActive
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white shadow-sm'
                      : 'border-transparent text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.icon}</span>
                    <span className="text-sm font-semibold leading-tight">{p.label}</span>
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ml-6 leading-tight ${
                      isActive
                        ? 'text-zinc-300 dark:text-zinc-600'
                        : 'text-zinc-500 dark:text-zinc-500 group-hover:text-zinc-600 dark:group-hover:text-zinc-400'
                    }`}
                  >
                    {p.description}
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Footer — exit to main app */}
          <div className={`mt-6 pt-4 border-t border-zinc-200 dark:border-zinc-800 ${collapsed ? 'px-1' : 'px-3'}`}>
            <Link
              href="/"
              title="Back to app"
              className={`text-[11px] text-zinc-500 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 ${
                collapsed ? 'flex items-center justify-center w-12 h-8 mx-auto text-base' : ''
              }`}
            >
              {collapsed ? '←' : '← Back to app'}
            </Link>
          </div>
        </aside>

        {/* Mobile-only top bar so the layout still works on phones */}
        <div className="lg:hidden sticky top-0 z-20 bg-white/95 dark:bg-zinc-950/95 backdrop-blur border-b border-zinc-200 dark:border-zinc-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-6 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-6 w-auto hidden dark:block" />
              <div className="text-xs font-bold tracking-tight">Service Contract</div>
            </div>
            <Link href="/" className="text-[11px] text-zinc-500">← App</Link>
          </div>
          <div className="flex gap-1.5 overflow-x-auto -my-1 py-1">
            {PAGES.map((p) => {
              const isActive = p.match(pathname)
              return (
                <Link
                  key={p.href}
                  href={p.href}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap ${
                    isActive
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  {p.label}
                </Link>
              )
            })}
          </div>
        </div>

        {/* Main content */}
        <main className="min-w-0 w-full">{children}</main>
      </div>
    </div>
  )
}
