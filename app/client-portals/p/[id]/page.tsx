import { notFound } from 'next/navigation'
import { PortalViewer } from '@/components/proposal-portal/PortalViewer'
import { getProposalPortalById, serializeProposalPortalForClient } from '@/lib/proposal-portals-db'
import type { PortalRecipeId } from '@/lib/proposal-portal/types'

export default async function PublicClientPortalPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const portal = await getProposalPortalById(id)
  if (!portal) notFound()

  const doc = serializeProposalPortalForClient(portal, true)
  if (!doc) notFound()

  return (
    <PortalViewer
      showHud
      document={{
        id: doc.id,
        title: doc.title,
        mode: 'PROPOSAL',
        recipe: doc.recipe as PortalRecipeId,
        enabledModules: doc.enabledModules,
        data: doc.clientData,
        isPublic: true,
      }}
    />
  )
}
