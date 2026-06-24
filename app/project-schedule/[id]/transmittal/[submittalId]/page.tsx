import { notFound } from 'next/navigation'
import {
  deriveTransmittalFromSubmittal,
  getProjectScheduleProjectLive,
  getProjectTransmittal,
  type TransmittalInput,
} from '@/lib/project-schedule'
import { TransmittalClient } from './transmittal-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// /project-schedule/[id]/transmittal/[submittalId]
//   - submittalId is a submittal register row id -> derive a fresh draft
//   - submittalId can also be `t-<transmittalId>` to reopen a saved transmittal
export default async function TransmittalPage({
  params,
}: {
  params: { id: string; submittalId: string }
}) {
  const result = await getProjectScheduleProjectLive(params.id)
  if (!result) notFound()
  const { project } = result

  let draft: TransmittalInput | null = null
  let savedId: string | null = null

  if (params.submittalId.startsWith('t-')) {
    const saved = await getProjectTransmittal(params.submittalId.slice(2))
    if (saved && saved.projectId === params.id) {
      savedId = saved.id
      draft = {
        submittalId: saved.submittalId,
        to: saved.to,
        from: saved.from,
        date: saved.date,
        project: saved.project,
        submittalNo: saved.submittalNo,
        sendingItems: saved.sendingItems,
        transmittedAs: saved.transmittedAs,
        items: saved.items,
        remarks: saved.remarks,
        remarksBy: saved.remarksBy,
        copiesTo: saved.copiesTo,
        signedBy: saved.signedBy,
      }
    }
  } else {
    draft = await deriveTransmittalFromSubmittal(params.id, params.submittalId)
  }

  if (!draft) notFound()

  return (
    <TransmittalClient
      projectId={params.id}
      projectName={project.project}
      pm={project.pm}
      draft={draft}
      savedId={savedId}
    />
  )
}
