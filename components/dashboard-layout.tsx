'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AiAssistant } from './ai-assistant'
import { AiUiDriver } from './ai-ui-driver'
import { GlobalSearch } from './global-search'
import { Sidebar } from './sidebar'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  // When the AI (or any code) fires "anc:data-refresh", remount the page tree
  // by bumping this key. That forces every child's useEffect/useState to
  // re-initialize — so any page that fetches on mount re-fetches. The AI
  // overlay sits outside the keyed subtree so the chat state survives.
  const [refreshKey, setRefreshKey] = useState(0)
  useEffect(() => {
    const bump = () => setRefreshKey((k) => k + 1)
    window.addEventListener('anc:data-refresh', bump)
    return () => window.removeEventListener('anc:data-refresh', bump)
  }, [])

  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div
        className="lg:ml-60 flex-1 flex flex-col overflow-hidden transition-[padding] duration-200 ease-out"
        style={{ paddingRight: 'var(--ai-panel-shrink, 0px)' }}
      >
        <div className="flex-1 overflow-auto">
          <div className="w-full max-w-[1680px] p-4 pt-16 lg:p-6 lg:pt-6 2xl:p-8 2xl:pt-8">
            <div className="mb-4 flex justify-end lg:mb-6">
              <GlobalSearch />
            </div>
            <div key={`${pathname}:${refreshKey}`}>{children}</div>
          </div>
        </div>
      </div>
      <AiAssistant />
      <AiUiDriver />
      {/* Mirror --ai-panel-width into --ai-panel-shrink only above the sm
          breakpoint so mobile keeps overlay behavior (the panel fills the
          screen, content underneath doesn't matter). */}
      <style jsx global>{`
        :root { --ai-panel-shrink: 0px; }
        @media (min-width: 640px) {
          :root { --ai-panel-shrink: var(--ai-panel-width, 0px); }
        }
      `}</style>
    </div>
  )
}
