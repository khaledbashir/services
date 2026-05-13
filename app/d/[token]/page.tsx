import { notFound } from 'next/navigation'
import { query } from '@/lib/db'
import DashboardRenderer, { type DashboardSpec } from './DashboardRenderer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PublicDashboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await query(
    `SELECT title, subtitle, spec, expires_at, created_by, created_at
     FROM ai_dashboards
     WHERE token = $1
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [token]
  )
  if (result.rows.length === 0) notFound()
  const row = result.rows[0]

  // Bump view count async (non-blocking)
  query(
    `UPDATE ai_dashboards SET view_count = view_count + 1, last_viewed_at = NOW() WHERE token = $1`,
    [token]
  ).catch(() => {})

  const spec: DashboardSpec = typeof row.spec === 'string' ? JSON.parse(row.spec) : row.spec

  return (
    <DashboardRenderer
      spec={spec}
      meta={{
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      }}
    />
  )
}
