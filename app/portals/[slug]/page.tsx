import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth'
import PortalAdminClient from './portal-admin-client'
import PortalPublicClient from './portal-public-client'

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export default async function PortalPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  if (isUuid(slug)) {
    const session = await getSession()
    const role = session?.role || 'technician'
    const isManager = ['manager', 'tech_support', 'admin'].includes(role)

    if (!session) redirect('/login')
    if (!isManager) redirect('/dashboard')

    return <PortalAdminClient venueId={slug} />
  }

  return <PortalPublicClient token={slug} />
}
