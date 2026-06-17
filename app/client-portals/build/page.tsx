import { redirect } from 'next/navigation'
import { PortalBuilder } from '@/components/proposal-portal/PortalBuilder'
import { getSession } from '@/lib/auth'
import { getProposalPortalById } from '@/lib/proposal-portals-db'
import { parseClientData, parseModules, parseRecipe } from '@/lib/proposal-portal/serialize'

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function ClientPortalBuildPage({ searchParams }: PageProps) {
  const session = await getSession()
  if (!session) redirect('/login?redirect=/client-portals')

  const role = session.role || 'technician'
  const isManager = ['manager', 'tech_support', 'admin'].includes(role)
  if (!isManager) redirect('/dashboard')

  const params = (await searchParams) ?? {}
  const id = typeof params.id === 'string' ? params.id : ''
  if (!id) redirect('/client-portals')

  const portal = await getProposalPortalById(id)
  if (!portal) redirect('/client-portals')

  return (
    <PortalBuilder
      portalId={portal.id}
      initialTitle={portal.title}
      initialRecipe={parseRecipe(portal.recipe)}
      initialModules={parseModules(portal.enabled_modules)}
      initialData={parseClientData(portal.client_data)}
      initialPublic={portal.is_public}
    />
  )
}
