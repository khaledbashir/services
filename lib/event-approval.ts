/**
 * Event approval — Joe 2026-08-17.
 *
 * The master schedule is the approved list. Home sporting events land there on
 * their own; anything else a feed turns up waits as a `suggested` row until the
 * venue lead accepts it, and a `rejected` row never comes back.
 *
 * Every surface that represents "the schedule" — the events list, the calendar,
 * the client portal, digests, reminders, CRM sync, reports, the AI skills —
 * filters through `approvedOnly()`. The only reads that deliberately skip it
 * are the approval queue itself and single-event lookups by id, where the lead
 * has to be able to open the thing they are deciding on.
 */

export type EventApprovalStatus = 'approved' | 'suggested' | 'rejected'

export const EVENT_APPROVAL_STATUSES: readonly EventApprovalStatus[] = [
  'approved',
  'suggested',
  'rejected',
] as const

/**
 * SQL predicate restricting a query to the master schedule.
 *
 * COALESCE guards the window between this deploy and the migration, and any
 * row a future insert path forgets to stamp — an unstamped event behaves as
 * approved, which matches the column default and keeps a missed insert from
 * silently emptying someone's schedule.
 */
export function approvedOnly(alias = 'e'): string {
  return `COALESCE(${alias}.approval_status, 'approved') = 'approved'`
}

/** Same predicate, prefixed for appending to an existing WHERE clause. */
export function andApprovedOnly(alias = 'e'): string {
  return `AND ${approvedOnly(alias)}`
}

export function isEventApprovalStatus(value: unknown): value is EventApprovalStatus {
  return typeof value === 'string' && (EVENT_APPROVAL_STATUSES as readonly string[]).includes(value)
}

/**
 * `?approval=` on the events list. Defaults to the master schedule so every
 * existing caller keeps its current meaning without passing the param.
 */
export function parseApprovalParam(raw: string | null | undefined): EventApprovalStatus | 'all' {
  if (raw === 'all') return 'all'
  return isEventApprovalStatus(raw) ? raw : 'approved'
}

export function approvalLabel(status: EventApprovalStatus): string {
  if (status === 'approved') return 'On the schedule'
  if (status === 'suggested') return 'Awaiting approval'
  return 'Rejected'
}
