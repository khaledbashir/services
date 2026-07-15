'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { AdCreativeStudio } from '@/components/marketing/AdCreativeStudio'

export default function AdCreativeStudioPage() {
  return (
    <DashboardLayout fullBleed>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#0a0b10] p-3 md:p-5">
        <AdCreativeStudio />
      </div>
    </DashboardLayout>
  )
}
