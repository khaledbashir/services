'use client'

import { TicketDetail } from '@/components/ticket-detail'

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  return <TicketDetail params={params} />
}
