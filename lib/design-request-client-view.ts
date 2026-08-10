/**
 * Client-facing presentation of a design request (Charlie 2026-08-10: "this
 * way client can see their design request and approvals").
 *
 * Internal pipeline states are collapsed into the three things a client can
 * act on: it is with ANC, it is waiting on them, or it is finished. Designer
 * assignment, hour estimates and QC internals are never surfaced.
 */

export type DesignClientState = 'in_progress' | 'awaiting_your_review' | 'approved' | 'complete'

export interface DesignRequestRow {
  status: string | null
  /** Latest proof response from proof_shares: 'approved' | 'changes_requested' | null */
  proofResponse?: string | null
  hasProof?: boolean
}

export interface DesignClientPresentation {
  state: DesignClientState
  label: string
  /** True when the client is the one holding the job up. */
  needsClientAction: boolean
}

const PRESENTATION: Record<DesignClientState, { label: string; needsClientAction: boolean }> = {
  in_progress: { label: 'In progress with ANC', needsClientAction: false },
  awaiting_your_review: { label: 'Awaiting your review', needsClientAction: true },
  approved: { label: 'Approved', needsClientAction: false },
  complete: { label: 'Complete', needsClientAction: false },
}

export function presentDesignRequest(row: DesignRequestRow): DesignClientPresentation {
  const status = String(row.status || '').toLowerCase()
  const response = String(row.proofResponse || '').toLowerCase()

  // An explicit client decision always wins over the internal pipeline state —
  // a request the client already approved must never read as "awaiting you".
  if (response === 'approved') return { state: 'approved', ...PRESENTATION.approved }
  if (response === 'changes_requested') {
    return { state: 'in_progress', ...PRESENTATION.in_progress }
  }

  if (status === 'client_review' || (row.hasProof && status !== 'done' && status !== 'approved')) {
    return { state: 'awaiting_your_review', ...PRESENTATION.awaiting_your_review }
  }
  if (status === 'approved') return { state: 'approved', ...PRESENTATION.approved }
  if (status === 'done') return { state: 'complete', ...PRESENTATION.complete }

  return { state: 'in_progress', ...PRESENTATION.in_progress }
}
