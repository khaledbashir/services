'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import type {
  ActiveProject,
  BallInCourt,
  DeploymentStatus,
  ProjectScheduleTask,
  SubmittalRegisterItem,
  Transmittal,
} from '@/lib/project-schedule'
import { ProjectDeploymentEditable } from './project-deployment-editable'
import { SubmittalBoard } from './submittal-board'

// ---------------------------------------------------------------------------
// Tokens / shared maps
// ---------------------------------------------------------------------------

const BRAND = '#0A52EF'
const ACCENT = '#7350FF'

// Today baseline matches the lib's daysUntil() reference window.
const TODAY = new Date()

const deploymentLabels: Record<DeploymentStatus, string> = {
  blocked: 'Blocked',
  'needs-docs': 'Needs docs',
  'needs-update': 'Needs update',
  ready: 'Ready',
  complete: 'Complete',
}

const deploymentStyles: Record<DeploymentStatus, string> = {
  blocked: 'bg-rose-50 text-rose-700 ring-rose-100',
  'needs-docs': 'bg-orange-50 text-orange-700 ring-orange-100',
  'needs-update': 'bg-amber-50 text-amber-700 ring-amber-100',
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  complete: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
}

const ballLabels: Record<BallInCourt, string> = {
  anc: 'ANC',
  owner: 'Owner',
  engineer: 'Engineer',
  qad: 'QAD',
  none: 'Cleared',
}

const ballOrder: BallInCourt[] = ['anc', 'owner', 'engineer', 'qad', 'none']

const inputClass =
  'h-10 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20'

const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

// Phase ordering follows the app's existing constant, extended with the
// LED-template phases the generator emits.
const PHASE_ORDER = [
  'Award',
  'Engineering & Submittals',
  'Coordination',
  'Manufacturing',
  'Logistics',
  'Install window',
  'Install',
  'On site',
  'Closeout',
  'Planning',
  'Complete',
]

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function parseISO(value: string | null): Date | null {
  if (!value) return null
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1))
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000)
}

function fmtShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

function fmtMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ring-1 ${className}`}>
      {children}
    </span>
  )
}

function ErrorStrip({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
      {message}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Top-level workspace
// ---------------------------------------------------------------------------

type TabKey = 'schedule' | 'submittals' | 'transmittal' | 'deployment'

export function ProjectWorkspaceClient({
  projectId,
  project,
  initialTasks,
  initialTransmittals,
}: {
  projectId: string
  project: ActiveProject
  initialTasks: ProjectScheduleTask[]
  initialTransmittals: Transmittal[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const tabParam = (searchParams.get('tab') as TabKey | null) ?? 'schedule'
  const [tab, setTab] = useState<TabKey>(
    ['schedule', 'submittals', 'transmittal', 'deployment'].includes(tabParam) ? tabParam : 'schedule',
  )

  const [tasks, setTasks] = useState<ProjectScheduleTask[]>(initialTasks)
  // Shared live project — the Submittals board updates this, so the Schedule
  // gutter, the Deployment readiness meter, and the tab badges all stay in sync.
  const [workProject, setWorkProject] = useState<ActiveProject>(project)
  const submittals = workProject.submittals
  const [transmittals] = useState<Transmittal[]>(initialTransmittals)

  function selectTab(next: TabKey) {
    setTab(next)
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    sp.set('tab', next)
    router.replace(`${pathname}?${sp.toString()}`, { scroll: false })
  }

  const openSubmittals = submittals.filter((s) => s.status !== 'approved')
  const anyReturned = submittals.some((s) => s.status === 'returned')
  const docGaps = workProject.deploymentDocuments.filter((d) => d.status !== 'ready').length
  const draftReady = transmittals.length > 0

  // Countdown to substantial completion.
  const completion = parseISO(workProject.substantialCompletion) ?? null
  const daysOut = completion ? dayDiff(completion, TODAY) : null

  const tabs: Array<{ key: TabKey; label: string; node: React.ReactNode }> = [
    { key: 'schedule', label: 'Schedule', node: null },
    {
      key: 'submittals',
      label: 'Submittals',
      node: openSubmittals.length ? (
        <span
          className={`ml-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${anyReturned ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-600'}`}
        >
          {openSubmittals.length}
        </span>
      ) : null,
    },
    {
      key: 'transmittal',
      label: 'Transmittal',
      node: draftReady ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ACCENT }} /> : null,
    },
    {
      key: 'deployment',
      label: 'Deployment',
      node:
        workProject.deploymentStatus === 'complete' ? (
          <span className="ml-1.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">ready</span>
        ) : docGaps ? (
          <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700">{docGaps} gaps</span>
        ) : null,
    },
  ]

  const tabKeys = tabs.map((t) => t.key)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  function onTabKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const dir = e.key === 'ArrowRight' ? 1 : -1
    const next = (index + dir + tabKeys.length) % tabKeys.length
    tabRefs.current[next]?.focus()
    selectTab(tabKeys[next])
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <Link
            href="/project-schedule"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-[#0A52EF]"
          >
            <ArrowLeft className="h-4 w-4" />
            Project Deployment Workspace
          </Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Project Workspace · {workProject.pm || 'Unassigned'} · {workProject.phase}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-950">{workProject.project}</h1>
            <Pill className={deploymentStyles[workProject.deploymentStatus]}>{deploymentLabels[workProject.deploymentStatus]}</Pill>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {completion ? (
              <>
                Substantial completion {fmtShort(completion)} ·{' '}
                <span className="font-semibold tabular-nums" style={{ color: BRAND }}>
                  {daysOut !== null && daysOut >= 0 ? `${daysOut} days out` : `${Math.abs(daysOut ?? 0)} days past`}
                </span>
              </>
            ) : (
              'No substantial completion date set'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workProject.documentFolderUrl ? (
            <a
              href={workProject.documentFolderUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] bg-white px-3 text-sm font-medium text-zinc-700 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
            >
              <FolderOpen className="h-4 w-4" /> Documents <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : null}
          <Link
            href="/project-schedule/new"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90"
          >
            <Sparkles className="h-4 w-4" /> New schedule
          </Link>
        </div>
      </div>

      {/* Tab nav */}
      <div role="tablist" aria-label="Project workspace" className="flex items-center gap-6 border-b border-[#E8E8E8]">
        {tabs.map((t, index) => {
          const active = tab === t.key
          return (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              role="tab"
              type="button"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => onTabKeyDown(e, index)}
              onClick={() => selectTab(t.key)}
              className={`-mb-px flex items-center border-b-2 pb-3 pt-1 text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-[#0A52EF]/20 ${active ? 'border-[#0A52EF] text-zinc-950' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}
            >
              {t.label}
              {t.node}
            </button>
          )
        })}
      </div>

      {/* Panels */}
      {tab === 'schedule' ? (
        <ScheduleTab
          projectId={projectId}
          project={workProject}
          tasks={tasks}
          setTasks={setTasks}
          onViewSubmittals={() => selectTab('submittals')}
        />
      ) : null}
      {tab === 'submittals' ? (
        <SubmittalBoard projectId={projectId} project={workProject} onProjectChange={setWorkProject} />
      ) : null}
      {tab === 'transmittal' ? (
        <TransmittalTab project={workProject} submittals={submittals} transmittals={transmittals} />
      ) : null}
      {tab === 'deployment' ? <DeploymentTab project={workProject} /> : null}
    </div>
  )
}

// ===========================================================================
// SCHEDULE TAB — Gantt
// ===========================================================================

type Zoom = 'week' | 'month' | 'quarter'

function ScheduleTab({
  projectId,
  project,
  tasks,
  setTasks,
  onViewSubmittals,
}: {
  projectId: string
  project: ActiveProject
  tasks: ProjectScheduleTask[]
  setTasks: (tasks: ProjectScheduleTask[]) => void
  onViewSubmittals: () => void
}) {
  const [zoom, setZoom] = useState<Zoom>('month')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [selectedTask, setSelectedTask] = useState<ProjectScheduleTask | null>(null)
  const [adding, setAdding] = useState(false)
  const [addingSection, setAddingSection] = useState(false)
  const [renamingPhase, setRenamingPhase] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [newSection, setNewSection] = useState('')
  const [presetPhase, setPresetPhase] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const todayRef = useRef<HTMLDivElement>(null)

  // Only dated, non-parent (leaf or milestone) tasks render as rows;
  // phase headers come from the phase field.
  const dated = tasks.filter((t) => parseISO(t.start))

  // Span computation.
  const dates = dated.flatMap((t) => [parseISO(t.start), parseISO(t.end)]).filter(Boolean) as Date[]
  const hasSpan = dates.length > 0
  const minDate = hasSpan ? new Date(Math.min(...dates.map((d) => d.getTime()))) : startOfMonth(TODAY)
  const maxDate = hasSpan ? new Date(Math.max(...dates.map((d) => d.getTime()))) : addMonths(startOfMonth(TODAY), 3)
  const chartStart = startOfMonth(minDate)
  const chartEnd = addMonths(startOfMonth(maxDate), 1)
  const totalDays = Math.max(1, dayDiff(chartEnd, chartStart))

  const pxPerDay = zoom === 'week' ? 14 : zoom === 'quarter' ? 3.2 : 7
  const chartWidth = totalDays * pxPerDay

  // Month columns.
  const months: Array<{ date: Date; left: number; width: number }> = []
  let cursor = new Date(chartStart)
  while (cursor < chartEnd) {
    const next = addMonths(cursor, 1)
    const left = dayDiff(cursor, chartStart) * pxPerDay
    const width = dayDiff(next, cursor) * pxPerDay
    months.push({ date: new Date(cursor), left, width })
    cursor = next
  }

  const todayLeft = dayDiff(TODAY, chartStart) * pxPerDay
  const todayInRange = TODAY >= chartStart && TODAY <= chartEnd

  // Group leaf tasks by phase, in PHASE_ORDER then by appearance.
  const phaseGroups = useMemo(() => {
    const groups = new Map<string, ProjectScheduleTask[]>()
    for (const t of dated) {
      const phase = t.phase || 'Unphased'
      if (!groups.has(phase)) groups.set(phase, [])
      groups.get(phase)!.push(t)
    }
    const order = (phase: string) => {
      const idx = PHASE_ORDER.indexOf(phase)
      return idx === -1 ? PHASE_ORDER.length : idx
    }
    return Array.from(groups.entries())
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([phase, items]) => ({
        phase,
        items: items.sort((x, y) => {
          const xs = parseISO(x.start)?.getTime() ?? 0
          const ys = parseISO(y.start)?.getTime() ?? 0
          return xs - ys || x.orderIndex - y.orderIndex
        }),
      }))
  }, [dated])

  function centerToday() {
    if (!scrollRef.current) return
    const el = scrollRef.current
    el.scrollTo({ left: Math.max(0, todayLeft - el.clientWidth / 2), behavior: 'smooth' })
  }

  async function refreshTasks() {
    const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/tasks`)
    if (res.ok) {
      const payload = await res.json()
      setTasks(payload.data as ProjectScheduleTask[])
    }
  }

  // Rename a section header — sections are derived from task phases, so the
  // server re-stamps every task in the group.
  async function renamePhase(from: string) {
    const to = renameDraft.replace(/\s+/g, ' ').trim()
    setRenamingPhase(null)
    if (!to || to === from) return
    setError(null)
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/phases`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Could not rename the section.')
      }
      setCollapsed((prev) => {
        const next = { ...prev }
        if (from in next) {
          next[to] = next[from]
          delete next[from]
        }
        return next
      })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not rename the section.')
    }
  }

  // Add a new section — sections are derived from task phases, so we hand the
  // new section name to the task drawer as a preset phase. The section appears
  // once its first task is saved.
  function addSection() {
    const name = newSection.replace(/\s+/g, ' ').trim()
    setNewSection('')
    if (!name) return
    if (phaseGroups.some((g) => g.phase.toLowerCase() === name.toLowerCase())) {
      setError(`A section named "${name}" already exists.`)
      return
    }
    setError(null)
    setPresetPhase(name)
    setSelectedTask(null)
    setAdding(true)
  }

  if (!dated.length) {
    return <ScheduleEmpty projectId={projectId} project={project} onCreated={refreshTasks} />
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorStrip message={error} /> : null}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-[#E8E8E8] bg-zinc-50 p-1">
            {(['week', 'month', 'quarter'] as Zoom[]).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`rounded px-3 py-1.5 text-xs font-medium capitalize transition ${zoom === z ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                {z}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={centerToday}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
          >
            Today <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <a
            href={`/api/project-schedule/${encodeURIComponent(projectId)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </a>
        </div>
        <div className="flex items-center gap-2">
          {addingSection ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addSection()
                  if (e.key === 'Escape') {
                    setAddingSection(false)
                    setNewSection('')
                  }
                }}
                placeholder="New section name"
                className="h-9 w-44 rounded-md border border-[#0A52EF]/40 bg-white px-3 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-[#0A52EF]/20"
              />
              <button
                type="button"
                onClick={addSection}
                className="inline-flex h-9 items-center rounded-md bg-[#0A52EF] px-2.5 text-xs font-semibold text-white transition hover:bg-[#0A52EF]/90"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSection(false)
                  setNewSection('')
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[#E8E8E8] bg-white px-2 text-xs text-zinc-500 transition hover:text-zinc-800"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setAddingSection(true)
                  setNewSection('')
                  setError(null)
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#7350FF]/40 hover:text-[#7350FF]"
              >
                <Plus className="h-3.5 w-3.5" /> Add section
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(true)
                  setSelectedTask(null)
                  setPresetPhase(null)
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0A52EF] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90"
              >
                <Plus className="h-3.5 w-3.5" /> Add task
              </button>
            </>
          )}
        </div>
      </div>

      {/* New-section prompt row */}

      {/* Gantt */}
      <div className="overflow-hidden rounded-md border border-[#E8E8E8] bg-white shadow-sm">
        <div className="flex">
          {/* Sticky left rail */}
          <div className="w-[220px] shrink-0 border-r border-[#E8E8E8]">
            <div className="h-10 border-b border-[#E8E8E8] bg-zinc-50 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500" />
            {phaseGroups.map((group) => {
              const isCollapsed = collapsed[group.phase]
              const blockingBall = worstBall(group.items, project.submittals)
              return (
                <div key={group.phase}>
                  {renamingPhase === group.phase ? (
                    <div className="flex h-9 items-center gap-1.5 border-b border-[#E8E8E8] px-3">
                      <input
                        autoFocus
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renamePhase(group.phase)
                          if (e.key === 'Escape') {
                            setRenamingPhase(null)
                            setRenameDraft('')
                          }
                        }}
                        placeholder="Section name"
                        className="h-7 flex-1 rounded border border-[#7350FF]/40 px-2 text-[11px] font-semibold uppercase tracking-[0.14em] outline-none focus:ring-2 focus:ring-[#7350FF]/20"
                        style={{ color: ACCENT }}
                      />
                      <button
                        type="button"
                        onClick={() => renamePhase(group.phase)}
                        className="inline-flex h-7 items-center rounded bg-[#7350FF] px-2 text-[10px] font-semibold text-white transition hover:bg-[#7350FF]/90"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenamingPhase(null)
                          setRenameDraft('')
                        }}
                        className="inline-flex h-7 items-center justify-center rounded text-zinc-400 hover:text-zinc-700"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="group/header flex h-9 items-center gap-1.5 border-b border-[#E8E8E8] px-3">
                      <button
                        type="button"
                        onClick={() => setCollapsed((prev) => ({ ...prev, [group.phase]: !prev[group.phase] }))}
                        className="flex h-9 flex-1 items-center gap-1.5 text-left"
                      >
                        {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-zinc-400" /> : <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />}
                        <span className="flex-1 truncate text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>
                          {group.phase}
                        </span>
                      </button>
                      {blockingBall ? (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                          {ballLabels[blockingBall]}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        title="Rename section"
                        onClick={() => {
                          setRenamingPhase(group.phase)
                          setRenameDraft(group.phase)
                        }}
                        className="opacity-0 transition group-hover/header:opacity-100"
                      >
                        <Pencil className="h-3 w-3 text-zinc-400 hover:text-[#7350FF]" />
                      </button>
                    </div>
                  )}
                  {!isCollapsed
                    ? group.items.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedTask(t)
                            setAdding(false)
                          }}
                          className="flex h-10 w-full items-center border-b border-[#E8E8E8] border-l-[3px] px-3 text-left transition hover:bg-zinc-50"
                          style={{ borderLeftColor: t.isSubmittalMilestone ? ACCENT : 'transparent' }}
                        >
                          <span className="truncate text-sm text-zinc-900">{t.name}</span>
                        </button>
                      ))
                    : null}
                </div>
              )
            })}
          </div>

          {/* Scrollable timeline */}
          <div ref={scrollRef} className="relative flex-1 overflow-x-auto">
            <div style={{ width: chartWidth, minWidth: '100%' }}>
              {/* Month header */}
              <div className="relative h-10 border-b border-[#E8E8E8] bg-zinc-50">
                {months.map((m) => (
                  <div
                    key={m.date.toISOString()}
                    className="absolute top-0 flex h-10 items-center border-l border-[#E8E8E8] px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 tabular-nums"
                    style={{ left: m.left, width: m.width }}
                  >
                    {fmtMonth(m.date)}
                  </div>
                ))}
                {todayInRange ? (
                  <div className="absolute top-0 z-20 flex flex-col items-center" style={{ left: todayLeft, transform: 'translateX(-50%)' }} ref={todayRef}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: BRAND }} />
                    <span className="mt-0.5 text-[10px] font-semibold tabular-nums" style={{ color: BRAND }}>
                      {fmtShort(TODAY)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Rows */}
              <div className="relative">
                {/* Month gridlines */}
                {months.map((m) => (
                  <div key={`grid-${m.date.toISOString()}`} className="absolute top-0 bottom-0 w-px bg-[#E8E8E8]" style={{ left: m.left }} />
                ))}
                {/* Today line spanning chart */}
                {todayInRange ? (
                  <div className="absolute top-0 bottom-0 z-10 w-px" style={{ left: todayLeft, backgroundColor: BRAND }} />
                ) : null}

                {phaseGroups.map((group) => {
                  const isCollapsed = collapsed[group.phase]
                  return (
                    <div key={group.phase}>
                      <div className="h-9 border-b border-[#E8E8E8] bg-white" />
                      {!isCollapsed
                        ? group.items.map((t) => (
                            <GanttRow
                              key={t.id}
                              task={t}
                              chartStart={chartStart}
                              pxPerDay={pxPerDay}
                              onClick={() => {
                                setSelectedTask(t)
                                setAdding(false)
                              }}
                            />
                          ))
                        : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded" style={{ backgroundColor: BRAND, opacity: 0.85 }} /> Task
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded bg-rose-500/80" /> Late
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DiamondGlyph filled color={BRAND} /> Milestone
        </span>
        <span className="inline-flex items-center gap-1.5">
          <DiamondGlyph color={BRAND} /> Submittal
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rotate-45" style={{ backgroundColor: ACCENT }} /> Substantial completion
        </span>
      </div>

      {/* Drawer */}
      {selectedTask || adding ? (
        <TaskDrawer
          projectId={projectId}
          task={selectedTask}
          phases={phaseGroups.map((g) => g.phase)}
          presetPhase={presetPhase}
          childCount={selectedTask ? tasks.filter((t) => t.parentId === selectedTask.id).length : 0}
          onClose={() => {
            setSelectedTask(null)
            setAdding(false)
            setPresetPhase(null)
          }}
          onSaved={async () => {
            setSelectedTask(null)
            setAdding(false)
            setPresetPhase(null)
            await refreshTasks()
          }}
          onError={setError}
          onViewSubmittals={() => {
            setSelectedTask(null)
            setAdding(false)
            onViewSubmittals()
          }}
        />
      ) : null}
    </div>
  )
}

function isMilestoneLike(t: ProjectScheduleTask) {
  return t.isMilestone || t.isSubmittalMilestone || (t.duration ?? 0) === 0
}

function isSubstantialCompletion(t: ProjectScheduleTask) {
  return /substantial completion|punch completion/i.test(t.name)
}

function GanttRow({
  task,
  chartStart,
  pxPerDay,
  onClick,
}: {
  task: ProjectScheduleTask
  chartStart: Date
  pxPerDay: number
  onClick: () => void
}) {
  const start = parseISO(task.start)
  const end = parseISO(task.end) ?? start
  if (!start) return <div className="h-10 border-b border-[#E8E8E8]" />

  const left = dayDiff(start, chartStart) * pxPerDay
  const days = Math.max(1, dayDiff(end ?? start, start) + 1)
  const width = days * pxPerDay

  const late = end ? end < TODAY : false
  const milestone = isMilestoneLike(task)

  const ariaLabel = `${task.name}, ${fmtShort(start)}${end && end.getTime() !== start.getTime() ? ` to ${fmtShort(end)}` : ''}`

  if (milestone) {
    const sc = isSubstantialCompletion(task)
    const slipped = late
    const color = sc ? ACCENT : slipped ? '#f43f5e' : BRAND
    return (
      <div className="relative h-10 border-b border-[#E8E8E8]">
        <button
          type="button"
          onClick={onClick}
          aria-label={`${ariaLabel} (milestone)`}
          className="group absolute top-1/2 z-[5] flex -translate-y-1/2 items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-[#0A52EF]/20"
          style={{ left }}
        >
          <DiamondGlyph filled={sc || task.isMilestone} color={color} />
          <span className="whitespace-nowrap text-xs tabular-nums text-zinc-600">{fmtShort(start)}</span>
          <span className="pointer-events-none absolute left-0 top-7 hidden whitespace-nowrap rounded-md border border-[#E8E8E8] bg-white px-2 py-1 text-xs text-zinc-700 shadow-sm group-hover:block">
            {task.name}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-10 border-b border-[#E8E8E8]">
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        className="group absolute top-1/2 z-[5] -translate-y-1/2 rounded outline-none focus-visible:ring-2 focus-visible:ring-[#0A52EF]/20"
        style={{ left, width }}
      >
        <span
          className={`block h-3.5 rounded ${late ? 'bg-rose-500/80' : ''}`}
          style={late ? undefined : { backgroundColor: BRAND, opacity: 0.85 }}
        />
        <span className="pointer-events-none absolute left-0 top-6 z-30 hidden min-w-[160px] whitespace-nowrap rounded-md border border-[#E8E8E8] bg-white px-2.5 py-1.5 text-left text-xs text-zinc-700 shadow-sm group-hover:block">
          <span className="block font-semibold text-zinc-900">{task.name}</span>
          <span className="block tabular-nums text-zinc-500">
            {fmtShort(start)}
            {end ? ` – ${fmtShort(end)}` : ''} · {task.duration ?? days}d
          </span>
        </span>
      </button>
    </div>
  )
}

function DiamondGlyph({ filled, color = BRAND }: { filled?: boolean; color?: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rotate-45 rounded-[1px]"
      style={filled ? { backgroundColor: color } : { border: `1.5px solid ${color}`, backgroundColor: 'transparent' }}
    />
  )
}

// Determine the most-blocking ball-in-court among submittal-milestone tasks in a phase.
function worstBall(items: ProjectScheduleTask[], submittals: SubmittalRegisterItem[]): BallInCourt | null {
  const hasSubmittal = items.some((t) => t.isSubmittalMilestone)
  if (!hasSubmittal) return null
  const balls = submittals.filter((s) => s.status !== 'approved').map((s) => s.ballInCourt)
  for (const b of ballOrder) {
    if (b !== 'none' && balls.includes(b)) return b
  }
  return null
}

function ScheduleEmpty({
  projectId,
  project,
  onCreated,
}: {
  projectId: string
  project: ActiveProject
  onCreated: () => void | Promise<void>
}) {
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/tasks/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.project,
          startDate: new Date().toISOString().slice(0, 10),
          displays: ['Main Display'],
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not generate the schedule.')
      await onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the schedule.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {error ? <ErrorStrip message={error} /> : null}
      <div className="flex flex-col items-center rounded-md border border-dashed border-[#E8E8E8] bg-white p-10 text-center">
        <CalendarDays className="h-7 w-7 text-zinc-300" />
        <h3 className="mt-3 text-sm font-semibold text-zinc-950">No schedule yet</h3>
        <p className="mt-1 max-w-sm text-sm text-zinc-500">
          Generate the ANC LED-install timeline, or set up dates from the new-schedule builder.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Generating' : 'Generate from template'}
          </button>
          <Link
            href="/project-schedule/new"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
          >
            Open builder
          </Link>
        </div>
      </div>
    </div>
  )
}

function TaskDrawer({
  projectId,
  task,
  phases,
  presetPhase,
  childCount,
  onClose,
  onSaved,
  onError,
  onViewSubmittals,
}: {
  projectId: string
  task: ProjectScheduleTask | null
  phases: string[]
  presetPhase?: string | null
  childCount?: number
  onClose: () => void
  onSaved: () => void | Promise<void>
  onError: (message: string | null) => void
  onViewSubmittals: () => void
}) {
  const isNew = !task
  const [name, setName] = useState(task?.name ?? '')
  const [start, setStart] = useState(task?.start ?? '')
  const [end, setEnd] = useState(task?.end ?? '')
  const [duration, setDuration] = useState(task?.duration != null ? String(task.duration) : '')
  const [phase, setPhase] = useState(task?.phase ?? presetPhase ?? phases[0] ?? '')
  const [isMilestone, setIsMilestone] = useState(task?.isMilestone ?? false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  async function save() {
    if (!name.trim()) {
      onError('Task needs a name.')
      return
    }
    setSaving(true)
    onError(null)
    try {
      const body = {
        name: name.trim(),
        start: start || null,
        end: end || null,
        duration: duration === '' ? null : Number(duration),
        phase: phase || null,
        isMilestone,
      }
      const res = await fetch(
        isNew
          ? `/api/project-schedule/${encodeURIComponent(projectId)}/tasks`
          : `/api/project-schedule/${encodeURIComponent(projectId)}/tasks/${task!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not save the task.')
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not save the task.')
      setSaving(false)
    }
  }

  async function remove() {
    if (!task) return
    setDeleting(true)
    onError(null)
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/tasks/${task.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Could not delete the task.')
      }
      await onSaved()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not delete the task.')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-zinc-950/20" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-950">{isNew ? 'Add task' : 'Edit task'}</h2>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="space-y-1.5">
            <span className={labelClass}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Task name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className={labelClass}>Start</span>
              <input type="date" value={start.slice(0, 10)} onChange={(e) => setStart(e.target.value)} className={`${inputClass} tabular-nums`} />
            </div>
            <div className="space-y-1.5">
              <span className={labelClass}>End</span>
              <input type="date" value={end.slice(0, 10)} onChange={(e) => setEnd(e.target.value)} className={`${inputClass} tabular-nums`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <span className={labelClass}>Duration (days)</span>
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className={`${inputClass} tabular-nums`}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <span className={labelClass}>Phase</span>
              <input list="phase-options" value={phase} onChange={(e) => setPhase(e.target.value)} className={inputClass} placeholder="Phase" />
              <datalist id="phase-options">
                {phases.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <span className="text-[10px] text-zinc-400">Type a new name to create a section.</span>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={isMilestone} onChange={(e) => setIsMilestone(e.target.checked)} className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF]" />
            Milestone (zero-duration marker)
          </label>

          {task?.isSubmittalMilestone ? (
            <div className="rounded-md border border-[#E8E8E8] bg-zinc-50 p-3">
              <div className="flex items-center gap-2">
                <DiamondGlyph color={ACCENT} />
                <span className={labelClass}>Submittal milestone</span>
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                This task is gated on a submittal. Jump to the relay to see whose court it&apos;s in.
              </p>
              <button
                type="button"
                onClick={onViewSubmittals}
                className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-xs font-semibold text-zinc-700 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
              >
                <Send className="h-3.5 w-3.5" /> View submittals
              </button>
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[#E8E8E8] px-5 py-4">
          {!isNew ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-rose-600">
                  {childCount && childCount > 0
                    ? `Delete “${task?.name}” and ${childCount} sub-task${childCount === 1 ? '' : 's'}?`
                    : `Delete “${task?.name}”?`}
                </span>
                <button
                  type="button"
                  onClick={remove}
                  disabled={deleting || saving}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-rose-600 px-2.5 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="inline-flex h-9 items-center rounded-md border border-[#E8E8E8] px-2.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={deleting || saving}
                className="inline-flex h-10 items-center gap-1.5 rounded-md border border-rose-200 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="inline-flex h-10 items-center rounded-md border border-[#E8E8E8] px-3 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || deleting}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// TRANSMITTAL TAB
// ===========================================================================

function TransmittalTab({
  project,
  submittals,
  transmittals,
}: {
  project: ActiveProject
  submittals: SubmittalRegisterItem[]
  transmittals: Transmittal[]
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-md border border-[#E8E8E8] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#0A52EF]" />
          <h2 className="text-sm font-semibold text-zinc-950">Letters of Transmittal</h2>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Build a Letter of Transmittal from any submittal — recipient, items, and disposition pull straight from the register.
        </p>

        {/* Build-from-submittal list */}
        <div className="mt-4 space-y-2">
          <span className={labelClass}>Build from a submittal</span>
          <div className="grid gap-2 md:grid-cols-2">
            {submittals.map((s) => (
              <Link
                key={s.id}
                href={`/project-schedule/${encodeURIComponent(project.id)}/transmittal/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-md border border-[#E8E8E8] bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-[#0A52EF]/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900">{s.submittalNo}</span>
                    <span className="truncate text-sm text-zinc-600">{s.packageType}</span>
                  </div>
                  <div className="mt-0.5 truncate text-xs text-zinc-500">To {s.owner || 'Owner'}</div>
                </div>
                <Send className="h-4 w-4 shrink-0 text-zinc-400" />
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
        <div className="border-b border-[#E8E8E8] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-950">Sent transmittals</h2>
        </div>
        {transmittals.length ? (
          <div className="divide-y divide-[#E8E8E8]">
            {transmittals.map((t, idx) => (
              <Link
                key={t.id}
                href={`/project-schedule/${encodeURIComponent(project.id)}/transmittal/t-${t.id}`}
                className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-zinc-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold tabular-nums text-zinc-900">
                    T-{String(transmittals.length - idx).padStart(3, '0')}
                  </span>
                  <span className="text-sm text-zinc-600">{t.to || 'Recipient'}</span>
                  <span className="text-xs tabular-nums text-zinc-400">{t.date}</span>
                </div>
                <span className="text-xs text-zinc-500">{t.transmittedAs || 'For approval'}</span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="px-5 py-6 text-sm text-zinc-500">No transmittals sent yet. Build one from a submittal above.</p>
        )}
      </div>
    </div>
  )
}

// ===========================================================================
// DEPLOYMENT TAB
// ===========================================================================

function DeploymentTab({ project }: { project: ActiveProject }) {
  const docs = project.deploymentDocuments
  const ready = docs.filter((d) => d.status === 'ready').length
  const segColor = (status: string) =>
    status === 'ready' ? 'bg-emerald-400' : status === 'watch' ? 'bg-amber-400' : 'bg-rose-400'

  return (
    <div className="space-y-5">
      {/* Readiness meter */}
      <div className="rounded-md border border-[#E8E8E8] bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <span className={labelClass}>Package readiness</span>
            <p className="mt-1 text-sm font-semibold tabular-nums text-zinc-900">
              {ready}/{docs.length} documents ready
            </p>
          </div>
          <Pill className={deploymentStyles[project.deploymentStatus]}>{deploymentLabels[project.deploymentStatus]}</Pill>
        </div>
        <div className="mt-3 flex h-2 gap-0.5 overflow-hidden rounded bg-zinc-100">
          {docs.map((d) => (
            <div key={d.key} className={`flex-1 ${segColor(d.status)}`} title={`${d.label}: ${d.status}`} />
          ))}
        </div>
      </div>

      {/* Reuse the existing editable document/submittal rows */}
      <ProjectDeploymentEditable project={project} />

      {project.documentFolderUrl ? (
        <a
          href={project.documentFolderUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
        >
          <FolderOpen className="h-4 w-4" /> Open project documents <ExternalLink className="h-3.5 w-3.5" />
        </a>
      ) : null}
    </div>
  )
}
