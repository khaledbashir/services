'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

// ---- Types ----

interface Placement {
  id: string
  name: string
  gameDate: string
  gameTime: string | null
  homeTeamId: string
  awayTeamId: string
  sponsorId: string
  executionStatus: string
  homeTVNetwork: string
  awayTVNetwork: string
  nationalTVNetwork: string
  inningScheduled: string
  placementType: string
  nielsenVerified: boolean
  nielsenVerifiedDate: string | null
  sponsorGameCount: number
  season: number
  league: string
  notes: string
  // resolved at render time
  sponsorName?: string
  awayTeamName?: string
  matchup?: string
}

interface Contract {
  id: string
  name: string
  sponsorId: string
  teamId: string
  season: number
  league: string
  contractedGames: number
  actualGames2026: number
  onPaceStatus: string
  contractedLabel: string
  notes: string
  sponsorName?: string
}

interface NielsenVerification {
  id: string
  name: string
  sponsorId: string
  teamId: string | null
  month: string
  year: number
  league: string
  isCorrect: boolean
  verifiedDate: string | null
  verifiedByEmail: string
  discrepancyNotes: string
  sponsorName?: string
}

// ---- Column configs ----

const STATUS_OPTIONS = [
  { value: 'SCHEDULED', label: 'Scheduled', color: 'sky' as const },
  { value: 'EXECUTED', label: 'Executed', color: 'emerald' as const },
  { value: 'NOT_EXECUTED', label: 'Not Executed', color: 'rose' as const },
  { value: 'NATIONAL_GAME', label: 'National Game', color: 'violet' as const },
  { value: 'POSTPONED', label: 'Postponed', color: 'amber' as const },
]

const PACE_OPTIONS = [
  { value: 'ON_PACE', label: 'On Pace', color: 'sky' as const },
  { value: 'AHEAD', label: 'Ahead / Bonused', color: 'emerald' as const },
  { value: 'BEHIND', label: 'Behind', color: 'rose' as const },
  { value: 'FULFILLED', label: 'Fulfilled', color: 'teal' as const },
  { value: 'OVERSOLD', label: 'Oversold', color: 'amber' as const },
]

const MONTH_OPTIONS = [
  { value: 'JAN', label: 'Jan', color: 'zinc' as const },
  { value: 'FEB', label: 'Feb', color: 'zinc' as const },
  { value: 'MAR', label: 'Mar', color: 'emerald' as const },
  { value: 'APR', label: 'Apr', color: 'emerald' as const },
  { value: 'MAY', label: 'May', color: 'emerald' as const },
  { value: 'JUN', label: 'Jun', color: 'sky' as const },
  { value: 'JUL', label: 'Jul', color: 'sky' as const },
  { value: 'AUG', label: 'Aug', color: 'sky' as const },
  { value: 'SEP', label: 'Sep', color: 'amber' as const },
  { value: 'OCT', label: 'Oct', color: 'amber' as const },
  { value: 'NOV', label: 'Nov', color: 'rose' as const },
  { value: 'DEC', label: 'Dec', color: 'rose' as const },
]

const PLACEMENT_COLUMNS: ColumnConfig<Placement>[] = [
  { id: 'gameDate', header: 'Date', type: 'date', width: 110, primary: true },
  {
    id: 'matchup',
    header: 'Matchup',
    type: 'text',
    width: 260,
    editable: false,
  },
  { id: 'sponsorName', header: 'Sponsor', type: 'text', width: 160, editable: false },
  {
    id: 'executionStatus',
    header: 'Status',
    type: 'singleSelect',
    width: 140,
    options: STATUS_OPTIONS,
  },
  { id: 'homeTVNetwork', header: 'Home TV', type: 'text', width: 160 },
  { id: 'awayTVNetwork', header: 'Away TV', type: 'text', width: 160 },
  { id: 'nationalTVNetwork', header: 'National TV', type: 'text', width: 130 },
  { id: 'inningScheduled', header: 'Inning', type: 'text', width: 100 },
  { id: 'placementType', header: 'Position', type: 'text', width: 160, editable: false },
  {
    id: 'nielsenVerified',
    header: '✓ Nielsen',
    type: 'checkbox',
    width: 90,
  },
  { id: 'gameTime', header: 'Time', type: 'text', width: 80, editable: false },
  { id: 'notes', header: 'Notes', type: 'longText', width: 240 },
]

const CONTRACT_COLUMNS: ColumnConfig<Contract>[] = [
  { id: 'sponsorName', header: 'Sponsor', type: 'text', width: 200, primary: true, editable: false },
  { id: 'contractedGames', header: 'Contracted', type: 'number', width: 110 },
  { id: 'actualGames2026', header: 'Actual', type: 'number', width: 100 },
  {
    id: 'onPaceStatus',
    header: 'Pacing',
    type: 'singleSelect',
    width: 150,
    options: PACE_OPTIONS,
  },
  { id: 'contractedLabel', header: 'Contract Type', type: 'text', width: 140, editable: false },
  { id: 'league', header: 'League', type: 'text', width: 80, editable: false },
  { id: 'season', header: 'Season', type: 'number', width: 80, editable: false },
  { id: 'notes', header: 'Notes', type: 'longText', width: 280 },
]

const NIELSEN_COLUMNS: ColumnConfig<NielsenVerification>[] = [
  { id: 'sponsorName', header: 'Sponsor', type: 'text', width: 200, primary: true, editable: false },
  { id: 'month', header: 'Month', type: 'singleSelect', width: 90, options: MONTH_OPTIONS },
  { id: 'year', header: 'Year', type: 'number', width: 70, editable: false },
  { id: 'isCorrect', header: '✓ Verified', type: 'checkbox', width: 90 },
  { id: 'verifiedDate', header: 'Verified Date', type: 'date', width: 130 },
  { id: 'verifiedByEmail', header: 'Verified By', type: 'text', width: 180 },
  { id: 'league', header: 'League', type: 'text', width: 80, editable: false },
  { id: 'discrepancyNotes', header: 'Discrepancy Notes', type: 'longText', width: 300 },
]

// ---- Views ----

const PLACEMENT_VIEWS: ViewConfig<Placement>[] = [
  { id: 'schedule', name: 'Full Schedule', type: 'grid', sort: [{ id: 'gameDate' }] },
  { id: 'by-sponsor', name: 'By Sponsor', type: 'grid', groupBy: 'sponsorName', sort: [{ id: 'gameDate' }] },
  { id: 'by-status', name: 'By Status', type: 'grid', groupBy: 'executionStatus', sort: [{ id: 'gameDate' }] },
  {
    id: 'unverified',
    name: 'Needs Verification',
    type: 'grid',
    filter: (r) => !r.nielsenVerified && r.executionStatus === 'EXECUTED',
    sort: [{ id: 'gameDate' }],
  },
  { id: 'kanban', name: 'Kanban', type: 'kanban', groupBy: 'executionStatus' },
]

const CONTRACT_VIEWS: ViewConfig<Contract>[] = [
  { id: 'all', name: 'All Contracts', type: 'grid', sort: [{ id: 'sponsorName' }] },
  { id: 'by-pace', name: 'By Pacing', type: 'grid', groupBy: 'onPaceStatus', sort: [{ id: 'sponsorName' }] },
]

const NIELSEN_VIEWS: ViewConfig<NielsenVerification>[] = [
  { id: 'all', name: 'All Verifications', type: 'grid', sort: [{ id: 'month' }] },
  { id: 'pending', name: 'Pending', type: 'grid', filter: (r) => !r.isCorrect, sort: [{ id: 'month' }] },
  { id: 'by-sponsor', name: 'By Sponsor', type: 'grid', groupBy: 'sponsorName', sort: [{ id: 'month' }] },
]

// ---- Helpers ----

function formatDate(d: string | null | undefined): string {
  if (!d) return ''
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  } catch {
    return d
  }
}

// ---- Component ----

type ActiveTab = 'placements' | 'contracts' | 'verifications'

export default function MSTeamPage() {
  const params = useParams()
  const companyId = params.companyId as string

  const [loading, setLoading] = useState(true)
  const [teamName, setTeamName] = useState('')
  const [placements, setPlacements] = useState<Placement[]>([])
  const [contracts, setContracts] = useState<Contract[]>([])
  const [verifications, setVerifications] = useState<NielsenVerification[]>([])
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<ActiveTab>('placements')
  const [drawerRow, setDrawerRow] = useState<Placement | Contract | NielsenVerification | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/twenty/ms?companyId=${companyId}`)
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()

      const names: Record<string, string> = data.companyNames || {}
      setCompanyNames(names)

      const team = data.team
      if (team) setTeamName(team.name || '')

      const rawPlacements = (data.placements || []) as Placement[]
      const homeName = team?.name?.replace(/ \|.*$/, '').replace(/ \/.*$/, '') || 'Home'
      const enriched = rawPlacements.map((p) => ({
        ...p,
        sponsorName: names[p.sponsorId] || p.sponsorId?.slice(0, 8) || '—',
        awayTeamName: names[p.awayTeamId] || '',
        matchup: `${homeName} vs ${(names[p.awayTeamId] || '').replace(/ \|.*$/, '').replace(/ \/.*$/, '').replace(/\(.*\)/, '').trim() || 'TBD'}`,
      }))
      setPlacements(enriched)

      const rawContracts = (data.contracts || []) as Contract[]
      setContracts(
        rawContracts.map((c) => ({
          ...c,
          sponsorName: names[c.sponsorId] || c.sponsorId?.slice(0, 8) || '—',
        }))
      )

      const rawVerifications = (data.verifications || []) as NielsenVerification[]
      setVerifications(
        rawVerifications.map((v) => ({
          ...v,
          sponsorName: names[v.sponsorId] || v.sponsorId?.slice(0, 8) || '—',
        }))
      )
    } catch (err) {
      console.error('M&S load error:', err)
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const updatePlacement = useCallback(async (rowId: string, columnId: string, value: unknown) => {
    const res = await fetch('/api/twenty/ms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectType: 'mediaPlacements',
        id: rowId,
        fields: { [columnId]: value },
      }),
    })
    if (!res.ok) throw new Error('save failed')
    setPlacements((prev) =>
      prev.map((p) => (p.id === rowId ? { ...p, [columnId]: value } : p))
    )
  }, [])

  const updateContract = useCallback(async (rowId: string, columnId: string, value: unknown) => {
    const res = await fetch('/api/twenty/ms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectType: 'sponsorTeamContracts',
        id: rowId,
        fields: { [columnId]: value },
      }),
    })
    if (!res.ok) throw new Error('save failed')
    setContracts((prev) =>
      prev.map((c) => (c.id === rowId ? { ...c, [columnId]: value } : c))
    )
  }, [])

  const updateVerification = useCallback(async (rowId: string, columnId: string, value: unknown) => {
    const res = await fetch('/api/twenty/ms', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        objectType: 'nielsenVerifications',
        id: rowId,
        fields: { [columnId]: value },
      }),
    })
    if (!res.ok) throw new Error('save failed')
    setVerifications((prev) =>
      prev.map((v) => (v.id === rowId ? { ...v, [columnId]: value } : v))
    )
  }, [])

  // ---- Stats ----

  const stats = useMemo(() => {
    const total = placements.length
    const executed = placements.filter((p) => p.executionStatus === 'EXECUTED').length
    const scheduled = placements.filter((p) => p.executionStatus === 'SCHEDULED').length
    const national = placements.filter((p) => p.executionStatus === 'NATIONAL_GAME').length
    const postponed = placements.filter((p) => p.executionStatus === 'POSTPONED').length
    const notExecuted = placements.filter((p) => p.executionStatus === 'NOT_EXECUTED').length
    const verified = placements.filter((p) => p.nielsenVerified).length
    const uniqueSponsors = new Set(placements.map((p) => p.sponsorId)).size
    const contractTotal = contracts.reduce((s, c) => s + (c.contractedGames || 0), 0)
    const contractActual = contracts.reduce((s, c) => s + (c.actualGames2026 || 0), 0)

    return { total, executed, scheduled, national, postponed, notExecuted, verified, uniqueSponsors, contractTotal, contractActual }
  }, [placements, contracts])

  const TABS: { key: ActiveTab; label: string; count: number }[] = [
    { key: 'placements', label: 'Game Schedule', count: placements.length },
    { key: 'contracts', label: 'Sponsor Contracts', count: contracts.length },
    { key: 'verifications', label: 'Nielsen Verification', count: verifications.length },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-900">
              {loading ? 'Loading…' : teamName || 'Team'}
            </h1>
            <span className="text-sm text-zinc-400 font-mono">Media & Sponsorship</span>
          </div>
          {!loading && (
            <p className="mt-1 text-sm text-zinc-500">
              {stats.total} placements · {stats.uniqueSponsors} sponsors · {stats.executed} executed · {stats.verified} Nielsen-verified
            </p>
          )}
        </div>

        {/* Stats cards */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard label="Total Games" value={stats.total} />
            <StatCard label="Executed" value={stats.executed} color="emerald" />
            <StatCard label="Scheduled" value={stats.scheduled} color="sky" />
            <StatCard label="National" value={stats.national} color="violet" />
            <StatCard label="Contracted" value={stats.contractTotal} color="amber" />
            <StatCard label="Nielsen ✓" value={stats.verified} color="teal" />
          </div>
        )}

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-zinc-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-zinc-900 text-zinc-900'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
              }`}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-zinc-400">{tab.count}</span>
            </button>
          ))}
          <a
            href={`https://crm.ancsports.net/object/company/${companyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto px-3 py-2 text-xs text-zinc-400 hover:text-zinc-600 transition-colors flex items-center gap-1"
          >
            Open in CRM ↗
          </a>
        </div>

        {/* Grid: Placements */}
        {activeTab === 'placements' && (
          <DataGrid<Placement>
            columns={PLACEMENT_COLUMNS}
            rows={placements}
            loading={loading}
            views={PLACEMENT_VIEWS}
            persistKey={`ms-placements:${companyId}`}
            onUpdateCell={updatePlacement}
            onOpenRecord={(r) => setDrawerRow(r)}
            emptyText="No placements found for this team."
            enableSelection
          />
        )}

        {/* Grid: Contracts */}
        {activeTab === 'contracts' && (
          <DataGrid<Contract>
            columns={CONTRACT_COLUMNS}
            rows={contracts}
            loading={loading}
            views={CONTRACT_VIEWS}
            persistKey={`ms-contracts:${companyId}`}
            onUpdateCell={updateContract}
            onOpenRecord={(r) => setDrawerRow(r)}
            emptyText="No sponsor contracts found for this team."
          />
        )}

        {/* Grid: Nielsen */}
        {activeTab === 'verifications' && (
          <DataGrid<NielsenVerification>
            columns={NIELSEN_COLUMNS}
            rows={verifications}
            loading={loading}
            views={NIELSEN_VIEWS}
            persistKey={`ms-nielsen:${companyId}`}
            onUpdateCell={updateVerification}
            onOpenRecord={(r) => setDrawerRow(r)}
            emptyText="No Nielsen verifications found for this team."
          />
        )}

        {/* Record drawer — works for all three record types */}
        {drawerRow && activeTab === 'placements' && (
          <RecordDrawer<Placement>
            open
            row={drawerRow as Placement}
            columns={PLACEMENT_COLUMNS}
            onClose={() => setDrawerRow(null)}
            onUpdate={updatePlacement}
            title={(r) => r.name || `${r.gameDate} — ${r.sponsorName}`}
          />
        )}
        {drawerRow && activeTab === 'contracts' && (
          <RecordDrawer<Contract>
            open
            row={drawerRow as Contract}
            columns={CONTRACT_COLUMNS}
            onClose={() => setDrawerRow(null)}
            onUpdate={updateContract}
            title={(r) => r.sponsorName || r.name}
          />
        )}
        {drawerRow && activeTab === 'verifications' && (
          <RecordDrawer<NielsenVerification>
            open
            row={drawerRow as NielsenVerification}
            columns={NIELSEN_COLUMNS}
            onClose={() => setDrawerRow(null)}
            onUpdate={updateVerification}
            title={(r) => `${r.sponsorName} — ${r.month} ${r.year}`}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

// ---- Stat Card ----

function StatCard({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color?: 'emerald' | 'sky' | 'violet' | 'amber' | 'teal' | 'rose'
}) {
  const colorClasses: Record<string, string> = {
    emerald: 'text-emerald-600',
    sky: 'text-sky-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    teal: 'text-teal-600',
    rose: 'text-rose-600',
  }
  return (
    <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className={`text-2xl font-semibold tabular-nums ${color ? colorClasses[color] || '' : 'text-zinc-900'}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
    </div>
  )
}
