import ProjectScheduleClient from './project-schedule-client'
import { getProjectScheduleInsights } from '@/lib/project-schedule'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ProjectSchedulePage() {
  const data = getProjectScheduleInsights()
  return <ProjectScheduleClient data={data} />
}
