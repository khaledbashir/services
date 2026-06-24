export const CONTENT_SCHEDULE_STATUSES = [
  { key: 'ready', label: 'Ready' },
  { key: 'in_queue', label: 'In Queue' },
  // Additive statuses (Alexis 2026-06-24) — front-of-pipeline approval lifecycle
  // pulled in from the Wrike content flow. Inserted between In Queue and
  // Scheduled To Launch so the pipeline reads in order. Confirm exact labels
  // with Alexis (Open Question Q1).
  { key: 'awaiting_files', label: 'Awaiting Files' },
  { key: 'awaiting_approval', label: 'Awaiting Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'needs_revision', label: 'Needs Revision' },
  { key: 'scheduled_to_launch', label: 'Scheduled To Launch' },
  { key: 'content_live', label: 'Content Live' },
  { key: 'confirmed_live', label: 'Confirmed Live with Client' },
  { key: 'removed', label: 'Removed' },
  { key: 'confirmed_removed', label: 'Confirmed Removed with Client' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'done', label: 'Done' },
] as const

export type ContentScheduleStatus = typeof CONTENT_SCHEDULE_STATUSES[number]['key']

const VALID_STATUSES = new Set<string>(CONTENT_SCHEDULE_STATUSES.map((status) => status.key))

export function normalizeContentScheduleStatus(status: string | null | undefined): ContentScheduleStatus {
  const raw = String(status || '').trim().toLowerCase()
  if (!raw) return 'in_queue'

  const aliases: Record<string, ContentScheduleStatus> = {
    queued: 'in_queue',
    scheduled: 'scheduled_to_launch',
    live: 'content_live',
    confirmed: 'confirmed_live',
    confirmed_live_with_client: 'confirmed_live',
    content_removed: 'removed',
    removed_with_client: 'confirmed_removed',
    confirmed_removed_with_client: 'confirmed_removed',
    completed: 'done',
    // Additive-status aliases (Alexis 2026-06-24)
    awaiting_file: 'awaiting_files',
    waiting_files: 'awaiting_files',
    files_pending: 'awaiting_files',
    pending_approval: 'awaiting_approval',
    waiting_approval: 'awaiting_approval',
    needs_revisions: 'needs_revision',
    revision: 'needs_revision',
    revisions: 'needs_revision',
    hold: 'on_hold',
    held: 'on_hold',
  }

  if (raw.startsWith('status_')) return normalizeContentScheduleStatus(raw.slice(7))
  if (VALID_STATUSES.has(raw)) return raw as ContentScheduleStatus
  return aliases[raw] || 'in_queue'
}

export function labelForContentScheduleStatus(status: string | null | undefined) {
  const normalized = normalizeContentScheduleStatus(status)
  return CONTENT_SCHEDULE_STATUSES.find((item) => item.key === normalized)?.label || normalized
}

export function isContentLiveStatus(status: string | null | undefined) {
  const normalized = normalizeContentScheduleStatus(status)
  return normalized === 'content_live' || normalized === 'confirmed_live'
}
