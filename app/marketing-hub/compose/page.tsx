'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { MarketingCampaignBuilder } from '@/components/marketing/MarketingCampaignBuilder'
import { MarketingStudioShell } from '@/components/marketing/MarketingStudioShell'

export default function MarketingComposePage() {
  return (
    <DashboardLayout fullBleed>
      <MarketingStudioShell
        title="AI Campaign Builder"
        subtitle="Brief → real HubSpot-backed context → newsletter preview + social variants → approval gate. Inspired by presentation.basheer.app."
        status="Phase 1"
      >
        <MarketingCampaignBuilder />
      </MarketingStudioShell>
    </DashboardLayout>
  )
}
