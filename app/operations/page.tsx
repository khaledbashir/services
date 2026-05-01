'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

type TabKey = 'issues' | 'today' | 'assets' | 'walkthroughs' | 'maintenance'
type SortDir = 'asc' | 'desc'

interface Ticket {
  id: string
  ticket_number?: number | string
  title: string
  priority: string
  status: string
  category?: string
  venue_id?: string
  venue_name?: string
  assigned_to_name?: string | null
  created_at?: string
  created_date?: string
  created_time?: string
  description?: string
}

interface Asset {
  id: string
  item_name: string
  sku?: string | null
  quantity?: number
  venue_id?: string | null
  venue_name?: string
  asset_number?: string | null
  location_code?: string | null
  screen_location?: string | null
  manufacturer?: string | null
  display_type?: string | null
  orientation?: string | null
  three_letter_code?: string | null
  connected_devices?: string | null
  render_name?: string | null
  project_code?: string | null
}

interface Walkthrough {
  id: string
  venue_id?: string | null
  venue_name?: string
  technician_name?: string | null
  log_date?: string
  log_time?: string | null
  locations_visited?: string | null
  issues_found?: string | null
  result?: string
  notes?: string | null
}

interface Maintenance {
  id: string
  venue_id?: string | null
  venue_name?: string
  technician_name?: string | null
  asset_name?: string | null
  maintenance_type?: string
  issue?: string | null
  issue_summary?: string | null
  status?: string
  reported_date?: string | null
  scheduled_date?: string | null
  location_reported?: string | null
}

interface Venue { id: string; name: string }

type SelectedRow =
  | { kind: 'Issue'; row: Ticket }
  | { kind: 'Display'; row: Asset }
  | { kind: 'Walkthrough'; row: Walkthrough }
  | { kind: 'Maintenance'; row: Maintenance }

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: 'issues', label: 'Open Issues' },
  { key: 'today', label: "Today's Issues" },
  { key: 'assets', label: 'Displays' },
  { key: 'walkthroughs', label: 'Walkthrough Log' },
  { key: 'maintenance', label: 'Maintenance' },
]

const workspaceNav = [
  'NYC',
  'WMATA',
  'Venues',
  'Inventory',
  'Issues',
  'Walkthroughs',
  'Maintenance',
]

function normalize(value: unknown): string {
  return String(value ?? '').toLowerCase()
}

function isOpenStatus(status?: string): boolean {
  const s = normalize(status)
  return !['closed', 'resolved', 'completed', 'cancelled', 'done'].includes(s)
}

function isToday(value?: string | null): boolean {
  if (!value) return false
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value.slice(0, 10) === new Date().toISOString().slice(0, 10)
  return d.toDateString() === new Date().toDateString()
}

function displayDate(value?: string | null): string {
  if (!value) return '--'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function pillClass(kind: 'status' | 'priority' | 'result', value?: string | null): string {
  const v = normalize(value)
  if (kind === 'priority') {
    if (v.includes('critical') || v.includes('high')) return 'border-red-200 bg-red-50 text-red-700'
    if (v.includes('low')) return 'border-zinc-200 bg-zinc-50 text-zinc-600'
    return 'border-amber-200 bg-amber-50 text-amber-700'
  }
  if (kind === 'result') {
    if (v.includes('problem') || v.includes('issue')) return 'border-red-200 bg-red-50 text-red-700'
    if (v.includes('partial') || v.includes('minor')) return 'border-amber-200 bg-amber-50 text-amber-700'
    return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  }
  if (v.includes('closed') || v.includes('resolved') || v.includes('completed')) return 'border-emerald-200 bg-emerald-50 text-emerald-700'
  if (v.includes('progress') || v.includes('assigned')) return 'border-sky-200 bg-sky-50 text-sky-700'
  if (v.includes('escalated') || v.includes('critical')) return 'border-red-200 bg-red-50 text-red-700'
  return 'border-amber-200 bg-amber-50 text-amber-700'
}

function Pill({ kind, value }: { kind: 'status' | 'priority' | 'result'; value?: string | null }) {
  return (
    <span className={`inline-flex max-w-full items-center rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize ${pillClass(kind, value)}`}>
      {String(value || '--').replace(/_/g, ' ').toLowerCase()}
    </span>
  )
}

function FieldChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex max-w-full items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[11px] text-zinc-700">
      <span className="truncate">{children}</span>
    </span>
  )
}

function SortButton({
  label,
  column,
  active,
  dir,
  onSort,
}: {
  label: string
  column: string
  active: boolean
  dir: SortDir
  onSort: (column: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSort(column)}
      className="inline-flex h-7 items-center gap-1 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-900"
    >
      <span>{label}</span>
      <span className={`text-[10px] ${active ? 'text-[#0A52EF]' : 'text-zinc-300'}`}>{active ? (dir === 'asc' ? '^' : 'v') : '-'}</span>
    </button>
  )
}

export default function OperationsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('issues')
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [walkthroughs, setWalkthroughs] = useState<Walkthrough[]>([])
  const [maintenance, setMaintenance] = useState<Maintenance[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [venueFilter, setVenueFilter] = useState('all')
  const [sortColumn, setSortColumn] = useState('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selected, setSelected] = useState<SelectedRow | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [ticketRes, assetRes, walkRes, maintenanceRes, venueRes] = await Promise.all([
          fetch('/api/tickets'),
          fetch('/api/inventory'),
          fetch('/api/walkthroughs?limit=300'),
          fetch('/api/maintenance?limit=300'),
          fetch('/api/venues'),
        ])
        const responses = [ticketRes, assetRes, walkRes, maintenanceRes, venueRes]
        const failed = responses.find((r) => !r.ok)
        if (failed) throw new Error(`Operations data failed to load (${failed.status})`)

        const [ticketData, assetData, walkData, maintenanceData, venueData] = await Promise.all(responses.map((r) => r.json()))
        if (cancelled) return
        setTickets(ticketData.tickets || [])
        setAssets(assetData.items || [])
        setWalkthroughs(walkData.walkthroughs || [])
        setMaintenance(maintenanceData.logs || [])
        setVenues(venueData.venues || [])
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Operations data failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    setSearch('')
    setVenueFilter('all')
    setSelected(null)
    if (activeTab === 'assets') setSortColumn('venue_name')
    else if (activeTab === 'walkthroughs') setSortColumn('log_date')
    else if (activeTab === 'maintenance') setSortColumn('reported_date')
    else setSortColumn('created_at')
    setSortDir(activeTab === 'assets' ? 'asc' : 'desc')
  }, [activeTab])

  const openTickets = useMemo(() => tickets.filter((t) => isOpenStatus(t.status)), [tickets])
  const todayTickets = useMemo(() => openTickets.filter((t) => isToday(t.created_at)), [openTickets])

  const counts = {
    issues: openTickets.length,
    today: todayTickets.length,
    assets: assets.length,
    walkthroughs: walkthroughs.length,
    maintenance: maintenance.filter((m) => isOpenStatus(m.status)).length,
  }

  const handleSort = (column: string) => {
    if (sortColumn === column) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortColumn(column)
      setSortDir('asc')
    }
  }

  const q = search.trim().toLowerCase()

  const rows = useMemo(() => {
    const base: Array<Ticket | Asset | Walkthrough | Maintenance> =
      activeTab === 'issues' ? openTickets :
      activeTab === 'today' ? todayTickets :
      activeTab === 'assets' ? assets :
      activeTab === 'walkthroughs' ? walkthroughs :
      maintenance

    const filtered = base.filter((row: any) => {
      if (venueFilter !== 'all' && row.venue_id !== venueFilter) return false
      if (!q) return true
      return Object.values(row).some((value) => normalize(value).includes(q))
    })

    return [...filtered].sort((a: any, b: any) => {
      const av = normalize(a[sortColumn])
      const bv = normalize(b[sortColumn])
      const cmp = av.localeCompare(bv, undefined, { numeric: true })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [activeTab, openTickets, todayTickets, assets, walkthroughs, maintenance, venueFilter, q, sortColumn, sortDir])

  const activeCount = counts[activeTab]

  return (
    <DashboardLayout>
      <div className="min-h-[calc(100vh-7rem)] overflow-hidden rounded border border-zinc-200 bg-white">
        <div className="grid min-h-[calc(100vh-7rem)] grid-cols-[220px_1fr]">
          <aside className="border-r border-zinc-200 bg-zinc-50">
            <div className="border-b border-zinc-200 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-400">Field Ops</div>
              <h1 className="mt-1 text-base font-semibold text-zinc-950">Operations</h1>
            </div>
            <div className="p-2">
              {workspaceNav.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`mb-1 flex h-8 w-full items-center justify-between rounded px-2.5 text-left text-sm ${
                    item === 'Issues' && (activeTab === 'issues' || activeTab === 'today')
                      ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                      : item === 'Inventory' && activeTab === 'assets'
                      ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                      : item === 'Walkthroughs' && activeTab === 'walkthroughs'
                      ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                      : item === 'Maintenance' && activeTab === 'maintenance'
                      ? 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                      : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
                  }`}
                  onClick={() => {
                    if (item === 'Issues') setActiveTab('issues')
                    if (item === 'Inventory') setActiveTab('assets')
                    if (item === 'Walkthroughs') setActiveTab('walkthroughs')
                    if (item === 'Maintenance') setActiveTab('maintenance')
                  }}
                >
                  <span>{item}</span>
                  {item === 'Issues' && <span className="text-[11px] text-zinc-400">{counts.issues}</span>}
                  {item === 'Inventory' && <span className="text-[11px] text-zinc-400">{counts.assets}</span>}
                  {item === 'Maintenance' && <span className="text-[11px] text-zinc-400">{counts.maintenance}</span>}
                </button>
              ))}
            </div>
            <div className="mt-2 border-t border-zinc-200 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-400">Fallback</div>
              <p className="mt-1 text-xs leading-5 text-zinc-500">Raw Baserow table routes remain available by direct URL during rollout.</p>
            </div>
          </aside>

          <main className="min-w-0 bg-white">
            <div className="border-b border-zinc-200">
              <div className="flex items-start justify-between gap-4 px-4 py-3">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-950">Ops Workspace</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">{loading ? 'Loading rows...' : `${activeCount} active ${activeCount === 1 ? 'record' : 'records'}`}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href="/walkthroughs" className="h-8 rounded border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    Log Walkthrough
                  </Link>
                  <Link href="/maintenance" className="h-8 rounded border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50">
                    Log Maintenance
                  </Link>
                </div>
              </div>

              <div className="flex gap-1 overflow-x-auto px-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative h-9 shrink-0 px-3 text-sm font-medium ${
                      activeTab === tab.key ? 'text-[#0A52EF]' : 'text-zinc-500 hover:text-zinc-900'
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500">{counts[tab.key]}</span>
                    {activeTab === tab.key && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#0A52EF]" />}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search rows"
                className="h-8 w-64 rounded border border-zinc-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/25"
              />
              <select
                value={venueFilter}
                onChange={(e) => setVenueFilter(e.target.value)}
                className="h-8 max-w-[240px] rounded border border-zinc-200 bg-white px-2 text-sm text-zinc-700 outline-none focus:ring-2 focus:ring-[#0A52EF]/25"
              >
                <option value="all">All venues</option>
                {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
              </select>
              <div className="ml-auto text-xs text-zinc-500">
                Showing {rows.length} of {activeCount || rows.length}
              </div>
            </div>

            {error ? (
              <div className="m-4 rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>
            ) : loading ? (
              <div className="p-4"><Skeleton className="h-[520px] rounded" /></div>
            ) : (
              <div className="overflow-x-auto">
                {activeTab === 'assets'
                  ? <AssetsTable rows={rows as Asset[]} sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} onSelect={(row) => setSelected({ kind: 'Display', row })} />
                  : activeTab === 'walkthroughs'
                  ? <WalkthroughsTable rows={rows as Walkthrough[]} sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} onSelect={(row) => setSelected({ kind: 'Walkthrough', row })} />
                  : activeTab === 'maintenance'
                  ? <MaintenanceTable rows={rows as Maintenance[]} sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} onSelect={(row) => setSelected({ kind: 'Maintenance', row })} />
                  : <IssuesTable rows={rows as Ticket[]} sortColumn={sortColumn} sortDir={sortDir} onSort={handleSort} onSelect={(row) => setSelected({ kind: 'Issue', row })} />}
              </div>
            )}
          </main>
        </div>
      </div>

      {selected && <DetailDrawer selected={selected} onClose={() => setSelected(null)} />}
    </DashboardLayout>
  )
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center text-sm text-zinc-500">No rows match this view.</td>
    </tr>
  )
}

function IssuesTable({ rows, sortColumn, sortDir, onSort, onSelect }: { rows: Ticket[]; sortColumn: string; sortDir: SortDir; onSort: (c: string) => void; onSelect: (r: Ticket) => void }) {
  return (
    <table className="w-full min-w-[1080px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="border-b border-zinc-200">
          <th className="w-28 px-3 py-1.5 text-left"><SortButton label="Ticket" column="ticket_number" active={sortColumn === 'ticket_number'} dir={sortDir} onSort={onSort} /></th>
          <th className="px-3 py-1.5 text-left"><SortButton label="Title" column="title" active={sortColumn === 'title'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-56 px-3 py-1.5 text-left"><SortButton label="Venue" column="venue_name" active={sortColumn === 'venue_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-28 px-3 py-1.5 text-left"><SortButton label="Priority" column="priority" active={sortColumn === 'priority'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-32 px-3 py-1.5 text-left"><SortButton label="Status" column="status" active={sortColumn === 'status'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-44 px-3 py-1.5 text-left"><SortButton label="Assignee" column="assigned_to_name" active={sortColumn === 'assigned_to_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-36 px-3 py-1.5 text-left"><SortButton label="Created" column="created_at" active={sortColumn === 'created_at'} dir={sortDir} onSort={onSort} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow colSpan={7} /> : rows.map((row) => (
          <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer border-b border-zinc-100 hover:bg-[#F8FBFF]">
            <td className="px-3 py-2 font-mono text-xs text-zinc-500">{row.ticket_number ? `#${row.ticket_number}` : '--'}</td>
            <td className="max-w-[360px] truncate px-3 py-2 font-medium text-zinc-900">{row.title}</td>
            <td className="px-3 py-2"><FieldChip>{row.venue_name || '--'}</FieldChip></td>
            <td className="px-3 py-2"><Pill kind="priority" value={row.priority} /></td>
            <td className="px-3 py-2"><Pill kind="status" value={row.status} /></td>
            <td className="px-3 py-2 text-zinc-600">{row.assigned_to_name || '--'}</td>
            <td className="px-3 py-2 text-xs text-zinc-500">{displayDate(row.created_at)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AssetsTable({ rows, sortColumn, sortDir, onSort, onSelect }: { rows: Asset[]; sortColumn: string; sortDir: SortDir; onSort: (c: string) => void; onSelect: (r: Asset) => void }) {
  return (
    <table className="w-full min-w-[1180px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="border-b border-zinc-200">
          <th className="px-3 py-1.5 text-left"><SortButton label="Display" column="item_name" active={sortColumn === 'item_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-56 px-3 py-1.5 text-left"><SortButton label="Venue" column="venue_name" active={sortColumn === 'venue_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-32 px-3 py-1.5 text-left"><SortButton label="Type" column="display_type" active={sortColumn === 'display_type'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-32 px-3 py-1.5 text-left"><SortButton label="Tri-Code" column="three_letter_code" active={sortColumn === 'three_letter_code'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-36 px-3 py-1.5 text-left"><SortButton label="Location" column="location_code" active={sortColumn === 'location_code'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-40 px-3 py-1.5 text-left"><SortButton label="Maker" column="manufacturer" active={sortColumn === 'manufacturer'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-52 px-3 py-1.5 text-left"><SortButton label="Devices" column="connected_devices" active={sortColumn === 'connected_devices'} dir={sortDir} onSort={onSort} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow colSpan={7} /> : rows.map((row) => (
          <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer border-b border-zinc-100 hover:bg-[#F8FBFF]">
            <td className="max-w-[360px] truncate px-3 py-2 font-medium text-zinc-900">{row.item_name}</td>
            <td className="px-3 py-2"><FieldChip>{row.venue_name || '--'}</FieldChip></td>
            <td className="px-3 py-2 text-zinc-600">{row.display_type || '--'}</td>
            <td className="px-3 py-2 font-mono text-xs text-zinc-600">{row.three_letter_code || '--'}</td>
            <td className="px-3 py-2 text-zinc-600">{row.location_code || row.screen_location || '--'}</td>
            <td className="px-3 py-2 text-zinc-600">{row.manufacturer || '--'}</td>
            <td className="max-w-[240px] truncate px-3 py-2 text-zinc-600">{row.connected_devices || '--'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WalkthroughsTable({ rows, sortColumn, sortDir, onSort, onSelect }: { rows: Walkthrough[]; sortColumn: string; sortDir: SortDir; onSort: (c: string) => void; onSelect: (r: Walkthrough) => void }) {
  return (
    <table className="w-full min-w-[980px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="border-b border-zinc-200">
          <th className="w-36 px-3 py-1.5 text-left"><SortButton label="Date" column="log_date" active={sortColumn === 'log_date'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-56 px-3 py-1.5 text-left"><SortButton label="Venue" column="venue_name" active={sortColumn === 'venue_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-44 px-3 py-1.5 text-left"><SortButton label="Tech" column="technician_name" active={sortColumn === 'technician_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="px-3 py-1.5 text-left"><SortButton label="Locations" column="locations_visited" active={sortColumn === 'locations_visited'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-36 px-3 py-1.5 text-left"><SortButton label="Result" column="result" active={sortColumn === 'result'} dir={sortDir} onSort={onSort} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow colSpan={5} /> : rows.map((row) => (
          <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer border-b border-zinc-100 hover:bg-[#F8FBFF]">
            <td className="px-3 py-2 text-xs text-zinc-500">{displayDate(row.log_date)}</td>
            <td className="px-3 py-2"><FieldChip>{row.venue_name || '--'}</FieldChip></td>
            <td className="px-3 py-2 text-zinc-600">{row.technician_name || '--'}</td>
            <td className="max-w-[420px] truncate px-3 py-2 text-zinc-600">{row.locations_visited || '--'}</td>
            <td className="px-3 py-2"><Pill kind="result" value={row.result} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MaintenanceTable({ rows, sortColumn, sortDir, onSort, onSelect }: { rows: Maintenance[]; sortColumn: string; sortDir: SortDir; onSort: (c: string) => void; onSelect: (r: Maintenance) => void }) {
  return (
    <table className="w-full min-w-[1080px] border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-white">
        <tr className="border-b border-zinc-200">
          <th className="w-56 px-3 py-1.5 text-left"><SortButton label="Venue" column="venue_name" active={sortColumn === 'venue_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-40 px-3 py-1.5 text-left"><SortButton label="Type" column="maintenance_type" active={sortColumn === 'maintenance_type'} dir={sortDir} onSort={onSort} /></th>
          <th className="px-3 py-1.5 text-left"><SortButton label="Issue" column="issue" active={sortColumn === 'issue'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-52 px-3 py-1.5 text-left"><SortButton label="Display" column="asset_name" active={sortColumn === 'asset_name'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-32 px-3 py-1.5 text-left"><SortButton label="Status" column="status" active={sortColumn === 'status'} dir={sortDir} onSort={onSort} /></th>
          <th className="w-36 px-3 py-1.5 text-left"><SortButton label="Date" column="reported_date" active={sortColumn === 'reported_date'} dir={sortDir} onSort={onSort} /></th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <EmptyRow colSpan={6} /> : rows.map((row) => (
          <tr key={row.id} onClick={() => onSelect(row)} className="cursor-pointer border-b border-zinc-100 hover:bg-[#F8FBFF]">
            <td className="px-3 py-2"><FieldChip>{row.venue_name || '--'}</FieldChip></td>
            <td className="px-3 py-2 capitalize text-zinc-600">{row.maintenance_type || '--'}</td>
            <td className="max-w-[380px] truncate px-3 py-2 font-medium text-zinc-900">{row.issue || row.issue_summary || '--'}</td>
            <td className="max-w-[220px] truncate px-3 py-2 text-zinc-600">{row.asset_name || '--'}</td>
            <td className="px-3 py-2"><Pill kind="status" value={row.status} /></td>
            <td className="px-3 py-2 text-xs text-zinc-500">{displayDate(row.reported_date || row.scheduled_date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DetailDrawer({ selected, onClose }: { selected: SelectedRow; onClose: () => void }) {
  const row: any = selected.row
  const title = selected.kind === 'Issue'
    ? row.title
    : selected.kind === 'Display'
    ? row.item_name
    : selected.kind === 'Walkthrough'
    ? `${row.venue_name || 'Walkthrough'} · ${displayDate(row.log_date)}`
    : row.issue || row.issue_summary || 'Maintenance'

  const entries = Object.entries(row).filter(([key, value]) =>
    !['id'].includes(key) && value !== null && value !== undefined && value !== '',
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-zinc-950/25" onClick={onClose}>
      <aside className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{selected.kind}</div>
              <h3 className="mt-1 text-lg font-semibold text-zinc-950">{title}</h3>
            </div>
            <button type="button" onClick={onClose} className="rounded border border-zinc-200 px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-50">Close</button>
          </div>
          {selected.kind === 'Display' && (
            <Link href={`/asset/${row.id}`} className="mt-3 inline-flex h-8 items-center rounded bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800">
              View History Timeline
            </Link>
          )}
        </div>
        <div className="divide-y divide-zinc-100">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[160px_1fr] gap-3 px-5 py-3 text-sm">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">{key.replace(/_/g, ' ')}</div>
              <div className="min-w-0 break-words text-zinc-800">{String(value)}</div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  )
}
