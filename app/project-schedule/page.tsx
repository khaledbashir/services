import ProjectScheduleClient from './project-schedule-client'
import WorkbookEmptyState from './workbook-empty-state'
import { getProjectScheduleInsightsLive } from '@/lib/project-schedule'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ProjectSchedulePage() {
  const data = await getProjectScheduleInsightsLive()
  // A missing workbook is an empty state, not a server exception.
  if (data.workbook.status === 'missing') return <WorkbookEmptyState />
  return <ProjectScheduleClient data={data} />
}
