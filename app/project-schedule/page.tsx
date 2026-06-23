import { AlertTriangle, CalendarDays, CheckCircle2, CircleDollarSign, ClipboardList, Truck, UsersRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getProjectScheduleInsights, type ActiveProject, type ScheduleRisk } from '@/lib/project-schedule'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function formatMoney(value: number) {
  if (!value) return '$0'
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${value.toLocaleString()}`
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
  icon: ReactNode
  tone?: 'default' | 'warn' | 'good'
}) {
  const iconTone = tone === 'warn' ? 'bg-amber-50 text-amber-700' : tone === 'good' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-[#0A52EF]'
  return (
    <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm p-5">
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

function RiskBadge({ risk }: { risk: ScheduleRisk }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded px-2 py-1 text-[11px] font-semibold ring-1 ${riskStyles[risk]}`}>
      {riskLabels[risk]}
    </span>
  )
}

function EmptyDash({ value }: { value?: string | null }) {
  return <>{value ? value : <span className="text-zinc-300">-</span>}</>
}

function ProjectRow({ project }: { project: ActiveProject }) {
  return (
    <tr className="border-b border-[#E8E8E8] align-top last:border-b-0">
      <td className="min-w-[220px] px-4 py-3">
        <div className="font-medium text-zinc-950">{project.project}</div>
        <div className="mt-1 text-xs text-zinc-500">{project.controlSystem || 'Control system not listed'} · {project.productSupplier || 'Supplier not listed'}</div>
      </td>
      <td className="px-4 py-3 text-sm text-zinc-700"><EmptyDash value={project.pm} /></td>
      <td className="px-4 py-3 text-sm text-zinc-700"><EmptyDash value={project.installOnsite} /></td>
      <td className="px-4 py-3 text-sm text-zinc-700"><EmptyDash value={project.substantialCompletion} /></td>
      <td className="px-4 py-3 text-sm text-zinc-700">
        <div><EmptyDash value={project.ledShipDate} /></div>
        <div className="mt-1 text-xs text-zinc-500"><EmptyDash value={project.ledOnSite || project.shippingMethod} /></div>
      </td>
      <td className="px-4 py-3">
        <RiskBadge risk={project.risk} />
        <div className="mt-2 max-w-[320px] text-xs leading-5 text-zinc-500">{project.riskReasons.slice(0, 2).join(' · ')}</div>
      </td>
      <td className="max-w-[360px] px-4 py-3 text-sm leading-5 text-zinc-600">{project.notes || <span className="text-zinc-300">No notes</span>}</td>
    </tr>
  )
}

export default function ProjectSchedulePage() {
  const data = getProjectScheduleInsights()

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
              Project Management Schedule
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Schedule Command Center</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-zinc-500">
              Parsed from Jireh's PM workbook into a live Services view for active projects, on-site coverage, logistics risk, and PM workload.
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
          <MetricCard label="Logistics Gaps" value={data.stats.missingLedDates} detail="Projects missing LED ship/on-site dates" icon={<Truck className="h-5 w-5" />} tone="warn" />
          <MetricCard label="Scheduled Revenue" value={formatMoney(data.stats.totalRevenue)} detail={`${formatMoney(data.stats.totalMargin)} margin${data.stats.marginPercent ? ` · ${data.stats.marginPercent}%` : ''}`} icon={<CircleDollarSign className="h-5 w-5" />} tone="good" />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-950">Priority Watchlist</h2>
                <p className="mt-1 text-xs text-zinc-500">The projects most likely to need coordination before the next PM meeting.</p>
              </div>
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <div className="divide-y divide-[#E8E8E8]">
              {data.riskProjects.slice(0, 8).map((project) => (
                <div key={project.project} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-zinc-950">{project.project}</h3>
                      <RiskBadge risk={project.risk} />
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">{project.riskReasons.join(' · ')}</p>
                    {project.notes && <p className="mt-2 text-sm leading-6 text-zinc-600">{project.notes}</p>}
                  </div>
                  <div className="min-w-[150px] text-sm text-zinc-600 md:text-right">
                    <div className="font-medium text-zinc-900">{project.pm || 'Unassigned'}</div>
                    <div className="mt-1 text-xs text-zinc-500">{project.nextDateLabel || 'Next milestone'}: {project.nextDate || '-'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">PM Load</h2>
                <UsersRound className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {data.pmLoad.slice(0, 8).map((pm) => (
                  <div key={pm.pm} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-950">{pm.pm}</div>
                      <div className="text-xs text-zinc-500">{pm.critical} action · {pm.watch} watch</div>
                    </div>
                    <div className="text-2xl font-semibold text-zinc-900">{pm.count}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">On-Site Months</h2>
                <CalendarDays className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="px-5 py-4">
                <div className="space-y-3">
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
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-950">Upcoming Milestones</h2>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="divide-y divide-[#E8E8E8]">
              {data.upcomingProjects.slice(0, 7).map((project) => (
                <div key={`${project.project}-${project.nextDateLabel}`} className="grid grid-cols-[1fr_auto] gap-4 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium text-zinc-950">{project.project}</div>
                    <div className="text-xs text-zinc-500">{project.pm || 'Unassigned'} · {project.nextDateLabel}</div>
                  </div>
                  <div className="text-right text-sm font-medium text-zinc-700">{project.nextDate}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm">
            <div className="border-b border-[#E8E8E8] px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-950">Pipeline Schedule Feed</h2>
              <p className="mt-1 text-xs text-zinc-500">Opportunity rows already sitting in the workbook by stage.</p>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              {data.pipelineByStage.map((stage) => (
                <div key={stage.stage} className="rounded-md border border-[#E8E8E8] bg-zinc-50 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">{stage.stage}</div>
                  <div className="mt-2 text-2xl font-semibold text-zinc-950">{stage.count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-md border border-[#E8E8E8] shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-[#E8E8E8] px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-950">Active Project Schedule</h2>
              <p className="mt-1 text-xs text-zinc-500">Dense view from the Active Projects tab, normalized enough for weekly PM review.</p>
            </div>
            <div className="text-xs text-zinc-500">{data.activeProjects.length} rows imported</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-zinc-50">
                <tr className="border-b border-[#E8E8E8]">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Project</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">PM</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Install</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Completion</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">LED Logistics</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Notes</th>
                </tr>
              </thead>
              <tbody>
                {data.activeProjects.map((project) => <ProjectRow key={project.project} project={project} />)}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
