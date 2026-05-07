import { notFound } from 'next/navigation'
import TransparencyDashboard from '../TransparencyDashboard'
import { verifyTransparencyToken } from '@/lib/transparency-token'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function TokenizedTransparencyPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const payload = verifyTransparencyToken(token)
  if (!payload) notFound()

  return <TransparencyDashboard />
}
