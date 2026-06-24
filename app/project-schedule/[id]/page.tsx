import { notFound } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import {
  getProjectScheduleProjectLive,
  listProjectScheduleTasks,
  listProjectTransmittals,
} from '@/lib/project-schedule'
import { ProjectWorkspaceClient } from './project-workspace-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProjectWorkspacePage({ params }: { params: { id: string } }) {
  const result = await getProjectScheduleProjectLive(params.id)
  if (!result) notFound()

  const [tasks, transmittals] = await Promise.all([
    listProjectScheduleTasks(params.id),
    listProjectTransmittals(params.id),
  ])

  return (
    <DashboardLayout>
      <ProjectWorkspaceClient
        projectId={params.id}
        project={result.project}
        initialTasks={tasks}
        initialTransmittals={transmittals}
      />
    </DashboardLayout>
  )
}
