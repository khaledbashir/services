import type { Metadata } from 'next'
import TransparencyDashboard from './TransparencyDashboard'
import AutoRefresh from './AutoRefresh'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'ANC Sports — Service Transparency',
  description: 'Live status of the ANC service contract — credit used, warranty in force, and what is covered.',
  robots: { index: false, follow: false },
}

export default function TransparencyPage() {
  return (
    <>
      <AutoRefresh />
      <TransparencyDashboard />
    </>
  )
}
