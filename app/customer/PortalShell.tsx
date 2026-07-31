'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import CopilotPanel from './CopilotPanel'
import { CustomerTicketConversation } from '@/components/customer-ticket-conversation'
import { ResizableSidePanel } from '@/components/resizable-side-panel'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  CUSTOMER_PORTAL_TABS,
  portalTabForPath,
  type CustomerPortalTabKey,
} from '@/lib/customer-portal-tabs'

export interface PortalUser {
  fullName: string
  clientName: string | null
  email?: string
  visibleTabs: CustomerPortalTabKey[]
  impersonating?: boolean
  impersonatorName?: string
}
export interface PortalVenue { id: string; name: string }

interface PortalCtx {
  user: PortalUser | null
  venues: PortalVenue[]
  refreshSignal: number
  selectedVenueId: string
  selectedVenue: PortalVenue | null
  setSelectedVenueId: (venueId: string) => void
  bumpRefresh: () => void
}

const Ctx = createContext<PortalCtx>({
  user: null,
  venues: [],
  refreshSignal: 0,
  selectedVenueId: '',
  selectedVenue: null,
  setSelectedVenueId: () => {},
  bumpRefresh: () => {},
})
export const usePortal = () => useContext(Ctx)

const NAV = [
  {
    key: 'overview' as const,
    href: '/customer', label: 'Overview', exact: true,
    icon: <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />,
  },
  {
    key: 'requests' as const,
    href: '/customer/requests', label: 'Requests', exact: false,
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 13h6" /><path d="M9 17h6" /></>,
  },
  {
    key: 'displays' as const,
    href: '/customer/displays', label: 'Service Health', exact: false,
    icon: <><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>,
  },
  {
    key: 'diagnosis' as const,
    href: '/customer/diagnosis', label: 'AI Diagnosis', exact: false,
    icon: <><path d="M12 2v4" /><path d="M12 18v4" /><path d="m4.93 4.93 2.83 2.83" /><path d="m16.24 16.24 2.83 2.83" /><path d="M2 12h4" /><path d="M18 12h4" /><path d="m4.93 19.07 2.83-2.83" /><path d="m16.24 7.76 2.83-2.83" /><circle cx="12" cy="12" r="3" /></>,
  },
  {
    key: 'documents' as const,
    href: '/customer/documents', label: 'Documents', exact: false,
    icon: <><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></>,
  },
  {
    key: 'approvals' as const,
    href: '/customer/approvals', label: 'Approvals', exact: false,
    icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  },
  {
    key: 'reports' as const,
    href: '/customer/reports', label: 'Reports', exact: false,
    icon: <><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-7" /></>,
  },
  {
    key: 'orientation' as const,
    href: '/customer/orientation', label: 'Orientation', exact: false,
    icon: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
  },
]

export default function PortalShell({ children, active }: { children: React.ReactNode; active?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<PortalUser | null>(null)
  const [venues, setVenues] = useState<PortalVenue[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [selectedVenueId, setSelectedVenueIdState] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState('')

  useEffect(() => {
    let cancelled = false
    const loadPortal = async () => {
      try {
        const meResponse = await fetch('/api/customer/me')
        if (meResponse.status === 401) {
          router.push('/customer/login')
          return
        }
        if (!meResponse.ok) throw new Error(`Portal session request failed (${meResponse.status})`)
        const data = await meResponse.json()
        if (cancelled) return
        const nextVenues: PortalVenue[] = data.venues || []
        setUser(data.user)
        setVenues(nextVenues)

        const preferenceResponse = await fetch('/api/customer/ui-preferences?key=customerPortal.selectedVenueId')
        if (!preferenceResponse.ok) {
          throw new Error(`Portal preference request failed (${preferenceResponse.status})`)
        }
        const preference = await preferenceResponse.json()
        if (cancelled) return
        const storedVenueId = preference.value
        const storedIsValid = storedVenueId === 'all'
          || nextVenues.some((venue) => venue.id === storedVenueId)
        setSelectedVenueIdState(
          storedIsValid
            ? storedVenueId
            : nextVenues.length > 1
              ? 'all'
              : nextVenues[0]?.id || ''
        )
      } catch (error) {
        console.error('Failed to load customer portal shell:', error)
        if (!cancelled) router.push('/customer/login')
      }
    }
    void loadPortal()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!user) return
    const currentTab = portalTabForPath(pathname)
    if (!currentTab || user.visibleTabs.includes(currentTab)) return
    const firstVisible = CUSTOMER_PORTAL_TABS.find((tab) => user.visibleTabs.includes(tab.key))
    router.replace(firstVisible?.href || '/customer/login')
  }, [pathname, router, user])

  const supportsTicketSplitView = pathname === '/customer' || pathname === '/customer/requests'

  useEffect(() => {
    if (!supportsTicketSplitView) setSelectedTicketId('')
  }, [supportsTicketSplitView])

  async function logout() {
    await fetch('/api/customer/auth/logout', { method: 'POST' })
    router.push('/customer/login')
  }

  async function exitImpersonation() {
    const res = await fetch('/api/customer/auth/exit-impersonation', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    window.location.href = data.redirect || '/admin/portal-users'
  }

  const isActive = (item: typeof NAV[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  const visibleNav = NAV.filter((item) => user?.visibleTabs?.includes(item.key))
  const selectedVenue = venues.find((venue) => venue.id === selectedVenueId) || null

  async function selectVenue(venueId: string) {
    setSelectedVenueIdState(venueId)
    try {
      const response = await fetch('/api/customer/ui-preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'customerPortal.selectedVenueId', value: venueId }),
      })
      if (!response.ok) throw new Error(`Portal preference request failed (${response.status})`)
    } catch (error) {
      console.error('Failed to save selected portal venue:', error)
    }
  }

  function openTicketInSplitView(event: React.MouseEvent<HTMLElement>) {
    if (
      !supportsTicketSplitView
      || event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
    ) return

    const target = event.target
    if (!(target instanceof Element)) return
    const anchor = target.closest<HTMLAnchorElement>('a[href]')
    if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return

    const url = new URL(anchor.href, window.location.origin)
    if (url.origin !== window.location.origin) return
    const ticketMatch = url.pathname.match(/^\/customer\/tickets\/([^/]+)\/?$/)
    if (!ticketMatch) return

    event.preventDefault()
    setSelectedTicketId(decodeURIComponent(ticketMatch[1]))
  }

  const nav = (onNavigate?: () => void) => (
    <>
      <div className="cp-side-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7" />
        {sidebarOpen && (
          <div className="min-w-0">
            <div className="cp-header-tag">Customer Portal</div>
          </div>
        )}
      </div>
      <nav className="cp-side-nav">
        {visibleNav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`cp-side-link ${isActive(item) ? 'is-active' : ''}`}
            title={item.label}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
      <div className="cp-side-foot">
        {sidebarOpen && user && (
          <div className="min-w-0">
            <div className="cp-side-user">{user.fullName}</div>
            <button onClick={logout} className="cp-side-signout">Sign out</button>
          </div>
        )}
        {!sidebarOpen && (
          <button onClick={logout} className="cp-side-link" title="Sign out">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
            </svg>
          </button>
        )}
      </div>
    </>
  )

  return (
    <Ctx.Provider value={{
      user,
      venues,
      refreshSignal,
      selectedVenueId,
      selectedVenue,
      setSelectedVenueId: (venueId) => void selectVenue(venueId),
      bumpRefresh: () => setRefreshSignal(x => x + 1),
    }}>
      <div className={`cp-shell ${user?.impersonating ? 'is-impersonating' : ''}`}>
        {user?.impersonating && (
          <div className="cp-imp-bar">
            <div className="cp-imp-bar-inner">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              <span className="cp-imp-bar-text">
                Viewing as <strong>{user.fullName}</strong>
                {user.clientName ? ` · ${user.clientName}` : ''}
                <span className="cp-imp-bar-note"> — read-only</span>
              </span>
              <button onClick={exitImpersonation} className="cp-imp-bar-exit">
                Exit
              </button>
            </div>
          </div>
        )}
        <aside className={`cp-side ${sidebarOpen ? '' : 'is-collapsed'} hidden md:flex`}>
          {nav()}
        </aside>

        {mobileOpen && (
          <div className="cp-side-overlay md:hidden" onClick={() => setMobileOpen(false)}>
            <aside className="cp-side is-mobile" onClick={e => e.stopPropagation()}>
              {nav(() => setMobileOpen(false))}
            </aside>
          </div>
        )}

        <div className="cp-shell-main">
          <div className="cp-topbar">
            <button
              className="cp-topbar-toggle hidden md:inline-flex items-center justify-center"
              onClick={() => setSidebarOpen(o => !o)}
              aria-label="Toggle sidebar"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            <button
              className="cp-topbar-toggle inline-flex md:hidden items-center justify-center"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
            </button>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold" style={{ color: 'var(--anc-text)' }}>
                {active || 'Customer Portal'}
              </div>
            </div>
            {venues.length > 1 && (
              <label className="hidden items-center gap-2 sm:flex">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--anc-muted)' }}>Viewing</span>
                <select
                  value={selectedVenueId}
                  onChange={(event) => void selectVenue(event.target.value)}
                  className="h-9 max-w-56 rounded-lg border px-3 text-sm font-medium outline-none"
                  style={{
                    borderColor: 'var(--anc-border)',
                    color: 'var(--anc-text)',
                    backgroundColor: 'var(--anc-surface-raised)',
                  }}
                  aria-label="Venue being viewed"
                >
                  <option value="all">All venues</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name}</option>
                  ))}
                </select>
              </label>
            )}
            <ThemeToggle compact />
            {user && <div className="cp-topbar-user hidden lg:block">{user.fullName}</div>}
          </div>
          <main className="cp-shell-content" onClickCapture={openTicketInSplitView}>{children}</main>
        </div>

        <CopilotPanel
          venueId={selectedVenueId}
          onTicketCreated={() => setRefreshSignal(x => x + 1)}
        />
        <ResizableSidePanel
          open={Boolean(selectedTicketId) && supportsTicketSplitView}
          onClose={() => setSelectedTicketId('')}
          preferenceKey="customerPortal.ticketPanel"
          preferencesEndpoint="/api/customer/ui-preferences"
          ariaLabel="Service request conversation"
          defaultWidth={760}
          minWidth={420}
          maxWidth={1180}
          panelClassName="bg-[var(--anc-page)]"
        >
          {selectedTicketId && (
            <CustomerTicketConversation
              ticketId={selectedTicketId}
              embedded
              onClose={() => setSelectedTicketId('')}
              onUpdated={() => setRefreshSignal((current) => current + 1)}
            />
          )}
        </ResizableSidePanel>
      </div>
    </Ctx.Provider>
  )
}
