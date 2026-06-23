'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Columns3,
  Download,
  ExternalLink,
  FileText,
  FolderKanban,
  ListFilter,
  Search,
  Table2,
  Truck,
  UsersRound,
  X,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import type { ActiveProject, DeploymentDocumentStatus, DeploymentStatus, ProjectScheduleInsights, ScheduleRisk } from '@/lib/project-schedule'

type ViewMode = 'agenda' | 'board' | 'table'
type RiskFilter = 'all' | ScheduleRisk
type DeploymentFilter = 'all' | DeploymentStatus

const riskStyles: Record<ScheduleRisk, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-100',
  watch: 'bg-amber-50 text-amber-700 ring-amber-100',
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  done: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
}

const riskLabels: Record<ScheduleRisk, string> = {
  critical: 'Needs action',
  watch: 'Watch',
  ready: 'Ready',
  done: 'Done',
}

const phaseOrder = ['Coordination', 'Logistics', 'Install window', 'On site', 'Closeout', 'Planning', 'Complete']

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

const documentStyles: Record<DeploymentDocumentStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  watch: 'bg-amber-50 text-amber-700 ring-amber-100',
  missing: 'bg-rose-50 text-rose-700 ring-rose-100',
}

function formatMoney(value: number) {
  if (!value) return '$0'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
}

function RiskBadge({ risk }: { risk: ScheduleRisk }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ring-1 ${riskStyles[risk]}`}>
      {riskLabels[risk]}
    </span>
  )
}

function DeploymentBadge({ status }: { status: DeploymentStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ring-1 ${deploymentStyles[status]}`}>
      {deploymentLabels[status]}
    </span>
  )
}

function DocumentBadge({ status }: { status: DeploymentDocumentStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold capitalize ring-1 ${documentStyles[status]}`}>
      {status}
    </span>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  detail: string
  icon: React.ReactNode
  tone?: 'default' | 'warn' | 'good'
}) {
  const iconTone = tone === 'warn' ? 'bg-amber-50 text-amber-700' : tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-[#0A52EF]'
  return (
    <div className="rounded-md border border-[#E8E8E8] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-zinc-950">{value}</p>
        </div>
        <div className={`rounded-md p-2 ${iconTone}`}>{icon}</div>
      </div>
      <p className="mt-2 text-xs text-zinc-500">{detail}</p>
    </div>
  )
}

function EmptyDash({ value }: { value?: string | null }) {
  return <>{value ? value : <span className="text-zinc-300">-</span>}</>
}

function projectMatches(project: ActiveProject, query: string) {
  const haystack = [
    project.project,
    project.pm,
    project.notes,
    project.controlSystem,
    project.productSupplier,
    project.integrationManager,
    project.installSub,
    project.electricalSub,
    project.phase,
    project.deploymentStatus,
    project.deploymentDocuments.map((item) => `${item.label} ${item.status} ${item.detail}`).join(' '),
    ...project.nextActions,
  ].join(' ').toLowerCase()
  return haystack.includes(query.toLowerCase())
}

function downloadCsv(projects: ActiveProject[]) {
  const headers = ['Project', 'PM', 'Phase', 'Deployment', 'Risk', 'Document Gaps', 'Install', 'Completion', 'Next Milestone', 'Next Actions', 'Notes']
  const rows = projects.map((project) => [
    project.project,
    project.pm,
    project.phase,
    deploymentLabels[project.deploymentStatus],
    riskLabels[project.risk],
    project.documentGapCount,
    project.installOnsite,
    project.substantialCompletion,
    [project.nextDateLabel, project.nextDate].filter(Boolean).join(': '),
    project.nextActions.join(' | '),
    project.notes,
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'anc-project-schedule.csv'
  link.click()
  URL.revokeObjectURL(url)
}

function ProjectCard({ project, onOpen }: { project: ActiveProject; onOpen: (project: ActiveProject) => void }) {
  return (
    <article className="rounded-md border border-[#E8E8E8] bg-white p-4 shadow-sm transition hover:border-[#0A52EF]/40 hover:shadow-md">
      <button type="button" onClick={() => onOpen(project)} className="w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950">{project.project}</div>
            <div className="mt-1 truncate text-xs text-zinc-500">{project.pm || 'Unassigned'} · {project.phase}</div>
          </div>
          <DeploymentBadge status={project.deploymentStatus} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded bg-zinc-50 px-2 py-1.5">
            <div className="text-zinc-400">Install</div>
            <div className="mt-0.5 truncate font-medium text-zinc-700"><EmptyDash value={project.installOnsite} /></div>
          </div>
          <div className="rounded bg-zinc-50 px-2 py-1.5">
            <div className="text-zinc-400">Next</div>
            <div className="mt-0.5 truncate font-medium text-zinc-700"><EmptyDash value={project.nextDateLabel || project.nextDate} /></div>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          {project.nextActions.slice(0, 2).map((action) => (
            <div key={action} className="flex items-start gap-2 text-xs leading-5 text-zinc-600">
              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#0A52EF]" />
              <span>{action}</span>
            </div>
          ))}
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-[#E8E8E8] pt-3 text-xs text-zinc-500">
        <span>{project.documentGapCount} document gaps</span>
        <Link href={`/project-schedule/${project.id}`} className="inline-flex items-center gap-1 font-medium text-[#0A52EF]">
          Open <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </article>
  )
}

function ProjectDrawer({ project, onClose }: { project: ActiveProject | null; onClose: () => void }) {
  if (!project) return null
  return (
    <div className="fixed inset-0 z-[80]">
      <button type="button" aria-label="Close project drawer" className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 z-10 border-b border-[#E8E8E8] bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <RiskBadge risk={project.risk} />
              <span className="ml-2"><DeploymentBadge status={project.deploymentStatus} /></span>
              <h2 className="mt-3 text-xl font-semibold text-zinc-950">{project.project}</h2>
              <p className="mt-1 text-sm text-zinc-500">{project.pm || 'Unassigned'} · {project.phase}</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md border border-[#E8E8E8] p-2 text-zinc-500 hover:bg-zinc-50">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <section>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Deployment Package</h3>
              <Link href={`/project-schedule/${project.id}`} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A52EF]">
                Open project <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="mt-3 space-y-2">
              {project.deploymentDocuments.map((doc) => (
                <div key={doc.key} className="flex items-center justify-between gap-3 rounded-md border border-[#E8E8E8] px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-900">{doc.label}</div>
                    <div className="truncate text-xs text-zinc-500">{doc.detail}</div>
                  </div>
                  <DocumentBadge status={doc.status} />
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Next Actions</h3>
            <div className="mt-3 space-y-2">
              {project.nextActions.map((action) => (
                <div key={action} className="flex items-center gap-3 rounded-md border border-[#E8E8E8] px-3 py-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded border border-zinc-300" />
                  <span className="text-sm text-zinc-700">{action}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['Install onsite', project.installOnsite],
              ['Substantial completion', project.substantialCompletion],
              ['LED ship date', project.ledShipDate],
              ['LED on-site', project.ledOnSite],
              ['Commissioning', project.commissioningDate],
              ['ANC commissioning', project.ancCommissioning],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#E8E8E8] bg-zinc-50 px-4 py-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="mt-1 text-sm font-medium text-zinc-900"><EmptyDash value={value} /></div>
              </div>
            ))}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Project Notes</h3>
            <p className="mt-3 rounded-md border border-[#E8E8E8] bg-white p-4 text-sm leading-6 text-zinc-700">
              {project.notes || 'No notes captured in the workbook.'}
            </p>
          </section>

          <section className="grid gap-3 sm:grid-cols-2">
            {[
              ['Control system', project.controlSystem],
              ['Product supplier', project.productSupplier],
              ['Shipping method', project.shippingMethod],
              ['Integration manager', project.integrationManager],
              ['Integration sub', project.integrationSub],
              ['Install sub', project.installSub],
              ['Electrical sub', project.electricalSub],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#E8E8E8] px-4 py-3">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="mt-1 text-sm font-medium text-zinc-900"><EmptyDash value={value} /></div>
              </div>
            ))}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Risk Notes</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {project.riskReasons.map((reason) => (
                <span key={reason} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{reason}</span>
              ))}
            </div>
          </section>
        </div>
      </aside>
    </div>
  )
}

function ProjectTable({ projects, onOpen }: { projects: ActiveProject[]; onOpen: (project: ActiveProject) => void }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[#E8E8E8] bg-white shadow-sm">
      <table className="w-full text-left">
        <thead className="bg-zinc-50">
          <tr className="border-b border-[#E8E8E8]">
            {['Project', 'PM', 'Phase', 'Install', 'Documents', 'Status', 'Next Action'].map((header) => (
              <th key={header} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => (
            <tr key={project.id} className="border-b border-[#E8E8E8] align-top last:border-b-0 hover:bg-zinc-50/70">
              <td className="min-w-[230px] px-4 py-3">
                <button type="button" onClick={() => onOpen(project)} className="text-left font-medium text-zinc-950 hover:text-[#0A52EF]">
                  {project.project}
                </button>
                <div className="mt-1 text-xs text-zinc-500">{project.controlSystem || 'Control not listed'} · {project.productSupplier || 'Supplier not listed'}</div>
              </td>
              <td className="px-4 py-3 text-sm text-zinc-700"><EmptyDash value={project.pm} /></td>
              <td className="px-4 py-3 text-sm text-zinc-700">{project.phase}</td>
              <td className="px-4 py-3 text-sm text-zinc-700"><EmptyDash value={project.installOnsite} /></td>
              <td className="px-4 py-3 text-sm text-zinc-700">
                <div>{project.documentGapCount} gaps</div>
                <div className="mt-1 text-xs text-zinc-500">{project.deploymentDocuments.filter((doc) => doc.status === 'missing').length} missing</div>
              </td>
              <td className="px-4 py-3"><DeploymentBadge status={project.deploymentStatus} /></td>
              <td className="min-w-[220px] px-4 py-3 text-sm leading-5 text-zinc-600">{project.nextActions[0]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ProjectScheduleClient({ data }: { data: ProjectScheduleInsights }) {
  const [query, setQuery] = useState('')
  const [risk, setRisk] = useState<RiskFilter>('all')
  const [pm, setPm] = useState('all')
  const [phase, setPhase] = useState('all')
  const [deployment, setDeployment] = useState<DeploymentFilter>('all')
  const [view, setView] = useState<ViewMode>('agenda')
  const [selected, setSelected] = useState<ActiveProject | null>(null)

  const filtered = useMemo(() => {
    return data.activeProjects.filter((project) => {
      if (query && !projectMatches(project, query)) return false
      if (risk !== 'all' && project.risk !== risk) return false
      if (pm !== 'all' && !project.pmList.includes(pm) && !(pm === 'Unassigned' && project.pmList.length === 0)) return false
      if (phase !== 'all' && project.phase !== phase) return false
      if (deployment !== 'all' && project.deploymentStatus !== deployment) return false
      return true
    })
  }, [data.activeProjects, deployment, phase, pm, query, risk])

  const grouped = useMemo(() => {
    const phases = phaseOrder.filter((item) => filtered.some((project) => project.phase === item))
    const extras = Array.from(new Set(filtered.map((project) => project.phase))).filter((item) => !phases.includes(item))
    return [...phases, ...extras].map((item) => ({
      phase: item,
      projects: filtered.filter((project) => project.phase === item),
    }))
  }, [filtered])

  const decisionQueue = filtered
    .filter((project) => project.risk === 'critical' || project.nextActions.some((action) => /confirm|capture|update|assign|set/i.test(action)))
    .slice(0, 6)

  const riskCounts = {
    all: data.activeProjects.length,
    critical: data.stats.criticalCount,
    watch: data.stats.watchCount,
    ready: data.stats.readyCount,
    done: data.activeProjects.filter((project) => project.risk === 'done').length,
  }

  const deploymentCounts = data.activeProjects.reduce<Record<DeploymentStatus, number>>((acc, project) => {
    acc[project.deploymentStatus] += 1
    return acc
  }, { blocked: 0, 'needs-docs': 0, 'needs-update': 0, ready: 0, complete: 0 })

  const agendaSections = [
    { title: 'Decision Queue', projects: data.meetingAgenda.decisions, icon: <ListFilter className="h-4 w-4 text-[#0A52EF]" /> },
    { title: 'Document Gaps', projects: data.meetingAgenda.documentGaps, icon: <FileText className="h-4 w-4 text-orange-600" /> },
    { title: 'Logistics Watch', projects: data.meetingAgenda.logistics, icon: <Truck className="h-4 w-4 text-amber-600" /> },
    { title: 'Install Window', projects: data.meetingAgenda.installWindow, icon: <CalendarDays className="h-4 w-4 text-emerald-600" /> },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Project Deployment Workspace
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Project Deployment Workspace</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              PM sync workspace for schedule, submittals, logistics, install readiness, project package gaps, and exportable meeting cuts.
            </p>
          </div>
          <div className="text-left text-xs text-zinc-500 lg:text-right">
            <div>Source: {data.sourceFile}</div>
            <div>Refreshed {new Date(data.generatedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Active Projects" value={data.stats.activeCount} detail={`${data.stats.next30Starts} installs start in the next 30 days`} icon={<ClipboardList className="h-5 w-5" />} />
          <MetricCard label="Needs Attention" value={data.stats.criticalCount} detail={`${data.stats.watchCount} more projects are on watch`} icon={<AlertTriangle className="h-5 w-5" />} tone="warn" />
          <MetricCard label="Document Gaps" value={data.stats.documentGaps} detail={`${data.stats.missingLedDates} projects still need LED logistics`} icon={<FileText className="h-5 w-5" />} tone="warn" />
          <MetricCard label="Ready Packages" value={data.stats.readyForInstall} detail={`${formatMoney(data.stats.totalRevenue)} scheduled revenue`} icon={<FolderKanban className="h-5 w-5" />} tone="good" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="rounded-md border border-[#E8E8E8] bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search project, PM, supplier, notes, action"
                  className="h-10 w-full rounded-md border border-[#E8E8E8] pl-9 pr-3 text-sm outline-none focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={pm} onChange={(event) => setPm(event.target.value)} className="h-10 rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-700">
                  <option value="all">All PMs</option>
                  {data.filters.pms.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={phase} onChange={(event) => setPhase(event.target.value)} className="h-10 rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-700">
                  <option value="all">All phases</option>
                  {data.filters.phases.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={deployment} onChange={(event) => setDeployment(event.target.value as DeploymentFilter)} className="h-10 rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-700">
                  <option value="all">All deployment</option>
                  {(['blocked', 'needs-docs', 'needs-update', 'ready', 'complete'] as DeploymentStatus[]).map((item) => (
                    <option key={item} value={item}>{deploymentLabels[item]}</option>
                  ))}
                </select>
                <button type="button" onClick={() => downloadCsv(filtered)} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
                  <Download className="h-4 w-4" />
                  CSV
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {(['blocked', 'needs-docs', 'needs-update', 'ready', 'complete'] as DeploymentStatus[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setDeployment(deployment === item ? 'all' : item)}
                    className={`rounded-md px-3 py-2 text-xs font-semibold ring-1 transition ${deployment === item ? 'bg-[#0A52EF] text-white ring-[#0A52EF]' : 'bg-white text-zinc-600 ring-[#E8E8E8] hover:bg-zinc-50'}`}
                  >
                    {deploymentLabels[item]} · {deploymentCounts[item]}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 lg:mt-0">
                {(['all', 'critical', 'watch', 'ready', 'done'] as RiskFilter[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setRisk(item)}
                    className={`rounded-md px-3 py-2 text-xs font-semibold ring-1 transition ${risk === item ? 'bg-[#0A52EF] text-white ring-[#0A52EF]' : 'bg-white text-zinc-600 ring-[#E8E8E8] hover:bg-zinc-50'}`}
                  >
                    {item === 'all' ? 'All' : riskLabels[item]} · {riskCounts[item]}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-md border border-[#E8E8E8] bg-zinc-50 p-1">
                <button type="button" onClick={() => setView('agenda')} className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${view === 'agenda' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>
                  <ClipboardList className="h-3.5 w-3.5" />
                  Agenda
                </button>
                <button type="button" onClick={() => setView('board')} className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${view === 'board' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>
                  <Columns3 className="h-3.5 w-3.5" />
                  Board
                </button>
                <button type="button" onClick={() => setView('table')} className={`inline-flex items-center gap-2 rounded px-3 py-1.5 text-xs font-medium ${view === 'table' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500'}`}>
                  <Table2 className="h-3.5 w-3.5" />
                  Table
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">Decision Queue</h2>
                <p className="mt-1 text-xs text-zinc-500">Best agenda for the next PM sync.</p>
              </div>
              <ListFilter className="h-4 w-4 text-[#0A52EF]" />
            </div>
            <div className="divide-y divide-[#E8E8E8]">
              {decisionQueue.map((project) => (
                <button key={project.id} type="button" onClick={() => setSelected(project)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-zinc-50">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-950">{project.project}</div>
                    <div className="truncate text-xs text-zinc-500">{project.nextActions[0]}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div>
            {view === 'agenda' ? (
              <div className="grid gap-4 xl:grid-cols-2">
                {agendaSections.map((section) => (
                  <section key={section.title} className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                      <h2 className="text-sm font-semibold text-zinc-950">{section.title}</h2>
                      {section.icon}
                    </div>
                    <div className="divide-y divide-[#E8E8E8]">
                      {section.projects.slice(0, 6).map((project) => (
                        <button key={`${section.title}-${project.id}`} type="button" onClick={() => setSelected(project)} className="grid w-full grid-cols-[1fr_auto] gap-3 px-5 py-3 text-left hover:bg-zinc-50">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-zinc-950">{project.project}</div>
                            <div className="truncate text-xs text-zinc-500">{project.nextActions[0]} · {project.pm || 'Unassigned'}</div>
                          </div>
                          <DeploymentBadge status={project.deploymentStatus} />
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : view === 'table' ? (
              <ProjectTable projects={filtered} onOpen={setSelected} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-3">
                {grouped.map((group) => (
                  <section key={group.phase} className="rounded-md border border-[#E8E8E8] bg-zinc-50/60 p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-semibold text-zinc-900">{group.phase}</h2>
                      <span className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-500 ring-1 ring-[#E8E8E8]">{group.projects.length}</span>
                    </div>
                    <div className="space-y-3">
                      {group.projects.map((project) => (
                        <ProjectCard key={project.id} project={project} onOpen={setSelected} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">PM Load</h2>
                <UsersRound className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {data.pmLoad.slice(0, 8).map((item) => (
                  <button key={item.pm} type="button" onClick={() => setPm(item.pm)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-zinc-50">
                    <div>
                      <div className="text-sm font-medium text-zinc-950">{item.pm}</div>
                      <div className="text-xs text-zinc-500">{item.critical} action · {item.watch} watch</div>
                    </div>
                    <div className="text-2xl font-semibold text-zinc-900">{item.count}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">On-Site Months</h2>
                <CalendarDays className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="space-y-3 px-5 py-4">
                {data.monthlyOnsite.slice(0, 8).map((month) => (
                  <div key={month.month}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-zinc-700">{month.month}</span>
                      <span className="text-zinc-500">{month.count} projects</span>
                    </div>
                    <div className="h-2 rounded bg-zinc-100">
                      <div className="h-2 rounded bg-[#0A52EF]" style={{ width: `${Math.min(100, month.count * 10)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">Upcoming Milestones</h2>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {data.upcomingProjects.slice(0, 7).map((project) => (
                  <button key={`${project.id}-${project.nextDateLabel}`} type="button" onClick={() => setSelected(project)} className="grid w-full grid-cols-[1fr_auto] gap-4 px-5 py-3 text-left hover:bg-zinc-50">
                    <div>
                      <div className="text-sm font-medium text-zinc-950">{project.project}</div>
                      <div className="text-xs text-zinc-500">{project.pm || 'Unassigned'} · {project.nextDateLabel}</div>
                    </div>
                    <div className="text-right text-sm font-medium text-zinc-700">{project.nextDate}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filtered.length === 0 && (
          <div className="rounded-md border border-dashed border-[#E8E8E8] bg-white p-8 text-center text-sm text-zinc-500">
            No projects match the current filters.
          </div>
        )}
      </div>

      <ProjectDrawer project={selected} onClose={() => setSelected(null)} />
    </DashboardLayout>
  )
}
