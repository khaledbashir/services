'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import { DesignDetailBody } from '@/components/design-detail'

// The standalone ticket page — the shared detail body wrapped in dashboard chrome.
// The same DesignDetailBody renders inside the Design board's right-hand panel
// (Charlie 2026-07-15) so both surfaces stay in sync from one implementation.
export default function DesignRequestDetailPage({ params }: { params: { id: string } }) {
  return (
    <DashboardLayout>
      <DesignDetailBody id={params.id} />
    </DashboardLayout>
  )
}
