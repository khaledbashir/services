'use client'

// ---------------------------------------------------------------------------
// SUBMITTAL TRACKER — refined per the ANC Project Workspace design spec (§4).
//
// Built to match how Jesse (ANC PM) thinks: the page is colored by *who holds
// the baton*. The default view groups submittals by ball-in-court so the PM
// instantly sees "what's with the owner" vs "back on us". Disposition is the
// secondary axis (the formal Letter-of-Transmittal outcome). Submitted /
// returned dates are surfaced on every card and row.
//
// Token discipline (inherited, not invented): rounded-md cards, rounded pills,
// border-[#E8E8E8] hairlines, #0A52EF primary, #7350FF as the single identity
// accent (the stuck-submittal edge), tracking-[0.14em] uppercase eyebrows,
// tabular-nums on every date / number, ring-1 pill badges, light-first with the
// centralized .dark override.
//
// Inline-edit behavior is preserved from project-deployment-editable.tsx: the
// same optimistic PATCH to /api/project-schedule/[id]/items with
// { itemKind: 'submittal', itemKey, ...patch }, re-reading activeProjects from
// the response envelope.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Save,
  Send,
  X,
} from 'lucide-react'
import type {
  ActiveProject,
  BallInCourt,
  SubmittalDisposition,
  SubmittalRegisterItem,
} from '@/lib/project-schedule'
import { SubmittalOcrUpload } from './submittal-ocr-upload'

// Mirror the lib's exported enums locally — a value import from
// lib/project-schedule would pull the server-only db module into the client
// bundle (the same reason project-workspace-client.tsx keeps these local).
const BALL_IN_COURT_VALUES: readonly BallInCourt[] = ['anc', 'owner', 'engineer', 'qad', 'none']
const SUBMITTAL_DISPOSITIONS: readonly SubmittalDisposition[] = [
  'for-approval',
  'approved-as-submitted',
  'approved-as-noted',
  'returned-for-corrections',
  'resubmit',
  'approved',
]

const BRAND = '#0A52EF'
const ACCENT = '#7350FF'
const TODAY = new Date()

// ---------------------------------------------------------------------------
// Ball-in-court — the organizing identity. Each holder gets a stable color so
// the same baton reads identically on a column header, a card chip, and a row.
// ---------------------------------------------------------------------------

const ballLabels: Record<BallInCourt, string> = {
  anc: 'ANC (us)',
  owner: 'Owner',
  engineer: 'Engineer',
  qad: 'QAD',
  none: 'Cleared',
}

const ballShort: Record<BallInCourt, string> = {
  anc: 'ANC',
  owner: 'Owner',
  engineer: 'Engineer',
  qad: 'QAD',
  none: 'Cleared',
}

// Color-coded chip styles (ring-1 family). ANC is the brand blue — "this is
// your move". The rest are distinct hues so a glance at the board reads as a
// relay, not a status list.
const ballChip: Record<BallInCourt, string> = {
  anc: 'bg-[#0A52EF]/10 text-[#0A52EF] ring-[#0A52EF]/20',
  owner: 'bg-violet-50 text-violet-700 ring-violet-100',
  engineer: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
  qad: 'bg-amber-50 text-amber-700 ring-amber-100',
  none: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
}

// Column accent bar at the top of each ball-in-court column.
const ballAccent: Record<BallInCourt, string> = {
  anc: 'bg-[#0A52EF]',
  owner: 'bg-violet-400',
  engineer: 'bg-cyan-400',
  qad: 'bg-amber-400',
  none: 'bg-emerald-400',
}

const BALL_ORDER: BallInCourt[] = [...BALL_IN_COURT_VALUES]

// ---------------------------------------------------------------------------
// Disposition — the formal outcome. Four pill colors per the spec.
// ---------------------------------------------------------------------------

const dispositionLabels: Record<SubmittalDisposition, string> = {
  'for-approval': 'For approval',
  'approved-as-submitted': 'Approved as submitted',
  'approved-as-noted': 'Approved as noted',
  'returned-for-corrections': 'Returned for corrections',
  resubmit: 'Resubmit',
  approved: 'Approved',
}

function isApprovedDisposition(d: SubmittalDisposition | null): boolean {
  return d === 'approved' || d === 'approved-as-submitted' || d === 'approved-as-noted'
}

function isReturnedDisposition(d: SubmittalDisposition | null): boolean {
  return d === 'returned-for-corrections' || d === 'resubmit'
}

// Pill color: disposition wins; falls back to legacy status when unset.
function dispositionStyle(item: SubmittalRegisterItem): string {
  const d = item.disposition
  if (isApprovedDisposition(d)) return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (isReturnedDisposition(d)) return 'bg-amber-50 text-amber-700 ring-amber-100'
  if (d === 'for-approval') return 'bg-blue-50 text-blue-700 ring-blue-100'
  if (item.status === 'approved') return 'bg-emerald-50 text-emerald-700 ring-emerald-100'
  if (item.status === 'returned') return 'bg-amber-50 text-amber-700 ring-amber-100'
  if (item.status === 'submitted') return 'bg-blue-50 text-blue-700 ring-blue-100'
  return 'bg-rose-50 text-rose-700 ring-rose-100'
}

function dispositionText(item: SubmittalRegisterItem): string {
  if (item.disposition) return dispositionLabels[item.disposition]
  return item.status.charAt(0).toUpperCase() + item.status.slice(1)
}

// A submittal is "open" (still a live blocker) until its disposition is an
// approval — or, lacking a disposition, until its legacy status is approved.
function isOpen(item: SubmittalRegisterItem): boolean {
  if (item.disposition) return !isApprovedDisposition(item.disposition)
  return item.status !== 'approved'
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseISO(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function isPastDue(item: SubmittalRegisterItem): boolean {
  const due = parseISO(item.dueDate)
  return due ? due < TODAY && isOpen(item) : false
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const inputClass =
  'h-9 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20'

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ring-1 ${className}`}>
      {children}
    </span>
  )
}

// The signature ball-in-court indicator — a color-coded baton chip.
function BallChip({ ball, prominent }: { ball: BallInCourt; prominent?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded ring-1 ${prominent ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'} font-semibold ${ballChip[ball]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {prominent ? ballLabels[ball] : ballShort[ball]}
    </span>
  )
}

function EmptyDash({ value }: { value?: string | null }) {
  return value ? <>{value}</> : <span className="text-zinc-300">—</span>
}

function ErrorStrip({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top-level tracker
// ---------------------------------------------------------------------------

type GroupBy = 'ball' | 'disposition' | 'package'
type ViewMode = 'board' | 'table'

// Controlled submittal board — the Submittals tab content inside the unified
// Project Workspace. The workspace owns the project/submittal state (so the
// Schedule tab's ball-in-court gutter and the tab badges stay in sync); this
// component renders the relay readout + filters + board/table and calls
// onProjectChange after every optimistic/confirmed PATCH.
export function SubmittalBoard({
  projectId,
  project,
  onProjectChange,
}: {
  projectId: string
  project: ActiveProject
  onProjectChange: (project: ActiveProject) => void
}) {
  const setProject = onProjectChange
  const submittals = project.submittals

  const [groupBy, setGroupBy] = useState<GroupBy>('ball')
  const [view, setView] = useState<ViewMode>('board')
  const [search, setSearch] = useState('')
  const [dispositionFilter, setDispositionFilter] = useState<SubmittalDisposition | 'all'>('all')
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [latestOnly, setLatestOnly] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)

  // Shared optimistic PATCH — preserves the inline-edit contract from
  // project-deployment-editable.tsx.
  async function patchItem(itemKey: string, patch: Record<string, unknown>, optimistic?: SubmittalRegisterItem) {
    setSavingId(itemKey)
    setError(null)
    const previous = project
    if (optimistic) {
      setProject({ ...project, submittals: submittals.map((s) => (s.id === itemKey ? optimistic : s)) })
    }
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemKind: 'submittal', itemKey, ...patch }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || "Couldn't save the submittal. Check the connection and try again.")
      const next = (payload.data.activeProjects as ActiveProject[]).find((p) => p.id === projectId)
      if (next) setProject(next)
      setEditingId(null)
    } catch (err) {
      setProject(previous)
      setError(err instanceof Error ? err.message : "Couldn't save the submittal. Check the connection and try again.")
    } finally {
      setSavingId(null)
    }
  }

  function reassign(itemKey: string, ballInCourt: BallInCourt) {
    const current = submittals.find((s) => s.id === itemKey)
    if (!current || current.ballInCourt === ballInCourt) return
    patchItem(itemKey, { ballInCourt }, { ...current, ballInCourt })
  }

  // ---- filtering -----------------------------------------------------------
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return submittals.filter((s) => {
      if (latestOnly && !s.latestRevision) return false
      if (overdueOnly && !isPastDue(s)) return false
      if (dispositionFilter !== 'all' && s.disposition !== dispositionFilter) return false
      if (q) {
        const hay = `${s.submittalNo} ${s.packageType} ${s.title} ${s.owner}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [submittals, search, latestOnly, overdueOnly, dispositionFilter])

  // ---- counts (for the header readout) -------------------------------------
  const openCount = submittals.filter(isOpen).length
  const ballCounts = useMemo(() => {
    const acc: Record<BallInCourt, number> = { anc: 0, owner: 0, engineer: 0, qad: 0, none: 0 }
    for (const s of submittals) if (isOpen(s)) acc[s.ballInCourt] += 1
    return acc
  }, [submittals])

  // ---- grouping ------------------------------------------------------------
  const columns = useMemo(() => buildColumns(filtered, groupBy), [filtered, groupBy])

  if (!submittals.length) {
    return (
      <div className="space-y-4">
        <BallReadout ballCounts={ballCounts} />
        <div className="flex flex-col items-center rounded-md border border-dashed border-[#E8E8E8] bg-white p-10 text-center">
          <FileText className="h-7 w-7 text-zinc-300" />
          <h3 className="mt-3 text-sm font-semibold text-zinc-950">No submittals logged</h3>
          <p className="mt-1 text-sm text-zinc-500">
            Submittals derive from this project&apos;s deployment package — or upload drawings to auto-create them.
          </p>
          <div className="mt-4">
            <SubmittalOcrUpload projectId={projectId} onCreated={setProject} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <BallReadout openCount={openCount} ballCounts={ballCounts} />
      {error ? <ErrorStrip message={error} /> : null}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#E8E8E8] bg-white p-3 shadow-sm">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search no., package, owner"
          className="h-9 min-w-[200px] flex-1 rounded-md border border-[#E8E8E8] px-3 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20"
        />

        {/* Group-by */}
        <div className="inline-flex items-center gap-1.5">
          <span className="hidden text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 sm:inline">Group</span>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="h-9 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-sm text-zinc-700 outline-none focus:border-[#0A52EF]"
          >
            <option value="ball">Ball in court</option>
            <option value="disposition">Disposition</option>
            <option value="package">Package type</option>
          </select>
        </div>

        {/* Disposition filter */}
        <select
          value={dispositionFilter}
          onChange={(e) => setDispositionFilter(e.target.value as SubmittalDisposition | 'all')}
          className="h-9 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-sm text-zinc-700 outline-none focus:border-[#0A52EF]"
        >
          <option value="all">All dispositions</option>
          {SUBMITTAL_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {dispositionLabels[d]}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setOverdueOnly((v) => !v)}
          className={`h-9 rounded-md px-3 text-xs font-semibold ring-1 transition ${overdueOnly ? 'bg-[#0A52EF] text-white ring-[#0A52EF]' : 'bg-white text-zinc-600 ring-[#E8E8E8] hover:bg-zinc-50'}`}
        >
          Overdue only
        </button>
        <button
          type="button"
          onClick={() => setLatestOnly((v) => !v)}
          className={`h-9 rounded-md px-3 text-xs font-semibold ring-1 transition ${latestOnly ? 'bg-[#0A52EF] text-white ring-[#0A52EF]' : 'bg-white text-zinc-600 ring-[#E8E8E8] hover:bg-zinc-50'}`}
        >
          Latest rev only
        </button>

        {/* Board / Table toggle */}
        <div className="inline-flex rounded-md border border-[#E8E8E8] bg-zinc-50 p-1">
          {(['board', 'table'] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded px-3 py-1 text-xs font-medium capitalize transition ${view === v ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
            >
              {v}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => downloadSubmittalCsv(filtered)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-[#E8E8E8] px-3 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          <Download className="h-4 w-4" /> CSV
        </button>

        <SubmittalOcrUpload projectId={projectId} onCreated={setProject} />
      </div>

      {view === 'board' ? (
        <Board
          columns={columns}
          groupBy={groupBy}
          projectId={projectId}
          savingId={savingId}
          dragId={dragId}
          dragOver={dragOver}
          setDragId={setDragId}
          setDragOver={setDragOver}
          onReassign={reassign}
        />
      ) : (
        <RegisterTable
          items={filtered}
          projectId={projectId}
          editingId={editingId}
          savingId={savingId}
          onEdit={(id) => {
            setEditingId(id)
            setError(null)
          }}
          onCancel={() => setEditingId(null)}
          onSave={(id, patch) => patchItem(id, patch)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Ball-in-court readout — the relay at a glance. One chip per holder with the
// live open count, ANC ringed as "your move".
// ---------------------------------------------------------------------------

function BallReadout({
  openCount,
  ballCounts,
}: {
  openCount?: number
  ballCounts: Record<BallInCourt, number>
}) {
  return (
    <div className="space-y-3">
      {openCount !== undefined ? (
        <p className="text-sm text-zinc-500">
          <span className="font-semibold tabular-nums" style={{ color: BRAND }}>
            {openCount}
          </span>{' '}
          open {openCount === 1 ? 'submittal' : 'submittals'} across the relay
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {BALL_ORDER.map((ball) => (
          <div
            key={ball}
            className={`inline-flex items-center gap-2 rounded-md border border-[#E8E8E8] bg-white px-3 py-2 shadow-sm ${ball === 'anc' ? 'ring-1 ring-[#0A52EF]/20' : ''}`}
          >
            <BallChip ball={ball} prominent />
            <span className="text-sm font-semibold tabular-nums text-zinc-900">{ballCounts[ball]}</span>
            <span className="text-xs text-zinc-400">open</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Board — kanban grouped by ball-in-court (default), disposition, or package.
// ---------------------------------------------------------------------------

type Column = {
  key: string
  label: string
  ball: BallInCourt | null // non-null only when grouped by ball (enables drag-reassign)
  items: SubmittalRegisterItem[]
}

function buildColumns(items: SubmittalRegisterItem[], groupBy: GroupBy): Column[] {
  if (groupBy === 'ball') {
    return BALL_ORDER.map((ball) => ({
      key: ball,
      label: ballLabels[ball],
      ball,
      items: items.filter((s) => s.ballInCourt === ball),
    }))
  }
  if (groupBy === 'disposition') {
    const cols: Column[] = SUBMITTAL_DISPOSITIONS.map((d) => ({
      key: d,
      label: dispositionLabels[d],
      ball: null,
      items: items.filter((s) => s.disposition === d),
    }))
    const unset = items.filter((s) => !s.disposition)
    if (unset.length) cols.unshift({ key: 'unset', label: 'No disposition', ball: null, items: unset })
    return cols.filter((c) => c.items.length)
  }
  // package
  const byPackage = new Map<string, SubmittalRegisterItem[]>()
  for (const s of items) {
    const pkg = s.packageType || 'Unpackaged'
    if (!byPackage.has(pkg)) byPackage.set(pkg, [])
    byPackage.get(pkg)!.push(s)
  }
  return Array.from(byPackage.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([pkg, list]) => ({ key: pkg, label: pkg, ball: null, items: list }))
}

function Board({
  columns,
  groupBy,
  projectId,
  savingId,
  dragId,
  dragOver,
  setDragId,
  setDragOver,
  onReassign,
}: {
  columns: Column[]
  groupBy: GroupBy
  projectId: string
  savingId: string | null
  dragId: string | null
  dragOver: string | null
  setDragId: (id: string | null) => void
  setDragOver: (key: string | null) => void
  onReassign: (id: string, ball: BallInCourt) => void
}) {
  const gridCols =
    groupBy === 'ball'
      ? 'md:grid-cols-2 xl:grid-cols-5'
      : 'md:grid-cols-2 xl:grid-cols-3'

  return (
    <div className={`grid gap-4 ${gridCols}`}>
      {columns.map((col) => {
        // Worst-disposition top rule: returned → amber, open+overdue → rose.
        const worst = col.items.reduce<'returned' | 'needed' | null>((acc, item) => {
          if (isReturnedDisposition(item.disposition) || item.status === 'returned') return 'returned'
          if ((isOpen(item) && isPastDue(item)) && acc !== 'returned') return 'needed'
          return acc
        }, null)
        const topRule =
          col.ball
            ? ballAccent[col.ball]
            : worst === 'returned'
              ? 'bg-amber-400'
              : worst === 'needed'
                ? 'bg-rose-400'
                : 'bg-[#E8E8E8]'
        const isAnc = col.ball === 'anc'
        const canDrop = col.ball !== null

        return (
          <div
            key={col.key}
            onDragOver={canDrop ? (e) => { e.preventDefault(); setDragOver(col.key) } : undefined}
            onDragLeave={canDrop ? () => setDragOver(null) : undefined}
            onDrop={
              canDrop
                ? () => {
                    if (dragId && col.ball) onReassign(dragId, col.ball)
                    setDragId(null)
                    setDragOver(null)
                  }
                : undefined
            }
            className={`flex flex-col rounded-md border border-[#E8E8E8] ${isAnc ? 'bg-[#0A52EF]/[0.04]' : 'bg-zinc-50'} ${dragOver === col.key ? 'ring-2 ring-[#0A52EF]/30' : ''}`}
          >
            <div className={`h-0.5 rounded-t ${topRule}`} />
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="truncate text-sm font-semibold text-zinc-900">{col.label}</span>
              <span className="rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-zinc-500 ring-1 ring-[#E8E8E8]">
                {col.items.length}
              </span>
            </div>
            <div className="flex-1 space-y-2 px-2 pb-3">
              {col.items.length ? (
                col.items.map((item) => (
                  <SubmittalCard
                    key={item.id}
                    item={item}
                    projectId={projectId}
                    saving={savingId === item.id}
                    showBall={!col.ball}
                    onDragStart={() => setDragId(item.id)}
                    onReassign={onReassign}
                  />
                ))
              ) : col.ball ? (
                <p className="px-1 py-3 text-xs text-zinc-400">Nothing in {ballShort[col.ball]}&apos;s court</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SubmittalCard({
  item,
  projectId,
  saving,
  showBall,
  onDragStart,
  onReassign,
}: {
  item: SubmittalRegisterItem
  projectId: string
  saving: boolean
  showBall: boolean
  onDragStart: () => void
  onReassign: (id: string, ball: BallInCourt) => void
}) {
  const pastDue = isPastDue(item)
  const stuck = isReturnedDisposition(item.disposition) || item.status === 'returned'
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="cursor-grab rounded-md border border-[#E8E8E8] border-l-[3px] bg-white p-3 shadow-sm transition hover:border-[#0A52EF]/40 active:cursor-grabbing"
      style={{ borderLeftColor: stuck ? ACCENT : 'transparent' }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-zinc-900">{item.submittalNo}</span>
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-zinc-500">
            Rev {item.revision || '0'}
          </span>
        </div>
        <Pill className={dispositionStyle(item)}>{dispositionText(item)}</Pill>
      </div>

      <div className="mt-1.5 truncate text-sm font-medium text-zinc-900">{item.title}</div>
      <div className="mt-0.5 text-xs text-zinc-500">{item.packageType}</div>

      {/* Submitted / returned dates */}
      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="uppercase tracking-wide text-zinc-400">Submitted</div>
          <div className="tabular-nums text-zinc-700">
            <EmptyDash value={item.submittedDate} />
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wide text-zinc-400">Returned</div>
          <div className="tabular-nums text-zinc-700">
            <EmptyDash value={item.returnedDate} />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className={`text-xs tabular-nums ${pastDue ? 'font-semibold text-rose-600' : 'text-zinc-500'}`}>
          {item.dueDate ? `due ${item.dueDate}` : 'no due date'}
        </span>
        <div className="flex items-center gap-1.5">
          {item.latestRevision ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Latest revision" /> : null}
          {showBall ? <BallChip ball={item.ballInCourt} /> : null}
          <Link
            href={`/project-schedule/${encodeURIComponent(projectId)}/transmittal/${item.id}`}
            className="inline-flex h-7 items-center gap-1 rounded border border-[#E8E8E8] px-2 text-[11px] font-semibold text-zinc-500 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
          >
            <Send className="h-3 w-3" /> Transmit
          </Link>
        </div>
      </div>

      {/* Court reassign (keyboard / non-drag fallback) */}
      <div className="mt-2 flex items-center gap-1.5 border-t border-[#E8E8E8] pt-2">
        <span className="text-[10px] uppercase tracking-wide text-zinc-400">Court</span>
        <select
          value={item.ballInCourt}
          disabled={saving}
          onChange={(e) => onReassign(item.id, e.target.value as BallInCourt)}
          className="h-7 flex-1 rounded border border-[#E8E8E8] bg-white px-1.5 text-xs text-zinc-700 outline-none focus:border-[#0A52EF]"
        >
          {BALL_ORDER.map((b) => (
            <option key={b} value={b}>
              {ballLabels[b]}
            </option>
          ))}
        </select>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" /> : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Register table — the dense view, with inline edit preserved.
// ---------------------------------------------------------------------------

function RegisterTable({
  items,
  projectId,
  editingId,
  savingId,
  onEdit,
  onCancel,
  onSave,
}: {
  items: SubmittalRegisterItem[]
  projectId: string
  editingId: string | null
  savingId: string | null
  onEdit: (id: string) => void
  onCancel: () => void
  onSave: (id: string, patch: Record<string, unknown>) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#E8E8E8] bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-zinc-50">
          <tr className="border-b border-[#E8E8E8]">
            {['No.', 'Package', 'Rev', 'Disposition', 'Ball in court', 'Submitted', 'Returned', 'Due', ''].map((h) => (
              <th key={h} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <RegisterRow
              key={item.id}
              item={item}
              projectId={projectId}
              isEditing={editingId === item.id}
              isSaving={savingId === item.id}
              onEdit={() => onEdit(item.id)}
              onCancel={onCancel}
              onSave={(patch) => onSave(item.id, patch)}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function RegisterRow({
  item,
  projectId,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
}: {
  item: SubmittalRegisterItem
  projectId: string
  isEditing: boolean
  isSaving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [disposition, setDisposition] = useState<SubmittalDisposition | ''>(item.disposition ?? '')
  const [ballInCourt, setBallInCourt] = useState<BallInCourt>(item.ballInCourt)
  const [submittedDate, setSubmittedDate] = useState(item.submittedDate)
  const [returnedDate, setReturnedDate] = useState(item.returnedDate)
  const [owner, setOwner] = useState(item.owner)
  const [dueDate, setDueDate] = useState(item.dueDate)

  function startEdit() {
    setDisposition(item.disposition ?? '')
    setBallInCourt(item.ballInCourt)
    setSubmittedDate(item.submittedDate)
    setReturnedDate(item.returnedDate)
    setOwner(item.owner)
    setDueDate(item.dueDate)
    onEdit()
  }

  if (!isEditing) {
    const pastDue = isPastDue(item)
    return (
      <tr className="group border-b border-[#E8E8E8] align-top last:border-b-0 hover:bg-zinc-50/70">
        <td className="px-4 py-3 text-sm font-semibold tabular-nums text-zinc-900">{item.submittalNo}</td>
        <td className="min-w-[200px] px-4 py-3">
          <div className="text-sm font-medium text-zinc-950">{item.packageType}</div>
          <div className="mt-1 text-xs text-zinc-500">{item.title}</div>
        </td>
        <td className="px-4 py-3 text-sm tabular-nums text-zinc-700">{item.revision || '0'}</td>
        <td className="px-4 py-3">
          <Pill className={dispositionStyle(item)}>{dispositionText(item)}</Pill>
        </td>
        <td className="px-4 py-3">
          <BallChip ball={item.ballInCourt} prominent />
        </td>
        <td className="min-w-[120px] px-4 py-3 text-sm tabular-nums text-zinc-700">
          <EmptyDash value={item.submittedDate} />
        </td>
        <td className="min-w-[120px] px-4 py-3 text-sm tabular-nums text-zinc-700">
          <EmptyDash value={item.returnedDate} />
        </td>
        <td className={`min-w-[120px] px-4 py-3 text-sm tabular-nums ${pastDue ? 'font-semibold text-rose-600' : 'text-zinc-700'}`}>
          <EmptyDash value={item.dueDate} />
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/project-schedule/${encodeURIComponent(projectId)}/transmittal/${item.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
            >
              <Send className="h-3.5 w-3.5" /> Transmit
            </Link>
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-[#E8E8E8] bg-zinc-50/60 align-top last:border-b-0">
      <td className="px-4 py-3 text-sm font-semibold tabular-nums text-zinc-900">{item.submittalNo}</td>
      <td className="min-w-[200px] px-4 py-3">
        <div className="text-sm font-medium text-zinc-950">{item.packageType}</div>
        <div className="mt-1 text-xs text-zinc-500">{item.title}</div>
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-zinc-700">{item.revision || '0'}</td>
      <td className="px-4 py-3">
        <select
          value={disposition}
          onChange={(e) => setDisposition(e.target.value as SubmittalDisposition | '')}
          className={inputClass}
        >
          <option value="">— Set disposition —</option>
          {SUBMITTAL_DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {dispositionLabels[d]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <select value={ballInCourt} onChange={(e) => setBallInCourt(e.target.value as BallInCourt)} className={inputClass}>
          {BALL_ORDER.map((b) => (
            <option key={b} value={b}>
              {ballLabels[b]}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-[140px] px-4 py-3">
        <input type="date" value={submittedDate.slice(0, 10)} onChange={(e) => setSubmittedDate(e.target.value)} className={`${inputClass} tabular-nums`} />
      </td>
      <td className="min-w-[140px] px-4 py-3">
        <input type="date" value={returnedDate.slice(0, 10)} onChange={(e) => setReturnedDate(e.target.value)} className={`${inputClass} tabular-nums`} />
      </td>
      <td className="min-w-[140px] px-4 py-3">
        <input type="date" value={dueDate.slice(0, 10)} onChange={(e) => setDueDate(e.target.value)} className={`${inputClass} tabular-nums`} />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-stretch gap-2">
          <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" className={inputClass} />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() =>
                onSave({
                  disposition: disposition || null,
                  ballInCourt,
                  submittedDate,
                  returnedDate,
                  owner,
                  dueDate,
                })
              }
              disabled={isSaving}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#0A52EF] px-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} {isSaving ? 'Saving' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSaving}
              className="inline-flex h-8 items-center rounded-md border border-[#E8E8E8] px-2 text-zinc-500 hover:bg-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// CSV — includes the new lifecycle columns.
// ---------------------------------------------------------------------------

function downloadSubmittalCsv(items: SubmittalRegisterItem[]) {
  const headers = ['Submittal No.', 'Package', 'Title', 'Revision', 'Disposition', 'Ball in court', 'Submitted', 'Returned', 'Owner', 'Due Date', 'Latest']
  const rows = items.map((item) => [
    item.submittalNo,
    item.packageType,
    item.title,
    item.revision,
    item.disposition ? dispositionLabels[item.disposition] : item.status,
    ballLabels[item.ballInCourt],
    item.submittedDate,
    item.returnedDate,
    item.owner,
    item.dueDate,
    item.latestRevision ? 'Yes' : 'No',
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'anc-submittal-tracker.csv'
  link.click()
  URL.revokeObjectURL(url)
}
