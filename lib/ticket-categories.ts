// Client-facing ticket category taxonomy (Chris D's list, 2026-07-29).
// Two levels: category (required on the customer portal) + optional specific issue.
// Category values are stored in tickets.category; the specific issue in tickets.subcategory.

export interface TicketCategory {
  value: string
  label: string
  issues: string[]
}

export const CLIENT_TICKET_CATEGORIES: TicketCategory[] = [
  {
    value: 'stats_data',
    label: 'Stats / Data',
    issues: ['Scores or stats not updating', 'Wrong data showing', 'Data feed down', 'Clock or timing issue'],
  },
  {
    value: 'led_display',
    label: 'LED Display',
    issues: ['Display down / no image', 'Dead or stuck panel', 'Flickering or artifacts', 'Color or brightness issue', 'Physical damage'],
  },
  {
    value: 'computer_server',
    label: 'Computer / Server',
    issues: ["Computer won't boot", 'Server error or crash', 'Slow performance', 'Login or access issue'],
  },
  {
    value: 'livesync_software',
    label: 'LiveSync Software',
    issues: ["Software won't launch", 'Playback or scheduling issue', 'Displays out of sync', 'Error message on screen'],
  },
  {
    value: 'video_signal',
    label: 'Video / Signal',
    issues: ['No signal', 'Signal dropping out', 'Wrong input or source', 'Video quality issue'],
  },
  {
    value: 'network_connectivity',
    label: 'Network / Connectivity',
    issues: ['Network down', 'Intermittent connection', 'Device offline', 'Remote access issue'],
  },
  {
    value: 'audio',
    label: 'Audio',
    issues: ['No audio', 'Distorted audio', 'Volume issue', 'Audio out of sync'],
  },
  {
    value: 'content',
    label: 'Content',
    issues: ['New content request', 'Content not playing', 'Wrong content showing', 'Content update needed'],
  },
  {
    value: 'other_equipment',
    label: 'Other Equipment',
    issues: ['Camera', 'Control room equipment', 'Cabling', 'Other'],
  },
  {
    value: 'service_request',
    label: 'Service Request',
    issues: ['Scheduled maintenance', 'Training request', 'Equipment move or install', 'General question'],
  },
  {
    value: 'urgent_issue',
    label: 'Urgent Issue',
    issues: ['Show-critical failure', 'Multiple displays down', 'Safety concern', 'Other urgent issue'],
  },
]

// Legacy internal categories that already exist on staff-created tickets.
const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  operational: 'Operational',
  general: 'General',
  voicemail: 'Voicemail',
}

export const TICKET_CATEGORY_LABELS: Record<string, string> = {
  ...LEGACY_CATEGORY_LABELS,
  ...Object.fromEntries(CLIENT_TICKET_CATEGORIES.map(c => [c.value, c.label])),
}

const CLIENT_CATEGORY_VALUES = new Set(CLIENT_TICKET_CATEGORIES.map(c => c.value))

export function isClientTicketCategory(value: unknown): value is string {
  return typeof value === 'string' && CLIENT_CATEGORY_VALUES.has(value)
}

// Human label for any stored category value (slug, legacy value, or free text).
export function ticketCategoryLabel(value: string | null | undefined): string {
  if (!value) return 'General'
  return TICKET_CATEGORY_LABELS[value] || value.replace(/_/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
}
