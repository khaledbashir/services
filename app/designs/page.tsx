'use client'

import { FormEvent, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KanbanBoard, type KanbanColumn } from '@/components/kanban-board'
import { DesignDetailBody } from '@/components/design-detail'
import { DashboardLayoutSettings, applyLayoutPrefs, loadLayoutPrefs, DEFAULT_LAYOUT_PREFS, type DashboardLayoutPrefs } from '@/components/dashboard-layout-settings'
import { DashboardWidgetCard, WidgetBoardEmptyState } from '@/components/dashboard-widget'
import { DashboardWidgetConfig } from '@/components/dashboard-widget-config'
import {
  DashboardWidget,
  loadDashboardPage,
  saveDashboardPage,
  newBlankWidget,
  normalizeSearch,
} from '@/lib/dashboard-widgets'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { formatDate } from '@/lib/format-date'
import { normalizeTriCode, venueTriCodes } from '@/lib/tricodes'
import { INTERNAL_CATEGORIES } from '@/lib/design-internal-category'

interface DesignRequest {
  id: string
  job_title: string
  company_name: string | null
  tricode: string | null
  venue_name: string | null
  venue_id: string | null
  designer_name: string | null
  designer_id: string | null
  enterprise_contact_name: string | null
  enterprise_contact_id: string | null
  designers?: AssignmentPerson[]
  enterprise_contacts?: AssignmentPerson[]
  status: string
  hours_estimated: number | null
  hours_spent: number | null
  due_date: string | null
  boards_requested: string | null
  sizes_requested: string | null
  created_date: string
  is_rando?: boolean
  internal_category?: string | null
  priority?: string | null
}

interface CgWidgetRequest {
  id: string
  status: string
  designer_id: string | null
  designer_name: string | null
  enterprise_contact_id: string | null
  enterprise_contact_name?: string | null
  venue_id: string | null
  venue_name: string | null
  due_date: string | null
  job_title: string
  company_name?: string | null
  tricode?: string | null
  created_date?: string
  designers?: AssignmentPerson[]
  enterprise_contacts?: AssignmentPerson[]
}

interface AssignmentPerson { id: string; full_name: string; is_primary?: boolean }
interface Venue {
  id: string
  name: string
  sports?: string[] | null
  venue_type?: string | null
  aliases?: string[] | null
}
interface Staff { id: string; full_name: string }

function assignmentNames(people: AssignmentPerson[] | undefined, fallback?: string | null) {
  const names = (people || []).map((person) => person.full_name).filter(Boolean)
  if (!names.length && fallback) names.push(fallback)
  if (!names.length) return ''
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function hasAssignment(item: DesignRequest, staffId: string | null | undefined) {
  if (!staffId) return false
  if (item.designer_id === staffId || item.enterprise_contact_id === staffId) return true
  return [...(item.designers || []), ...(item.enterprise_contacts || [])].some((person) => person.id === staffId)
}

// League buckets Alexis named on the 2026-04-29 call: "college / venue / places,
// MLB, MiLB, NBA, WNBA, Pro Hockey, NFL." Order matters — the rail renders
// these in the order listed here so familiar groups stay near the top.
const LEAGUE_BUCKETS = [
  { key: 'college', label: 'College' },
  { key: 'mlb', label: 'MLB' },
  { key: 'milb', label: 'MiLB' },
  { key: 'nba', label: 'NBA' },
  { key: 'wnba', label: 'WNBA' },
  { key: 'nhl', label: 'Pro Hockey' },
  { key: 'nfl', label: 'NFL' },
  { key: 'mls', label: 'MLS' },
  { key: 'ooh', label: 'OOH / Out-of-Home' },
  { key: 'other', label: 'Other Places' },
] as const

type LeagueKey = typeof LEAGUE_BUCKETS[number]['key']

function classifyVenue(v: Venue): LeagueKey {
  // Sports come from the venue's linked clients (clients.sport). One venue
  // can have multiple — we pick the first match against our bucket order
  // so a Penn-State-and-NCAA venue lands in College, not in MLB by accident.
  const sports = (v.sports || []).map((s) => s.toLowerCase())
  const looksLike = (needle: string) => sports.some((s) => s.includes(needle))

  if (looksLike('college') || looksLike('ncaa') || looksLike('university')) return 'college'
  if (looksLike('milb') || looksLike('minor league')) return 'milb'
  if (looksLike('mlb') || looksLike('baseball')) return 'mlb'
  if (looksLike('wnba')) return 'wnba'
  if (looksLike('nba') || looksLike('basketball')) return 'nba'
  if (looksLike('nhl') || looksLike('hockey')) return 'nhl'
  if (looksLike('nfl') || looksLike('football')) return 'nfl'
  if (looksLike('mls') || looksLike('soccer')) return 'mls'

  // No sport association — fall through to the venue's own type.
  if ((v.venue_type || '').toLowerCase() === 'ooh') return 'ooh'
  return 'other'
}

const statusColumns: KanbanColumn[] = [
  { key: 'request_submitted', label: 'Submitted', accent: 'bg-sky-500' },
  { key: 'in_queue', label: 'In Queue', accent: 'bg-violet-500' },
  { key: 'in_progress', label: 'In Progress', accent: 'bg-amber-500' },
  { key: 'in_qc', label: 'In QC', accent: 'bg-orange-500' },
  { key: 'client_review', label: 'Client Review', accent: 'bg-blue-500' },
  { key: 'approved', label: 'Approved', accent: 'bg-emerald-500' },
  { key: 'done', label: 'Done', accent: 'bg-zinc-400' },
] as const

const statusTone: Record<string, string> = {
  request_submitted: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
  in_queue: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  in_progress: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  in_qc: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300',
  client_review: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  approved: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  done: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300',
  cancelled: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
}

// Keep the ticket panel readable and never let it swallow the whole board:
// min 380px, max the smaller of 1200px or 95% of the viewport.
function clampPanelWidth(w: number): number {
  const max = typeof window !== 'undefined' ? Math.min(1200, window.innerWidth * 0.95) : 1200
  return Math.max(380, Math.min(w, max))
}

export default function DesignsPage() {
  const router = useRouter()
  const { showToast } = useToast()
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>([])
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [sortKey, setSortKey] = useState<string>('newest')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  // Brief gating (Charlie 2026-08-19, Daniel Apr 2026). When the server judges a
  // brief too thin to work from it answers 422 with what is missing. Holding it
  // here rather than in formError lets the panel list the gaps and offer a
  // deliberate override, instead of a red line the requester cannot act on.
  const [briefMissing, setBriefMissing] = useState<string[] | null>(null)
  // Per-designer + randos filters added 2026-04-23 per Alexis's ask:
  //   "The ability to have dashboards specific to the person will be very helpful."
  // `designerFilter` = 'all' | 'mine' | <staff_id>
  // `randoFilter`    = 'all' | 'only'  | 'exclude'
  const [designerFilter, setDesignerFilter] = useState<string>('all')
  const [randoFilter, setRandoFilter] = useState<'all' | 'only' | 'exclude'>('all')
  // Alexis's internal-job tag filter from the 2026-04-29 call. Values:
  //   'all'         — every request (default)
  //   'client'      — only untagged (regular billable client work)
  //   'internal'    — any internal tag (rolled up)
  //   <category-key> — only that specific tag
  const [internalFilter, setInternalFilter] = useState<string>('all')
  const [venueRailOpen, setVenueRailOpen] = useState(true)
  const [openLeagues, setOpenLeagues] = useState<Record<string, boolean>>({})
  // selectedVenueId + selectedLeague are mutually exclusive: clicking a venue
  // narrows to that venue, clicking a league header narrows to that bucket.
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const [selectedLeague, setSelectedLeague] = useState<LeagueKey | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [layoutPrefs, setLayoutPrefs] = useState<DashboardLayoutPrefs>(DEFAULT_LAYOUT_PREFS)
  useEffect(() => { loadLayoutPrefs('designs.kanban').then(setLayoutPrefs) }, [])

  const [viewMode, setViewMode] = useState<'kanban' | 'board' | 'cg'>('kanban')
  const [widgets, setWidgets] = useState<DashboardWidget[]>([])
  const [cgWidgetRequests, setCgWidgetRequests] = useState<CgWidgetRequest[]>([])
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null)
  // Once the user picks a view this session, a late-resolving preference
  // fetch must not overwrite their choice.
  const userPickedViewRef = useRef(false)
  useEffect(() => {
    let cancelled = false
    // Read the raw preference: loadLayoutPrefs coerces `layout` to
    // 'stacked' | 'horizontal', which silently destroyed 'board' / 'cg'
    // and made the saved default view never restore.
    fetch(`/api/preferences?key=${encodeURIComponent('designs.view')}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled || userPickedViewRef.current || !data?.value) return
        const stored = (JSON.parse(data.value) as { layout?: string }).layout
        if (stored === 'board' || stored === 'cg') setViewMode(stored)
      })
      .catch(() => {})
    loadDashboardPage().then(page => { if (!cancelled) setWidgets(page.widgets) })
    return () => { cancelled = true }
  }, [])
  const persistView = (next: 'kanban' | 'board' | 'cg') => {
    userPickedViewRef.current = true
    setViewMode(next)
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'designs.view', value: JSON.stringify({ layout: next, hidden: [], order: [] }) }),
    }).catch(() => {})
  }
  const persistWidgets = (next: DashboardWidget[]) => {
    setWidgets(next)
    saveDashboardPage({ version: 1, widgets: next })
  }
  const onWidgetSave = (updated: DashboardWidget) => {
    persistWidgets(widgets.some(w => w.id === updated.id)
      ? widgets.map(w => w.id === updated.id ? updated : w)
      : [...widgets, updated])
    setEditingWidget(null)
  }
  const onWidgetDelete = (id: string) => {
    const idx = widgets.findIndex(w => w.id === id)
    if (idx < 0) return
    const removed = widgets[idx]
    persistWidgets(widgets.filter(w => w.id !== id))
    showToast('Widget removed', 'info', {
      label: 'Undo',
      onClick: () => {
        const next = [...widgets]
        next.splice(idx, 0, removed)
        persistWidgets(next)
      },
    })
  }
  const onWidgetMove = (id: string, dir: -1 | 1) => {
    const idx = widgets.findIndex(w => w.id === id)
    if (idx < 0) return
    const swap = idx + dir
    if (swap < 0 || swap >= widgets.length) return
    const next = [...widgets]
    ;[next[idx], next[swap]] = [next[swap], next[idx]]
    persistWidgets(next)
  }
  // Master-detail: the ticket opened in the right-hand panel (Charlie 2026-07-15).
  // Clicking a card opens it here instead of navigating away, so the queue stays
  // visible on the left and you can click straight through it.
  const [panelId, setPanelId] = useState<string | null>(null)
  // Panel width is user-resizable (drag the left edge) and persisted per user.
  const [panelWidth, setPanelWidth] = useState(720)
  const resizingRef = useRef(false)
  const [customTriCode, setCustomTriCode] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set())
  const [bulkAssignee, setBulkAssignee] = useState<string>('')
  const [bulkField, setBulkField] = useState<'designer_id' | 'enterprise_contact_id'>('designer_id')
  const [bulkApplying, setBulkApplying] = useState(false)
  const toggleBulk = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const applyBulkAssign = async () => {
    if (!bulkSelected.size) return
    setBulkApplying(true)
    try {
      const res = await fetch('/api/design-requests/bulk-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(bulkSelected),
          field: bulkField,
          assignee_id: bulkAssignee || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      await fetchData()
      setBulkSelected(new Set())
      setBulkMode(false)
      setBulkAssignee('')
      window.dispatchEvent(new CustomEvent('anc:toast', { detail: { message: `Assigned ${data.updated} job${data.updated === 1 ? '' : 's'}`, kind: 'success' } }))
    } catch (e) {
      console.error(e)
      window.dispatchEvent(new CustomEvent('anc:toast', { detail: { message: e instanceof Error ? e.message : 'Bulk assign failed', kind: 'error' } }))
    } finally {
      setBulkApplying(false)
    }
  }
  useEffect(() => {
    try {
      const uid = localStorage.getItem('userId') || ''
      setCurrentUserId(uid)
    } catch {}
    try {
      const sp = new URLSearchParams(window.location.search)
      const internal = sp.get('internal')
      if (internal) setInternalFilter(internal)
    } catch {}
  }, [])

  // Hydrate the venue rail from DB-backed prefs (open/closed, expanded
  // leagues). Stored as one key so we only round-trip once. selected venue
  // and league filters are NOT persisted — they reset each session because
  // most days Alexis works across many venues.
  useEffect(() => {
    fetch('/api/preferences?key=designs_venue_rail')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.value) return
        try {
          const parsed = JSON.parse(d.value)
          if (typeof parsed.open === 'boolean') setVenueRailOpen(parsed.open)
          if (parsed.leagues && typeof parsed.leagues === 'object') setOpenLeagues(parsed.leagues)
        } catch {}
      })
      .catch(() => {})
  }, [])

  const persistRailPrefs = (next: { open?: boolean; leagues?: Record<string, boolean> }) => {
    const payload = {
      open: next.open ?? venueRailOpen,
      leagues: next.leagues ?? openLeagues,
    }
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'designs_venue_rail', value: JSON.stringify(payload) }),
    }).catch(() => {})
  }

  const toggleRail = () => {
    const next = !venueRailOpen
    setVenueRailOpen(next)
    persistRailPrefs({ open: next })
  }

  const toggleLeague = (key: LeagueKey) => {
    const next = { ...openLeagues, [key]: !openLeagues[key] }
    setOpenLeagues(next)
    persistRailPrefs({ leagues: next })
  }
  const [formData, setFormData] = useState({
    venue_id: '',
    company_name: '',
    job_title: '',
    tricode: '',
    boards_requested: '',
    sizes_requested: '',
    designer_id: '',
    designer_ids: [] as string[],
    enterprise_contact_id: '',
    enterprise_contact_ids: [] as string[],
    due_date: '',
    hours_estimated: '',
    project_file_location: '',
    ftp_final_link: '',
    ftp_proof_link: '',
    client_brief: '',
    notes: '',
    is_rando: false,
  })

  const fetchData = async (sort: string = sortKey) => {
    try {
      const designFetches = [
        fetch(`/api/design-requests?sort=${encodeURIComponent(sort)}&limit=500`).then((r) => r.json()),
        ...statusColumns.map((status) =>
          fetch(`/api/design-requests?status=${encodeURIComponent(status.key)}&sort=${encodeURIComponent(sort)}&limit=120`)
            .then((r) => r.json())
            .catch(() => ({ design_requests: [] })),
        ),
        // Cancelled is a terminal status with no Kanban lane — fetch it
        // explicitly so the Cancelled tab + counts populate.
        fetch(`/api/design-requests?status=cancelled&sort=${encodeURIComponent(sort)}&limit=120`)
          .then((r) => r.json())
          .catch(() => ({ design_requests: [] })),
      ]
      const [designPages, vd, sd] = await Promise.all([
        Promise.all(designFetches),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff?assignable=project').then((r) => r.json()),
      ])
      const byId = new Map<string, DesignRequest>()
      for (const page of designPages) {
        for (const row of page.design_requests || []) byId.set(row.id, row)
      }
      setDesignRequests(Array.from(byId.values()))
      setVenues(vd.venues || [])
      setStaff(sd.staff || [])
      if (viewMode === 'board' || viewMode === 'cg') {
        const cg = await fetch('/api/cg-designs').then((r) => r.json()).catch(() => ({ cg_design_requests: [] }))
        setCgWidgetRequests((cg.cg_design_requests || []).map((item: any) => ({
          id: item.id,
          status: item.status,
          designer_id: item.designer_id || null,
          designer_name: item.designer_name || null,
          enterprise_contact_id: item.enterprise_contact_id || null,
          enterprise_contact_name: item.enterprise_contact_name || null,
          venue_id: item.venue_id || null,
          venue_name: item.venue_name || item.team_name || null,
          due_date: item.due_date || null,
          job_title: item.job_title,
          company_name: item.team_name || item.league || null,
          tricode: item.tricode || null,
          created_date: item.created_date,
          designers: item.designers || [],
          enterprise_contacts: item.enterprise_contacts || [],
        })))
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(sortKey)
    const onRefresh = () => { fetchData(sortKey) }
    window.addEventListener('anc:data-refresh', onRefresh)
    return () => window.removeEventListener('anc:data-refresh', onRefresh)
  }, [sortKey])

  useEffect(() => {
    if (viewMode === 'board' || viewMode === 'cg') fetchData(sortKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode])

  // Esc closes the ticket panel — expected behavior for a slide-in detail view.
  useEffect(() => {
    if (!panelId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelId])

  // On load: restore the saved panel width, and re-open the panel when we arrive
  // from a full ticket page via ?panel=<id> — that's the "back to the split view"
  // path so going full screen is never a dead end (Charlie 2026-07-15).
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search).get('panel')
      if (p) setPanelId(p)
    } catch {}
    fetch(`/api/preferences?key=${encodeURIComponent('designs.panelWidth')}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.value) return
        const w = Number(JSON.parse(data.value)?.width)
        if (Number.isFinite(w) && w >= 380) setPanelWidth(clampPanelWidth(w))
      })
      .catch(() => {})
  }, [])

  const persistPanelWidth = (w: number) => {
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'designs.panelWidth', value: JSON.stringify({ width: Math.round(w) }) }),
    }).catch(() => {})
  }

  // Drag the panel's left edge to resize. Width is clamped to a readable min and
  // to the viewport so it can't swallow the whole board or shrink past usable.
  const startPanelResize = (e: ReactMouseEvent) => {
    e.preventDefault()
    resizingRef.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      setPanelWidth(clampPanelWidth(window.innerWidth - ev.clientX))
    }
    const onUp = () => {
      resizingRef.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setPanelWidth((w) => { persistPanelWidth(w); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const updateStatus = async (item: DesignRequest, status: string) => {
    try {
      const res = await fetch(`/api/design-requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setDesignRequests((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const duplicateRequest = async (id: string) => {
    if (duplicatingId) return
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/design-requests/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not duplicate this request')
        return
      }
      const data = await res.json()
      const newId = data?.design_request?.id
      if (newId) {
        // Drop the user straight into the new request so they can fill in the
        // cycle-specific fields (date, asset link, designer) — that's exactly
        // Alexis's South Street workflow.
        router.push(`/designs/${newId}`)
      } else {
        await fetchData()
      }
    } catch (err) {
      console.error(err)
      alert('Could not duplicate this request')
    } finally {
      setDuplicatingId(null)
    }
  }

  const deleteRequest = async (id: string) => {
    if (deletingId) return
    if (!confirm('Delete this design request? It will be removed from all views but can be recovered.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/design-requests/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err?.error || 'Could not delete this request', 'error')
        return
      }
      setDesignRequests((prev) => prev.filter((row) => row.id !== id))
    } catch (err) {
      console.error(err)
      showToast('Could not delete this request', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmit = async (e: FormEvent | null, waiveBrief = false) => {
    e?.preventDefault()
    if (!formData.job_title.trim()) return
    if (!formData.venue_id) {
      setFormError('Venue is required.')
      return
    }
    // Rando / ad-hoc requests have no recurring client — tri-code not needed (Charlie 7/27)
    if (!formData.is_rando && !normalizeTriCode(formData.tricode)) {
      setFormError('Tri-Code is required.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    if (!waiveBrief) setBriefMissing(null)
    try {
      const res = await fetch('/api/design-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          allow_incomplete_brief: waiveBrief,
          venue_id: formData.venue_id || null,
          designer_id: formData.designer_ids[0] || null,
          enterprise_contact_id: formData.enterprise_contact_ids[0] || null,
          designer_ids: formData.designer_ids,
          enterprise_contact_ids: formData.enterprise_contact_ids,
          due_date: formData.due_date || null,
          hours_estimated: null,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        // 422 is not a failure to report — it is the brief gate asking for the
        // missing pieces, so it renders as a checklist rather than an error.
        if (res.status === 422 && Array.isArray(err?.missing) && err.missing.length) {
          setBriefMissing(err.missing)
          return
        }
        throw new Error(err?.error || `Could not create request (${res.status})`)
      }
      setBriefMissing(null)
      setFormData({
        venue_id: '',
        company_name: '',
        job_title: '',
        tricode: '',
        boards_requested: '',
        sizes_requested: '',
        designer_id: '',
        designer_ids: [],
        enterprise_contact_id: '',
        enterprise_contact_ids: [],
        due_date: '',
        hours_estimated: '',
        project_file_location: '',
        ftp_final_link: '',
        ftp_proof_link: '',
        client_brief: '',
        notes: '',
        is_rando: false,
      })
      setShowForm(false)
      await fetchData()
    } catch (err) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'Could not create request'
      setFormError(message)
      showToast(message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // Index venues by id and by name (lowercased) so we can match a design
  // request whether it carries venue_id (Postgres path) or just venue_name
  // (Twenty path — Twenty designs have no venue relation, just a client).
  const venueById = useMemo(() => {
    const m = new Map<string, Venue>()
    venues.forEach((v) => m.set(v.id, v))
    return m
  }, [venues])
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    staff.forEach((person) => m.set(person.id, person))
    return m
  }, [staff])
  const selectedFormTriCodes = useMemo(() => {
    const venue = formData.venue_id ? venueById.get(formData.venue_id) : null
    return venueTriCodes(venue?.aliases)
  }, [formData.venue_id, venueById])
  const venueByLowerName = useMemo(() => {
    const m = new Map<string, Venue>()
    venues.forEach((v) => m.set(v.name.toLowerCase(), v))
    return m
  }, [venues])

  const venueOfRequest = (item: DesignRequest): Venue | null => {
    if (item.venue_id && venueById.has(item.venue_id)) return venueById.get(item.venue_id)!
    if (item.venue_name) return venueByLowerName.get(item.venue_name.toLowerCase()) || null
    return null
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    // Normalized fallback so "big 3" matches "big3" and vice versa (Charlie 7/14).
    const nq = normalizeSearch(q)
    const matchesField = (field: string | null | undefined) => {
      const f = (field || '').toLowerCase()
      return f.includes(q) || (!!nq && normalizeSearch(f).includes(nq))
    }
    const targetDesignerId = designerFilter === 'mine' ? currentUserId : designerFilter
    return designRequests.filter((item) => {
      const matchesSearch =
        !q ||
        matchesField(item.job_title) ||
        matchesField(item.company_name) ||
        matchesField(item.venue_name) ||
        matchesField(item.designer_name) ||
        matchesField(item.tricode)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.status !== 'done' && item.status !== 'cancelled') ||
        item.status === statusFilter

      const matchesDesigner =
        designerFilter === 'all' ||
        (targetDesignerId && hasAssignment(item, targetDesignerId))

      const matchesRando =
        randoFilter === 'all' ||
        (randoFilter === 'only' && item.is_rando) ||
        (randoFilter === 'exclude' && !item.is_rando)

      let matchesInternal = true
      if (internalFilter === 'client') matchesInternal = !item.internal_category
      else if (internalFilter === 'internal') matchesInternal = !!item.internal_category
      else if (internalFilter !== 'all') matchesInternal = item.internal_category === internalFilter

      let matchesVenue = true
      if (selectedVenueId) {
        const v = venueOfRequest(item)
        matchesVenue = v?.id === selectedVenueId
      } else if (selectedLeague) {
        const v = venueOfRequest(item)
        matchesVenue = v ? classifyVenue(v) === selectedLeague : false
      }

      return matchesSearch && matchesStatus && matchesDesigner && matchesRando && matchesVenue && matchesInternal
    })
  }, [designRequests, search, statusFilter, designerFilter, randoFilter, currentUserId, selectedVenueId, selectedLeague, venueById, venueByLowerName, internalFilter])

  // High-priority sinks to the top regardless of any other sort the user
  // applied (Alexis 5/6: "designers should know what to work on first").
  const sortedFiltered = useMemo(() => {
    const high = filtered.filter(r => r.priority === 'high')
    const rest = filtered.filter(r => r.priority !== 'high')
    return [...high, ...rest]
  }, [filtered])

  // Bucketed venue tree for the left rail. We include only venues that have
  // at least one design request OR are likely to get one (i.e. all of them
  // for now — Alexis wants to see the full taxonomy, not just venues with
  // active work, so the structure is browsable even before requests land).
  const venueTree = useMemo(() => {
    const counts: Record<string, number> = {}
    designRequests.forEach((item) => {
      const v = venueOfRequest(item)
      if (v) counts[v.id] = (counts[v.id] || 0) + 1
    })
    const buckets = new Map<LeagueKey, { venues: Array<Venue & { count: number }>; total: number }>()
    LEAGUE_BUCKETS.forEach((b) => buckets.set(b.key, { venues: [], total: 0 }))
    venues.forEach((v) => {
      const k = classifyVenue(v)
      const bucket = buckets.get(k)!
      const count = counts[v.id] || 0
      bucket.venues.push({ ...v, count })
      bucket.total += count
    })
    // Sort venues alphabetically inside each bucket — Wrike-style.
    buckets.forEach((b) => b.venues.sort((a, z) => a.name.localeCompare(z.name)))
    return buckets
  }, [venues, designRequests, venueById, venueByLowerName])

  const counts: Record<string, number> = {
    active: designRequests.filter((item) => item.status !== 'done' && item.status !== 'cancelled').length,
    all: designRequests.length,
    cancelled: designRequests.filter((item) => item.status === 'cancelled').length,
  }

  for (const status of statusColumns) {
    counts[status.key] = designRequests.filter((item) => item.status === status.key).length
  }

  // Metric strip numbers (computed once for header display).
  const todayIso = new Date().toISOString().slice(0, 10)
  const weekAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const overdue = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && r.due_date && r.due_date < todayIso).length
  const dueThisWeek = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && r.due_date && r.due_date >= todayIso && r.due_date <= weekAhead).length
  const inReview = designRequests.filter(r => r.status === 'client_review' || r.status === 'in_qc').length
  const unassigned = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && !r.designer_id).length

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <Skeleton className="h-14 w-64" />
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Hero header — refined, generous, enterprise feel. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-1.5">
              Creative Workflow
            </div>
            <h1 className="text-2xl leading-tight font-semibold text-zinc-900 tracking-tight">
              Design Requests
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">
              {counts.active} active · {counts.all} total · last refreshed {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="inline-flex rounded-lg ring-1 ring-zinc-200 bg-white p-0.5">
              <button
                onClick={() => persistView('kanban')}
                className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'kanban' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Kanban
              </button>
              <button
                onClick={() => persistView('board')}
                className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'board' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                My Board
              </button>
              <button
                onClick={() => persistView('cg')}
                className={`px-3 h-8 rounded-md text-xs font-semibold transition-colors ${
                  viewMode === 'cg' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                CG Design
              </button>
            </div>
            <button
              onClick={() => { setBulkMode(m => !m); setBulkSelected(new Set()) }}
              className={`inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 text-sm font-medium transition-colors ${
                bulkMode
                  ? 'bg-[#0A52EF] text-white ring-[#0A52EF]'
                  : 'ring-zinc-200 bg-white text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300'
              }`}
              title="Select multiple jobs and assign them in one shot"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{bulkMode ? 'Exit bulk' : 'Bulk assign'}</span>
            </button>
            <DashboardLayoutSettings
              storageKey="designs.kanban"
              columns={statusColumns.map(c => ({ key: c.key, label: c.label }))}
              prefs={layoutPrefs}
              onChange={setLayoutPrefs}
            />
            <button
              onClick={() => fetchData()}
              className="h-9 w-9 flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Refresh"
              aria-label="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <Link
              href="/designs/templates"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Saved request templates"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
              </svg>
              <span>Templates</span>
            </Link>
            <Link
              href="/designs/samples"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Bundle past examples into a single share link for sponsors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656-5.656m-1.656-1.656a4 4 0 00-5.656 5.656l3 3a4 4 0 005.656-5.656" />
              </svg>
              <span>Samples</span>
            </Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium shadow-[0_4px_12px_-4px_rgba(15,23,42,0.35)] hover:bg-zinc-800 hover:shadow-[0_6px_16px_-4px_rgba(15,23,42,0.4)] transition-all"
            >
              {showForm ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  <span>Close</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  <span>New Request</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Metric strip — quick-glance ops health */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active', value: counts.active, tone: 'text-zinc-900', accent: 'bg-[#0A52EF]' },
            { label: 'Due this week', value: dueThisWeek, tone: 'text-zinc-900', accent: 'bg-amber-500' },
            { label: 'In review', value: inReview, tone: 'text-zinc-900', accent: 'bg-blue-500' },
            { label: overdue > 0 ? 'Overdue' : 'Unassigned', value: overdue > 0 ? overdue : unassigned, tone: overdue > 0 ? 'text-red-600' : 'text-zinc-900', accent: overdue > 0 ? 'bg-red-500' : 'bg-zinc-400' },
          ].map((metric) => (
            <div key={metric.label} className="group relative rounded-xl bg-white ring-1 ring-zinc-200/80 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_16px_-8px_rgba(15,23,42,0.2)] hover:ring-zinc-300 transition-all">
              <div className="absolute top-3.5 right-3.5">
                <span className={`block w-1.5 h-1.5 rounded-full ${metric.accent} ring-2 ring-white`} />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{metric.label}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${metric.tone}`}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* Create form — sliding panel feel */}
        {showForm && (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/60 to-white">
              <div>
                <h3 className="text-[15px] font-semibold text-zinc-900">New Design Request</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Creates a job in the <span className="font-medium text-zinc-700">Submitted</span> column. The Creative lead will triage.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              {formError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {formError}
                </div>
              )}
              {briefMissing && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">
                    A designer could not start from this yet
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {briefMissing.map((item) => (
                      <li key={item} className="flex gap-2 text-sm text-amber-900">
                        <span aria-hidden="true" className="text-amber-500">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2.5 text-xs text-amber-800">
                    Filling these in now saves a revision round later.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleSubmit(null, true)}
                    disabled={submitting}
                    className="mt-3 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 disabled:opacity-50"
                  >
                    Submit as-is anyway
                  </button>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Job Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, job_title: e.target.value }))}
                  placeholder="e.g. Lakers Playoff Banner Set"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-offset-0 outline-none bg-white transition-shadow"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
                    Venue <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.venue_id}
                    onChange={(e) => {
                      const venueId = e.target.value
                      const venue = venueId ? venueById.get(venueId) : null
                      const codes = venueTriCodes(venue?.aliases)
                      setFormData((prev) => ({
                        ...prev,
                        venue_id: venueId,
                        tricode: codes.length === 1 ? codes[0] : prev.tricode,
                      }))
                    }}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                    required
                  >
                    <option value="">Select venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Rando / ad-hoc marker — Alexis: one-off paid work with no service agreement */}
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg bg-zinc-50 ring-1 ring-zinc-200 px-3.5 py-3 hover:bg-zinc-100 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.is_rando}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_rando: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[#0A52EF]"
                />
                <div>
                  <div className="text-sm font-medium text-zinc-900">This is a rando / ad-hoc request</div>
                  <div className="text-xs text-zinc-500 mt-0.5">One-off paid work for a client with no recurring service agreement (e.g. University of Washington).</div>
                </div>
              </label>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
                    Tri-Code {!formData.is_rando && <span className="text-red-500">*</span>}{' '}
                    <span className="text-zinc-400 font-normal lowercase tracking-normal">
                      {formData.is_rando ? '— not needed for rando requests' : '— up to 2 × 3 letters'}
                    </span>
                  </label>
                  {formData.is_rando ? (
                    <input
                      type="text"
                      value={formData.tricode}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tricode: normalizeTriCode(e.target.value) }))}
                      maxLength={7}
                      placeholder="Optional"
                      className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-zinc-50 font-mono uppercase"
                    />
                  ) : selectedFormTriCodes.length > 0 && !customTriCode ? (
                    <select
                      value={formData.tricode}
                      onChange={(e) => {
                        // "Add a new code…" flips the dropdown into a free-text input so the
                        // list is never a dead end (Charlie 7/27)
                        if (e.target.value === '__custom__') {
                          setCustomTriCode(true)
                          setFormData((prev) => ({ ...prev, tricode: '' }))
                          return
                        }
                        setFormData((prev) => ({ ...prev, tricode: e.target.value }))
                      }}
                      className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white font-mono uppercase"
                      required
                    >
                      <option value="">Select code</option>
                      {selectedFormTriCodes.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                      <option value="__custom__">+ Add a new code…</option>
                    </select>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={formData.tricode}
                        onChange={(e) => setFormData((prev) => ({ ...prev, tricode: normalizeTriCode(e.target.value) }))}
                        maxLength={7}
                        placeholder="BSX-FEN"
                        autoFocus={customTriCode}
                        className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white font-mono uppercase"
                        required
                      />
                      {customTriCode && (
                        <button
                          type="button"
                          onClick={() => { setCustomTriCode(false); setFormData((prev) => ({ ...prev, tricode: '' })) }}
                          className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
                        >
                          Back to list
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Designers</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      setFormData((prev) => ({
                        ...prev,
                        designer_ids: prev.designer_ids.includes(id) ? prev.designer_ids : [...prev.designer_ids, id],
                      }))
                    }}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Add designer...</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                  {formData.designer_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.designer_ids.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, designer_ids: prev.designer_ids.filter((x) => x !== id) }))}
                          className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200"
                          title="Remove designer"
                        >
                          {staffById.get(id)?.full_name || 'Designer'} x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Enterprise Leads</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      setFormData((prev) => ({
                        ...prev,
                        enterprise_contact_ids: prev.enterprise_contact_ids.includes(id) ? prev.enterprise_contact_ids : [...prev.enterprise_contact_ids, id],
                      }))
                    }}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Add enterprise lead...</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                  {formData.enterprise_contact_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.enterprise_contact_ids.map((id) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, enterprise_contact_ids: prev.enterprise_contact_ids.filter((x) => x !== id) }))}
                          className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 hover:bg-zinc-200"
                          title="Remove enterprise lead"
                        >
                          {staffById.get(id)?.full_name || 'Enterprise Lead'} x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
              </div>

              {/* Board & Sizes — single merged field (Charlie 2026-07-15), matching
                  how it already shows on the ticket. Boards and their sizes are
                  typed together in one place instead of two split columns. */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Board &amp; Sizes</label>
                <textarea
                  rows={3}
                  value={formData.boards_requested}
                  onChange={(e) => setFormData((prev) => ({ ...prev, boards_requested: e.target.value }))}
                  placeholder="e.g. Scoring 1920×1080, Anthem 16:9, Ribbon 6×12"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-y"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Project File Location</label>
                <input
                  type="text"
                  value={formData.project_file_location}
                  onChange={(e) => setFormData((prev) => ({ ...prev, project_file_location: e.target.value }))}
                  placeholder="Internal server path to the project / working files"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Final File Location</label>
                  <input
                    type="text"
                    value={formData.ftp_final_link}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ftp_final_link: e.target.value }))}
                    placeholder="FTP path / folder for final files"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Proof Link</label>
                  <input
                    type="text"
                    value={formData.ftp_proof_link}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ftp_proof_link: e.target.value }))}
                    placeholder="Link to the proof for client review"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
                  Client&apos;s Request — paste the email
                </label>
                <textarea
                  value={formData.client_brief}
                  onChange={(e) => setFormData((prev) => ({ ...prev, client_brief: e.target.value }))}
                  rows={7}
                  placeholder="Paste the client's email here, exactly as they sent it — creative direction, callouts, references, all of it."
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm font-mono text-[12.5px] leading-relaxed focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-y bg-white"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Kept word-for-word for the designer. Pasting the whole email is less work than retyping a summary, and nothing gets lost on the way.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="ANC's own notes on top of the client's request…"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-none bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setBriefMissing(null)
                  }}
                  className="h-10 px-4 rounded-xl text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#0A52EF] text-white text-sm font-medium shadow-[0_4px_12px_-4px_rgba(10,82,239,0.6)] hover:bg-[#0840C0] disabled:opacity-50 transition-all"
                >
                  {submitting ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <span>Creating…</span>
                    </>
                  ) : (
                    <>
                      <span>Create Request</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {viewMode === 'cg' && (
          <div className="overflow-hidden rounded-xl bg-white ring-1 ring-zinc-200">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <p className="text-sm font-semibold text-zinc-900">CG Design Requests <span className="ml-1 font-normal text-zinc-400">{cgWidgetRequests.length}</span></p>
              <Link href="/cg-designs" className="text-xs font-medium text-blue-600 hover:text-blue-800">Open full CG page →</Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <th className="px-4 py-3 text-left">Job</th>
                    <th className="px-4 py-3 text-left">Team / Client</th>
                    <th className="px-4 py-3 text-left">Tricode</th>
                    <th className="px-4 py-3 text-left">Designer</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {cgWidgetRequests.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-zinc-400">No CG design requests</td></tr>
                  )}
                  {[...cgWidgetRequests]
                    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
                    .map((cg) => (
                      <tr key={cg.id} className="hover:bg-zinc-50">
                        <td className="px-4 py-3 font-medium text-zinc-900">{cg.job_title}</td>
                        <td className="px-4 py-3 text-zinc-600">{cg.company_name || cg.venue_name || '—'}</td>
                        <td className="px-4 py-3 text-zinc-600">{cg.tricode || '—'}</td>
                        <td className="px-4 py-3 text-zinc-600">{cg.designer_name || 'Unassigned'}</td>
                        <td className="px-4 py-3 tabular-nums text-zinc-600">{cg.due_date ? new Date(`${cg.due_date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                        <td className="px-4 py-3">
                          <span className="inline-block rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
                            {(cg.status || 'request_submitted').split('_').join(' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {viewMode === 'board' && (
            <DesignsWidgetBoard
              designRequests={designRequests}
              cgDesignRequests={cgWidgetRequests}
              staff={staff}
              venues={venues}
              widgets={widgets}
            currentUserId={currentUserId}
            todayIso={todayIso}
            onEditWidget={setEditingWidget}
            onDeleteWidget={onWidgetDelete}
            onMoveWidget={onWidgetMove}
            onAddWidget={() => setEditingWidget(newBlankWidget())}
            onOpenTicket={setPanelId}
          />
        )}

        {editingWidget && (
          <DashboardWidgetConfig
            widget={editingWidget}
            staff={staff}
            venues={venues}
            onClose={() => setEditingWidget(null)}
            onSave={onWidgetSave}
          />
        )}

        {viewMode === 'kanban' && (
        <div className="flex items-start gap-4">
          {venueRailOpen && (
            <aside className="w-60 flex-shrink-0 rounded-xl bg-white ring-1 ring-zinc-200 p-2 max-h-[calc(100vh-13rem)] overflow-y-auto">
              <div className="flex items-center justify-between px-2 py-1.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Venues
                </div>
                <div className="flex items-center gap-1">
                  {(selectedVenueId || selectedLeague) && (
                    <button
                      onClick={() => { setSelectedVenueId(null); setSelectedLeague(null) }}
                      className="text-[10.5px] text-zinc-500 hover:text-zinc-900 px-1.5 py-0.5 rounded hover:bg-zinc-100"
                      title="Clear venue filter"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    onClick={toggleRail}
                    className="h-6 w-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded"
                    title="Hide venue tree"
                    aria-label="Hide venue tree"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              <button
                onClick={() => { setSelectedVenueId(null); setSelectedLeague(null) }}
                className={`w-full text-left px-2 py-1.5 rounded-md text-[12.5px] font-medium transition-colors ${
                  !selectedVenueId && !selectedLeague
                    ? 'bg-[#0A52EF]/10 text-[#0A52EF]'
                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                <span className="inline-flex items-center justify-between w-full">
                  <span>All venues</span>
                  <span className="text-[10.5px] tabular-nums text-zinc-400">{designRequests.length}</span>
                </span>
              </button>
              <div className="mt-1 space-y-0.5">
                {LEAGUE_BUCKETS.map((bucket) => {
                  const data = venueTree.get(bucket.key)
                  if (!data || data.venues.length === 0) return null
                  const expanded = openLeagues[bucket.key] ?? bucket.key === 'college'
                  const leagueSelected = selectedLeague === bucket.key && !selectedVenueId
                  return (
                    <div key={bucket.key} className="text-[12.5px]">
                      <div className="flex items-center">
                        <button
                          onClick={() => toggleLeague(bucket.key)}
                          className="h-6 w-6 flex items-center justify-center text-zinc-400 hover:text-zinc-700 rounded"
                          title={expanded ? 'Collapse' : 'Expand'}
                          aria-label={expanded ? 'Collapse' : 'Expand'}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.4}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => { setSelectedLeague(bucket.key); setSelectedVenueId(null) }}
                          className={`flex-1 text-left px-1.5 py-1 rounded-md font-medium transition-colors ${
                            leagueSelected
                              ? 'bg-[#0A52EF]/10 text-[#0A52EF]'
                              : 'text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900'
                          }`}
                        >
                          <span className="inline-flex items-center justify-between w-full">
                            <span>{bucket.label}</span>
                            <span className={`text-[10.5px] tabular-nums ${leagueSelected ? 'text-[#0A52EF]/70' : 'text-zinc-400'}`}>{data.total || data.venues.length}</span>
                          </span>
                        </button>
                      </div>
                      {expanded && (
                        <div className="ml-6 space-y-0.5 mt-0.5 mb-1">
                          {data.venues.map((v) => {
                            const venueSelected = selectedVenueId === v.id
                            return (
                              <button
                                key={v.id}
                                onClick={() => { setSelectedVenueId(v.id); setSelectedLeague(null) }}
                                className={`w-full text-left px-2 py-1 rounded-md text-[12px] transition-colors ${
                                  venueSelected
                                    ? 'bg-[#0A52EF]/10 text-[#0A52EF] font-medium'
                                    : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                                }`}
                              >
                                <span className="inline-flex items-center justify-between gap-2 w-full">
                                  <span className="truncate">{v.name}</span>
                                  {v.count > 0 && (
                                    <span className={`flex-shrink-0 text-[10px] tabular-nums ${venueSelected ? 'text-[#0A52EF]/70' : 'text-zinc-400'}`}>{v.count}</span>
                                  )}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </aside>
          )}
          <div className="flex-1 min-w-0 space-y-5">
            {!venueRailOpen && (
              <button
                onClick={toggleRail}
                className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-600 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
                title="Show venue tree"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                </svg>
                <span>Show venues</span>
              </button>
            )}
        {/* Tabs + search — pill bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg bg-zinc-100/80 p-1 ring-1 ring-zinc-200/60">
            {[
              { key: 'active', label: 'Active' },
              { key: 'all', label: 'All' },
              { key: 'done', label: 'Done' },
              { key: 'cancelled', label: 'Cancelled' },
            ].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/60'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {tab.label}
                  <span className={`tabular-nums text-[11px] ${isActive ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {counts[tab.key] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4 4m0 0l4-4m-4 4V4" />
              </svg>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="h-9 pl-9 pr-8 rounded-lg ring-1 ring-zinc-200 bg-white text-sm text-zinc-700 outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow appearance-none cursor-pointer"
                title="Sort order"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Recently updated</option>
                <option value="due_asc">Due soonest</option>
                <option value="due_desc">Due latest</option>
                <option value="title">Title A–Z</option>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10a7.5 7.5 0 0013.15 6.65z" />
              </svg>
              <input
                type="text"
                placeholder="Search by title, company, venue, designer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 h-9 pl-10 pr-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
              />
            </div>
            {/* Designer filter — Alexis's per-designer dashboard ask (2026-04-23). */}
            <div className="relative">
              <select
                value={designerFilter}
                onChange={(e) => setDesignerFilter(e.target.value)}
                className="h-9 pl-3 pr-9 rounded-lg ring-1 ring-zinc-200 bg-white text-sm appearance-none outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
                title="Filter to one person's assignments (designer or enterprise contact)"
              >
                <option value="all">All assignees</option>
                {currentUserId && <option value="mine">My assignments</option>}
                <option disabled>──────────</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {/* Randos / ad-hoc filter — Alexis's "no service agreement" work-tracking ask. */}
            <div className="relative">
              <select
                value={randoFilter}
                onChange={(e) => setRandoFilter(e.target.value as 'all' | 'only' | 'exclude')}
                className="h-9 pl-3 pr-9 rounded-lg ring-1 ring-zinc-200 bg-white text-sm appearance-none outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
                title="Show all, only ad-hoc randos, or exclude randos"
              >
                <option value="all">All requests</option>
                <option value="only">Randos only</option>
                <option value="exclude">Exclude randos</option>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {/* Internal-job tag filter — Alexis's non-billable hours-tracking ask. */}
            <div className="relative">
              <select
                value={internalFilter}
                onChange={(e) => setInternalFilter(e.target.value)}
                className="h-9 pl-3 pr-9 rounded-lg ring-1 ring-zinc-200 bg-white text-sm appearance-none outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
                title="Filter by internal/non-billable category"
              >
                <option value="all">Client + internal</option>
                <option value="client">Client work only</option>
                <option value="internal">Any internal tag</option>
                <option disabled>──────────</option>
                {INTERNAL_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <Link
              href="/designs/internal-hours"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Hours summary by internal category"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19V6l12-3v13M9 19a3 3 0 11-6 0 3 3 0 016 0zM21 16a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Internal Hours</span>
            </Link>
          </div>
        </div>

        <KanbanBoard
          items={sortedFiltered}
          columns={applyLayoutPrefs(statusColumns, layoutPrefs) as KanbanColumn[]}
          layout={layoutPrefs.layout}
          statusOf={(item) => item.status}
          keyOf={(item) => item.id}
          onStatusChange={updateStatus}
          renderCard={(item) => {
            const hoursSpent = Number(item.hours_spent || 0)

            const dueIso = item.due_date ? String(item.due_date).slice(0, 10) : null
            const isOverdue = dueIso && dueIso < todayIso && item.status !== 'done' && item.status !== 'approved'
            const isDueSoon = dueIso && !isOverdue && dueIso <= weekAhead
            const dueTone = isOverdue ? 'bg-red-50 text-red-700 ring-red-200'
              : isDueSoon ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-zinc-50 text-zinc-600 ring-zinc-200'

            const primaryDesignerName = item.designers?.[0]?.full_name || item.designer_name
            const designerInitials = primaryDesignerName
              ? primaryDesignerName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
              : null
            const designerNames = assignmentNames(item.designers, item.designer_name)
            const enterpriseNames = assignmentNames(item.enterprise_contacts, item.enterprise_contact_name)
            const assigneeText = [designerNames || 'Unassigned', enterpriseNames ? `Ent: ${enterpriseNames}` : ''].filter(Boolean).join(' · ')

            const selected = bulkSelected.has(item.id)
            return (
              <div className="relative">
                {bulkMode && (
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleBulk(item.id) }}
                    className={`absolute top-1.5 left-1.5 z-10 h-5 w-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selected
                        ? 'bg-[#0A52EF] border-[#0A52EF] text-white'
                        : 'bg-white border-zinc-300 hover:border-[#0A52EF]'
                    }`}
                    title={selected ? 'Deselect' : 'Select'}
                  >
                    {selected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )}
                <Link
                  href={`/designs/${item.id}`}
                  className={`block space-y-3 ${bulkMode ? 'pl-7' : ''}`}
                  onClick={(e) => {
                    if (bulkMode) { e.preventDefault(); toggleBulk(item.id); return }
                    // Plain click opens the side panel; cmd/ctrl/middle-click still
                    // opens the full ticket page in a new tab.
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
                    e.preventDefault()
                    setPanelId(item.id)
                  }}
                >
                {/* Header: title + tricode pill (priority bell precedes title) */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13.5px] font-semibold text-zinc-900 leading-snug line-clamp-2 pr-7 flex items-start gap-1.5">
                    {item.priority === 'high' && (
                      <span title="High priority" className="inline-flex items-center justify-center h-[18px] w-[18px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex-shrink-0 mt-0.5">!</span>
                    )}
                    <span>{item.job_title}</span>
                  </h3>
                  {item.tricode && (
                    <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-zinc-600 bg-zinc-100 ring-1 ring-zinc-200 px-1.5 py-0.5 rounded tracking-wider">
                      {item.tricode}
                    </span>
                  )}
                </div>
                {item.internal_category && (
                  <div>
                    <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded">
                      Internal · {INTERNAL_CATEGORIES.find((c) => c.key === item.internal_category)?.label || item.internal_category}
                    </span>
                  </div>
                )}

                {/* Context line: venue · company */}
                <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 min-w-0">
                  {item.venue_name ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="truncate">{item.venue_name}</span>
                    </>
                  ) : (
                    <span className="text-zinc-400 italic">No venue</span>
                  )}
                  {item.company_name && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span className="truncate">{item.company_name}</span>
                    </>
                  )}
                </div>

                {/* Footer row: designer avatar, due date, hours */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {designerInitials ? (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-br from-[#0A52EF] to-[#6A5CF8] text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white shadow-sm">
                        {designerInitials}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-zinc-100 ring-1 ring-dashed ring-zinc-300 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    )}
                    <span className="text-[11.5px] text-zinc-600 truncate">
                      {assigneeText}
                    </span>
                  </div>
                  {dueIso && (
                    <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[10.5px] font-medium tabular-nums ${dueTone}`}>
                      {isOverdue ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      ) : null}
                      {formatDate(dueIso)}
                    </span>
                  )}
                </div>

                {/* Hours logged (estimate removed per Alexis 5/13) */}
                {hoursSpent > 0 && (
                  <div className="flex items-center justify-between text-[10.5px] text-zinc-500">
                    <span className="uppercase tracking-wider font-medium">Hours</span>
                    <span className="tabular-nums font-medium text-zinc-700">{hoursSpent}h logged</span>
                  </div>
                )}
              </Link>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicateRequest(item.id) }}
                disabled={duplicatingId === item.id}
                className="absolute top-0 right-0 p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Duplicate this request as a fresh Submitted ticket"
                aria-label="Duplicate request"
              >
                {duplicatingId === item.id ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); deleteRequest(item.id) }}
                disabled={deletingId === item.id}
                className="absolute top-0 right-7 p-1 rounded-md text-zinc-400 hover:text-rose-600 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Delete this request (recoverable)"
                aria-label="Delete request"
              >
                {deletingId === item.id ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
              </div>
            )
          }}
        />

        {/* Empty state for when filters leave nothing */}
        {filtered.length === 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200/80 py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">🎨</div>
            <div className="text-sm font-medium text-zinc-900">No design requests match</div>
            <div className="text-xs text-zinc-500 mt-1">
              {search ? 'Try a different search term' : 'Switch tabs or create a new request'}
            </div>
          </div>
        )}
          </div>
        </div>
        )}
      </div>
      {bulkMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-[0_20px_60px_-20px_rgba(15,23,42,0.5)]">
          <span className="font-medium">{bulkSelected.size} selected</span>
          <span className="text-zinc-500">·</span>
          <select
            value={bulkField}
            onChange={(e) => setBulkField(e.target.value as 'designer_id' | 'enterprise_contact_id')}
            className="h-8 rounded-md bg-zinc-800 px-2 text-xs text-white ring-1 ring-zinc-700 outline-none focus:ring-2 focus:ring-[#0A52EF]/60"
          >
            <option value="designer_id">As Designer</option>
            <option value="enterprise_contact_id">As Enterprise Contact</option>
          </select>
          <select
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
            className="h-8 rounded-md bg-zinc-800 px-2 text-xs text-white ring-1 ring-zinc-700 outline-none focus:ring-2 focus:ring-[#0A52EF]/60"
          >
            <option value="">— Unassign —</option>
            {staff.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <button
            onClick={applyBulkAssign}
            disabled={bulkApplying || !bulkSelected.size}
            className="rounded-md bg-[#0A52EF] px-3 py-1.5 text-xs font-semibold hover:bg-[#0840C0] disabled:opacity-50"
          >
            {bulkApplying ? 'Applying…' : 'Apply'}
          </button>
          <button
            onClick={() => { setBulkSelected(new Set()); setBulkMode(false) }}
            className="text-xs text-zinc-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Master-detail ticket panel (Charlie 2026-07-15). Slides in on the right;
          the queue stays visible + interactive on the left (wide screens), so a
          designer can click straight through their jobs. Esc or the scrim closes. */}
      {panelId && (
        <>
          <div
            className="fixed inset-0 z-40 bg-zinc-900/20 lg:bg-transparent lg:pointer-events-none"
            onClick={() => setPanelId(null)}
            aria-hidden="true"
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[95vw] flex-col bg-white shadow-2xl ring-1 ring-zinc-200"
            style={{ width: panelWidth }}
            role="dialog"
            aria-label="Design ticket detail"
          >
            {/* Drag handle — grab the left edge to resize the panel. */}
            <div
              onMouseDown={startPanelResize}
              className="group absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize"
              title="Drag to resize"
              aria-hidden="true"
            >
              <div className="h-full w-1.5 bg-transparent transition-colors group-hover:bg-[#0A52EF]/40" />
            </div>
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Ticket</span>
              <div className="flex items-center gap-1.5">
                <a
                  href={`/designs/${panelId}`}
                  className="rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                  title="Open the full ticket page (Back returns you here)"
                >
                  Open full →
                </a>
                <button
                  onClick={() => setPanelId(null)}
                  aria-label="Close panel"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <DesignDetailBody
                key={panelId}
                id={panelId}
                embedded
                onClose={() => setPanelId(null)}
                onNavigate={(nextId) => setPanelId(nextId)}
              />
            </div>
          </aside>
        </>
      )}
    </DashboardLayout>
  )
}

interface WidgetBoardProps {
  designRequests: DesignRequest[]
  cgDesignRequests: CgWidgetRequest[]
  staff: Staff[]
  venues: Venue[]
  widgets: DashboardWidget[]
  currentUserId: string
  todayIso: string
  onEditWidget: (w: DashboardWidget) => void
  onDeleteWidget: (id: string) => void
  onMoveWidget: (id: string, dir: -1 | 1) => void
  onAddWidget: () => void
  onOpenTicket?: (id: string) => void
}

function DesignsWidgetBoard({
  designRequests,
  cgDesignRequests,
  staff,
  venues,
  widgets,
  currentUserId,
  todayIso,
  onEditWidget,
  onDeleteWidget,
  onMoveWidget,
  onAddWidget,
  onOpenTicket,
}: WidgetBoardProps) {
  const staffById: Record<string, string> = {}
  for (const s of staff) staffById[s.id] = s.full_name
  const venueById: Record<string, string> = {}
  for (const v of venues) venueById[v.id] = v.name

  const ctx = { currentUserId, todayIso, staffById, venueById }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {widgets.length} widget{widgets.length === 1 ? '' : 's'} · drag, edit, or add to compose your view
        </p>
        <button
          onClick={onAddWidget}
          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add widget
        </button>
      </div>
      <div className="grid grid-cols-12 gap-4">
        {widgets.length === 0 && <WidgetBoardEmptyState onAdd={onAddWidget} />}
        {widgets.map((widget, idx) => (
          <DashboardWidgetCard
            key={widget.id}
            widget={widget}
            items={(widget.source === 'cg-designs' ? cgDesignRequests : designRequests) as any}
            ctx={ctx}
            onEdit={() => onEditWidget(widget)}
            onDelete={() => onDeleteWidget(widget.id)}
            onMove={(dir) => onMoveWidget(widget.id, dir)}
            isFirst={idx === 0}
            isLast={idx === widgets.length - 1}
            onOpenTicket={onOpenTicket}
          />
        ))}
      </div>
    </div>
  )
}
