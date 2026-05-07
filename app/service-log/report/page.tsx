import { Suspense } from 'react'
import ServiceReportClient from './ServiceReportClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ServiceReportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, color: '#9ca3af' }}>Loading report...</div>}>
      <ServiceReportClient />
    </Suspense>
  )
}
