import type { Metadata } from 'next'
import { Anybody } from 'next/font/google'
import LiveShowcaseClient from './LiveShowcaseClient'

export const dynamic = 'force-dynamic'

// The Kinetic Max typeface — variable weight + width, self-hosted by Next.
const anybody = Anybody({
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  variable: '--font-anybody',
})

export const metadata: Metadata = {
  title: 'ANC — Live Service Operations',
  description:
    'A live national view of ANC Sports service operations: every event coordinated, every venue, every night, across America.',
}

export default function LivePage() {
  return (
    <div className={anybody.variable}>
      <LiveShowcaseClient />
    </div>
  )
}
