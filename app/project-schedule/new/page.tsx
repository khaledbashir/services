import { getProjectScheduleInsightsLive } from '@/lib/project-schedule'
import { NewScheduleClient } from './new-schedule-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function NewProjectSchedulePage() {
  const data = await getProjectScheduleInsightsLive()
  const projects = data.activeProjects.map((project) => ({
    id: project.id,
    name: project.project,
    pm: project.pm,
    installOnsite: project.installOnsite,
  }))
  return <NewScheduleClient projects={projects} />
}
