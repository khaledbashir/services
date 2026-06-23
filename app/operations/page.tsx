'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

const OPS_WORKSPACE_URL = 'https://nocodb.ancsports.net/'

export default function OperationsPage() {
  return (
    <DashboardLayout fullBleed>
      <iframe
        src={OPS_WORKSPACE_URL}
        title="ANC Operations"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </DashboardLayout>
  )
}
