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
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 text-gray-900 dark:text-gray-100">
      <div
        className="lg:grid"
        style={{ gridTemplateColumns: hydrated ? `${sidebarWidth} 1fr` : '260px 1fr' }}
      >
        {/* Sidebar — owns ALL chrome for the service-contract suite */}
        <aside
          data-no-print="true"
          className={`sticky top-0 self-start hidden lg:flex flex-col h-screen border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-200 ${
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
                <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-gray-500 dark:text-gray-400 leading-none mb-1">
                  Service
                </div>
                <div className="text-base font-bold text-gray-900 dark:text-gray-100 leading-tight tracking-tight">
                  Contract
                </div>
              </div>
            )}
            <button
              onClick={toggle}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
            >
              <span className="text-sm">{collapsed ? '›' : '‹'}</span>
            </button>
          </div>

          {/* Page-level nav */}
          <nav className="flex flex-col gap-1 flex-1">
            {!collapsed && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-2 px-3">
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
                        ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-100'
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
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white shadow-sm'
                      : 'border-transparent text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100/70 dark:hover:bg-gray-800/40'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.icon}</span>
                    <span className="text-sm font-semibold leading-tight">{p.label}</span>
                  </div>
                  <div
                    className={`text-[11px] mt-0.5 ml-6 leading-tight ${
                      isActive
                        ? 'text-gray-300 dark:text-gray-600'
                        : 'text-gray-500 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400'
                    }`}
                  >
                    {p.description}
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* Footer — exit to main app */}
          <div className={`mt-6 pt-4 border-t border-gray-200 dark:border-gray-800 ${collapsed ? 'px-1' : 'px-3'}`}>
            <Link
              href="/"
              title="Back to app"
              className={`text-[11px] text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-gray-100 ${
                collapsed ? 'flex items-center justify-center w-12 h-8 mx-auto text-base' : ''
              }`}
            >
              {collapsed ? '←' : '← Back to app'}
            </Link>
          </div>
        </aside>

        {/* Mobile-only top bar so the layout still works on phones */}
        <div className="lg:hidden sticky top-0 z-20 bg-white/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-6 w-auto dark:hidden" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-6 w-auto hidden dark:block" />
              <div className="text-xs font-bold tracking-tight">Service Contract</div>
            </div>
            <Link href="/" className="text-[11px] text-gray-500">← App</Link>
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
                      ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
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
