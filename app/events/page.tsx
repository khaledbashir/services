import { Suspense } from 'react'
import EventsClient from './EventsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function EventsPage() {
  return (
    <Suspense fallback={null}>
      <EventsClient />
    </Suspense>
  )
}
