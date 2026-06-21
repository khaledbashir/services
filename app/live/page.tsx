import type { Metadata } from 'next'
import LiveShowcaseClient from './LiveShowcaseClient'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'ANC — Live Service Operations',
  description:
    'A live national view of ANC Sports service operations: every event coordinated, every venue, every night, across America.',
}

export default function LivePage() {
  return <LiveShowcaseClient />
}
