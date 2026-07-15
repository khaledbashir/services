'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { MarketingAgentStudio } from '@/components/marketing/MarketingAgentStudio'

export default function MarketingStudioPage() {
  return (
    <DashboardLayout fullBleed>
      <div className="flex h-full min-h-0 flex-col bg-[#0a0b10] p-3 md:p-5">
        <MarketingAgentStudio />
      </div>
    </DashboardLayout>
  )
}
