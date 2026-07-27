'use client'

import { useParams } from 'next/navigation'
import { EventDetailBody } from '@/components/event-detail'

export default function EventDetailPage() {
  const params = useParams()
  return <EventDetailBody id={params?.id as string} />
}
