// Configurable dashboard widgets — Wrike-style "each card is a saved query".
// Persisted per-user in user_preferences (key: designs.widgets.v1).
// Schema is forward-compatible: bump the key suffix when shape changes.

export type WidgetSource = 'design-requests'

export type DueBucket = 'overdue' | 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'no_due' | 'later'

export interface WidgetFilters {
  status?: string[]                // ['in_progress', 'in_qc'] — empty = any
  assignee?: string | 'me' | 'unassigned' | 'any'  // staff id or sentinel
  due_bucket?: DueBucket[]         // multi
  venue_id?: string | 'any'
  priority?: 'high' | 'any'
  is_rando?: 'only' | 'exclude' | 'any'
  internal?: 'client' | 'internal' | 'any'
  search?: string                  // free-text on title/company/venue/tricode
}

export type WidgetGrouping = 'none' | 'status' | 'due_bucket' | 'assignee' | 'venue' | 'priority'

export type WidgetSort = 'due_asc' | 'due_desc' | 'newest' | 'oldest' | 'priority_first'

export type WidgetSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface DashboardWidget {
  id: string
  title: string
  source: WidgetSource
  filters: WidgetFilters
  grouping: WidgetGrouping
  sort: WidgetSort
  size: WidgetSize
  limit?: number                   // truncate the rendered list (default 50)
}

export interface DashboardPage {
  version: 1
  widgets: DashboardWidget[]
}

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: 'preset-my-queue',
    title: 'My queue',
    source: 'design-requests',
    filters: { assignee: 'me', status: ['request_submitted', 'in_queue', 'in_progress', 'in_qc'] },
    grouping: 'due_bucket',
    sort: 'due_asc',
    size: 'md',
    limit: 50,
  },
  {
    id: 'preset-overdue',
    title: 'Overdue',
    source: 'design-requests',
    filters: { due_bucket: ['overdue'] },
    grouping: 'assignee',
    sort: 'due_asc',
    size: 'md',
    limit: 30,
  },
  {
    id: 'preset-due-today',
    title: 'Due today',
    source: 'design-requests',
    filters: { due_bucket: ['today'] },
    grouping: 'none',
    sort: 'priority_first',
    size: 'md',
    limit: 30,
  },
  {
    id: 'preset-client-review',
    title: 'In client review',
    source: 'design-requests',
    filters: { status: ['client_review'] },
    grouping: 'none',
    sort: 'newest',
    size: 'md',
    limit: 30,
  },
]

export const STATUS_LABEL: Record<string, string> = {
  request_submitted: 'Submitted',
  in_queue: 'In Queue',
  in_progress: 'In Progress',
  in_qc: 'In QC',
  client_review: 'Client Review',
  approved: 'Approved',
  done: 'Done',
}

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: 'Overdue',
  today: 'Today',
  tomorrow: 'Tomorrow',
  this_week: 'This week',
  next_week: 'Next week',
  later: 'Later',
  no_due: 'No due date',
}

export function classifyDueBucket(due: string | null | undefined, todayIso: string): DueBucket {
  if (!due) return 'no_due'
  const d = String(due).slice(0, 10)
  if (d < todayIso) return 'overdue'
  if (d === todayIso) return 'today'
  const today = new Date(`${todayIso}T00:00:00Z`)
  const target = new Date(`${d}T00:00:00Z`)
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 1) return 'tomorrow'
  if (diffDays <= 7) return 'this_week'
  if (diffDays <= 14) return 'next_week'
  return 'later'
}

interface FilterableRequest {
  id: string
  status: string
  designer_id: string | null
  enterprise_contact_id: string | null
  venue_id: string | null
  due_date: string | null
  priority?: string | null
  is_rando?: boolean
  internal_category?: string | null
  job_title?: string
  company_name?: string | null
  venue_name?: string | null
  tricode?: string | null
  created_date?: string
}

export function applyWidget<T extends FilterableRequest>(
  items: T[],
  widget: DashboardWidget,
  ctx: { currentUserId: string; todayIso: string },
): T[] {
  const f = widget.filters
  const wantedStatuses = f.status?.length ? new Set(f.status) : null
  const wantedBuckets = f.due_bucket?.length ? new Set(f.due_bucket) : null
  const search = (f.search || '').trim().toLowerCase()

  const filtered = items.filter((item) => {
    if (wantedStatuses && !wantedStatuses.has(item.status)) return false

    if (f.assignee && f.assignee !== 'any') {
      if (f.assignee === 'unassigned') {
        if (item.designer_id || item.enterprise_contact_id) return false
      } else if (f.assignee === 'me') {
        if (!ctx.currentUserId) return false
        if (item.designer_id !== ctx.currentUserId && item.enterprise_contact_id !== ctx.currentUserId) return false
      } else {
        if (item.designer_id !== f.assignee && item.enterprise_contact_id !== f.assignee) return false
      }
    }

    if (wantedBuckets) {
      const bucket = classifyDueBucket(item.due_date, ctx.todayIso)
      if (!wantedBuckets.has(bucket)) return false
    }

    if (f.venue_id && f.venue_id !== 'any' && item.venue_id !== f.venue_id) return false

    if (f.priority === 'high' && item.priority !== 'high') return false

    if (f.is_rando === 'only' && !item.is_rando) return false
    if (f.is_rando === 'exclude' && item.is_rando) return false

    if (f.internal === 'client' && item.internal_category) return false
    if (f.internal === 'internal' && !item.internal_category) return false

    if (search) {
      const hay = `${item.job_title || ''} ${item.company_name || ''} ${item.venue_name || ''} ${item.tricode || ''}`.toLowerCase()
      if (!hay.includes(search)) return false
    }

    return true
  })

  const sorted = sortRequests(filtered, widget.sort)
  return widget.limit ? sorted.slice(0, widget.limit) : sorted
}

function sortRequests<T extends FilterableRequest>(items: T[], sort: WidgetSort): T[] {
  const copy = [...items]
  switch (sort) {
    case 'due_asc':
      return copy.sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
    case 'due_desc':
      return copy.sort((a, b) => (b.due_date || '0').localeCompare(a.due_date || '0'))
    case 'newest':
      return copy.sort((a, b) => (b.created_date || '').localeCompare(a.created_date || ''))
    case 'oldest':
      return copy.sort((a, b) => (a.created_date || '').localeCompare(b.created_date || ''))
    case 'priority_first': {
      const high = copy.filter(i => i.priority === 'high')
      const rest = copy.filter(i => i.priority !== 'high')
      return [...high, ...rest]
    }
    default:
      return copy
  }
}

export function groupBy<T extends FilterableRequest>(
  items: T[],
  grouping: WidgetGrouping,
  ctx: { todayIso: string; staffById: Record<string, string>; venueById: Record<string, string> },
): Array<{ key: string; label: string; items: T[] }> {
  if (grouping === 'none') return [{ key: 'all', label: '', items }]

  const buckets = new Map<string, T[]>()
  const labels = new Map<string, string>()
  const order: string[] = []

  const push = (key: string, label: string, item: T) => {
    if (!buckets.has(key)) {
      buckets.set(key, [])
      labels.set(key, label)
      order.push(key)
    }
    buckets.get(key)!.push(item)
  }

  for (const item of items) {
    if (grouping === 'status') {
      push(item.status, STATUS_LABEL[item.status] || item.status, item)
    } else if (grouping === 'due_bucket') {
      const b = classifyDueBucket(item.due_date, ctx.todayIso)
      push(b, DUE_BUCKET_LABEL[b], item)
    } else if (grouping === 'assignee') {
      const id = item.designer_id || item.enterprise_contact_id || ''
      const label = id ? (ctx.staffById[id] || 'Unknown') : 'Unassigned'
      push(id || 'unassigned', label, item)
    } else if (grouping === 'venue') {
      const id = item.venue_id || ''
      const label = id ? (ctx.venueById[id] || 'Unknown venue') : 'No venue'
      push(id || 'no-venue', label, item)
    } else if (grouping === 'priority') {
      const k = item.priority === 'high' ? 'high' : 'normal'
      push(k, k === 'high' ? 'High priority' : 'Normal priority', item)
    }
  }

  // Sort grouping keys naturally
  if (grouping === 'due_bucket') {
    const orderRank: DueBucket[] = ['overdue', 'today', 'tomorrow', 'this_week', 'next_week', 'later', 'no_due']
    order.sort((a, b) => orderRank.indexOf(a as DueBucket) - orderRank.indexOf(b as DueBucket))
  } else if (grouping === 'status') {
    const orderRank = ['request_submitted', 'in_queue', 'in_progress', 'in_qc', 'client_review', 'approved', 'done']
    order.sort((a, b) => orderRank.indexOf(a) - orderRank.indexOf(b))
  }

  return order.map((key) => ({ key, label: labels.get(key) || key, items: buckets.get(key)! }))
}

export async function loadDashboardPage(): Promise<DashboardPage> {
  try {
    const res = await fetch(`/api/preferences?key=designs.widgets.v1`)
    if (!res.ok) return { version: 1, widgets: DEFAULT_WIDGETS }
    const data = await res.json()
    if (!data?.value) return { version: 1, widgets: DEFAULT_WIDGETS }
    const parsed = JSON.parse(data.value)
    if (parsed?.version === 1 && Array.isArray(parsed.widgets)) return parsed as DashboardPage
    return { version: 1, widgets: DEFAULT_WIDGETS }
  } catch {
    return { version: 1, widgets: DEFAULT_WIDGETS }
  }
}

export async function saveDashboardPage(page: DashboardPage): Promise<void> {
  try {
    await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'designs.widgets.v1', value: JSON.stringify(page) }),
    })
  } catch {}
}

export function newBlankWidget(): DashboardWidget {
  return {
    id: `w-${Math.random().toString(36).slice(2, 10)}`,
    title: 'New widget',
    source: 'design-requests',
    filters: { assignee: 'any' },
    grouping: 'none',
    sort: 'due_asc',
    size: 'md',
    limit: 50,
  }
}
