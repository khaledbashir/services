'use client'

import PortalShell from '../../PortalShell'
import { CustomerTicketConversation } from '@/components/customer-ticket-conversation'

export default function CustomerTicketPage({ params }: { params: { id: string } }) {
  return (
    <PortalShell active="Requests">
      <CustomerTicketConversation ticketId={params.id} />
    </PortalShell>
  )
}
