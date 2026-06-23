import ProjectScheduleClient from './project-schedule-client'
import { getProjectScheduleInsightsLive } from '@/lib/project-schedule'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProjectSchedulePage() {
  const data = await getProjectScheduleInsightsLive()
  return <ProjectScheduleClient data={data} />
}
