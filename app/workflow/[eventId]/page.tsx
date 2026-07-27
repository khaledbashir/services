'use client'

import { useParams } from 'next/navigation'
import { WorkflowBody } from '@/components/event-workflow'

export default function WorkflowPage() {
  const params = useParams()
  return <WorkflowBody eventId={params.eventId as string} />
}
