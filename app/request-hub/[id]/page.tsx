'use client'

import { DashboardLayout } from '@/components/dashboard-layout'
import RequestDetailBody from '@/components/request-hub/request-detail'
import Link from 'next/link'

export default function RequestDetailPage({ params }: { params: { id: string } }) {
  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Link href="/request-hub" className="text-xs font-medium text-zinc-400 hover:text-zinc-600">
          ← Request Hub
        </Link>
        <RequestDetailBody id={params.id} />
      </div>
    </DashboardLayout>
  )
}
