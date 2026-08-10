interface MergedTicketReference {
  merged_into_ticket_id?: string | null
  merged_into_ticket_number?: number | string | null
}

export interface MergedTicketWriteError {
  error: string
  merged_into_ticket_id: string
  merged_into_ticket_number: number | string | null
}

export function mergedTicketWriteError(
  ticket: MergedTicketReference
): MergedTicketWriteError | null {
  if (!ticket.merged_into_ticket_id) return null

  const ticketNumber = ticket.merged_into_ticket_number
  const primaryLabel = ticketNumber === null || ticketNumber === undefined
    ? 'the primary ticket'
    : `T-${String(ticketNumber).padStart(5, '0')}`

  return {
    error: `This ticket was merged into ${primaryLabel}. Continue work on the primary ticket.`,
    merged_into_ticket_id: ticket.merged_into_ticket_id,
    merged_into_ticket_number: ticketNumber ?? null,
  }
}
