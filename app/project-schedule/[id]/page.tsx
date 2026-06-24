import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, ExternalLink, FileText, FolderKanban, Truck } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { getProjectScheduleProjectLive, type DeploymentDocumentStatus, type DeploymentStatus } from '@/lib/project-schedule'
import { ProjectDeploymentEditable } from './project-deployment-editable'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold ring-1 ${className}`}>{children}</span>
}

function EmptyDash({ value }: { value?: string | null }) {
  return <>{value ? value : <span className="text-zinc-300">-</span>}</>
}

export default async function ProjectDeploymentPage({ params }: { params: { id: string } }) {
  const result = await getProjectScheduleProjectLive(params.id)
  if (!result) notFound()

  const { project, onsiteAssignments, opportunities } = result

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link href="/project-schedule" className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-[#0A52EF]">
              <ArrowLeft className="h-4 w-4" />
              Project Deployment Workspace
            </Link>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge className={deploymentStyles[project.deploymentStatus]}>{deploymentLabels[project.deploymentStatus]}</Badge>
              <Badge className="bg-zinc-100 text-zinc-600 ring-zinc-200">{project.phase}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-zinc-950">{project.project}</h1>
            <p className="mt-1 text-sm text-zinc-500">{project.pm || 'Unassigned'} · {project.documentGapCount} document gaps</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {[
              ['Install', project.installOnsite],
              ['Completion', project.substantialCompletion],
              ['LED ship', project.ledShipDate],
              ['LED on-site', project.ledOnSite],
            ].map(([label, value]) => (
              <div key={label} className="rounded-md border border-[#E8E8E8] bg-white px-4 py-3 shadow-sm">
                <div className="text-xs text-zinc-500">{label}</div>
                <div className="mt-1 font-medium text-zinc-950"><EmptyDash value={value} /></div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <ProjectDeploymentEditable project={project} />

            <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">Project Documents</h2>
                <FileText className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="px-5 py-4">
                {project.documentFolderUrl ? (
                  <a href={project.documentFolderUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] px-3 text-sm font-semibold text-zinc-800 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
                    Open project folder <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <p className="text-sm text-zinc-500">No project folder linked yet.</p>
                )}
              </div>
            </section>

            <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">Deployment Checklist</h2>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {project.deploymentChecklist.map((item) => (
                  <div key={`${item.label}-${item.owner}`} className="grid gap-3 px-5 py-3 md:grid-cols-[auto_1fr_auto] md:items-center">
                    <span className="h-4 w-4 rounded border border-zinc-300" />
                    <div>
                      <div className="text-sm font-medium text-zinc-950">{item.label}</div>
                      <div className="text-xs text-zinc-500">{item.owner}</div>
                    </div>
                    <Badge className={documentStyles[item.status]}>{item.status}</Badge>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-[#E8E8E8] bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-950">Project Notes</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-700">{project.notes || 'No notes captured in the workbook.'}</p>
            </section>
          </div>

          <div className="space-y-6">
            <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">Delivery Team</h2>
                <FolderKanban className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="grid gap-3 p-5 text-sm">
                {[
                  ['PM', project.pm],
                  ['Control system', project.controlSystem],
                  ['Product supplier', project.productSupplier],
                  ['Integration manager', project.integrationManager],
                  ['Integration sub', project.integrationSub],
                  ['Install sub', project.installSub],
                  ['Electrical sub', project.electricalSub],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <span className="text-zinc-500">{label}</span>
                    <span className="text-right font-medium text-zinc-900"><EmptyDash value={value} /></span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">On-Site Schedule</h2>
                <CalendarDays className="h-4 w-4 text-[#0A52EF]" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {onsiteAssignments.length ? onsiteAssignments.map((assignment) => (
                  <div key={`${assignment.month}-${assignment.week}-${assignment.assignment}`} className="px-5 py-3">
                    <div className="text-sm font-medium text-zinc-950">{assignment.month} · {assignment.week}</div>
                    <div className="mt-1 text-xs text-zinc-500">{assignment.assignment}</div>
                  </div>
                )) : (
                  <div className="px-5 py-4 text-sm text-zinc-500">No on-site schedule row matched this project.</div>
                )}
              </div>
            </section>

            <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-950">Pipeline Matches</h2>
                <Truck className="h-4 w-4 text-amber-600" />
              </div>
              <div className="divide-y divide-[#E8E8E8]">
                {opportunities.length ? opportunities.map((item) => (
                  <div key={`${item.account}-${item.opportunity}`} className="px-5 py-3">
                    <div className="text-sm font-medium text-zinc-950">{item.account}</div>
                    <div className="mt-1 text-xs text-zinc-500">{item.vendor || 'Vendor not listed'} · {item.estimatedCompletion || 'Completion not listed'}</div>
                  </div>
                )) : (
                  <div className="px-5 py-4 text-sm text-zinc-500">No pipeline row matched this project.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
