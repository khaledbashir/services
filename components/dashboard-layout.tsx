'use client'

import { usePathname } from 'next/navigation'
import { AiAssistant } from './ai-assistant'
import { AiUiDriver } from './ai-ui-driver'
import { GlobalSearch } from './global-search'
import { Sidebar } from './sidebar'
import { WipBanner } from './wip-banner'

const WIP_PREFIXES = [
  '/maintenance',
  '/walkthroughs',
  '/checklists',
  '/rma',
  '/parts-orders',
  '/parts',
  '/designs',
  '/cg-designs',
  '/content-schedules',
  '/prints',
  '/hours-budgets',
  '/time-entries',
]

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ''
  const isWip = WIP_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="lg:ml-60 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          {isWip && <WipBanner />}
          <div className="p-4 pt-16 lg:p-8 lg:pt-8 max-w-screen-xl">
            <div className="mb-4 flex justify-end lg:mb-6">
              <GlobalSearch />
            </div>
            {children}
          </div>
        </div>
      </div>
      <AiAssistant />
      <AiUiDriver />
    </div>
  )
}
