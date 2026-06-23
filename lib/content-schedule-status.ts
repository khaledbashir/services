export const CONTENT_SCHEDULE_STATUSES = [
  { key: 'ready', label: 'Ready' },
  { key: 'in_queue', label: 'In Queue' },
  { key: 'scheduled_to_launch', label: 'Scheduled To Launch' },
  { key: 'content_live', label: 'Content Live' },
  { key: 'confirmed_live', label: 'Confirmed Live with Client' },
  { key: 'removed', label: 'Removed' },
  { key: 'confirmed_removed', label: 'Confirmed Removed with Client' },
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
