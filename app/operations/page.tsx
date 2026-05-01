'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

export default function OperationsPage() {
  return (
    <DashboardLayout fullBleed>
      <iframe
        src="https://ops.ancsports.net/"
        title="ANC Operations"
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
          display: 'block',
          margin: 0,
          padding: 0,
        }}
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </DashboardLayout>
  )
}
