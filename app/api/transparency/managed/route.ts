export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// GET /api/transparency/managed?q=&bucket=&limit=100
// Admin-only. Returns the rows Ahmad has already acted on (bucket_confirmed = true)
// so he can edit, reclassify, unapprove, or delete past entries. The inbox
// endpoint at /api/transparency/inbox returns ONLY pending rows; this one
// returns the everything-else half so the admin UI has full coverage.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') || '').trim()
  const bucketFilter = (url.searchParams.get('bucket') || '').trim()
  const limit = Math.min(500, Math.max(10, Number(url.searchParams.get('limit') || 100)))

  const where: string[] = ['COALESCE(bucket_confirmed, false) = true']
  const params: unknown[] = []
  if (q) {
    params.push(`%${q.toLowerCase()}%`)
    where.push(`(LOWER(COALESCE(summary, raw_text, '')) LIKE $${params.length} OR LOWER(COALESCE(repo, '')) LIKE $${params.length} OR LOWER(COALESCE(area, '')) LIKE $${params.length})`)
  }
  if (bucketFilter && ['service_contract', 'warranty', 'change_order', 'not_billable'].includes(bucketFilter)) {
    params.push(bucketFilter)
    where.push(`COALESCE(bucket, 'service_contract') = $${params.length}`)
  }
  params.push(limit)

  const r = await query(
    `SELECT id::text, source, repo, area, classification, bucket,
            COALESCE(summary, raw_text) AS summary, raw_text,
            estimated_hours, actual_hours, retainer_covered, status,
            shipped_at, received_at, shipped_commit_sha
       FROM service_requests
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(shipped_at, received_at, updated_at) DESC NULLS LAST
      LIMIT $${params.length}`,
    params,
  )

  return NextResponse.json({
    rows: r.rows.map((row) => ({
      id: String(row.id),
      source: row.source,
      repo: row.repo,
      area: row.area,
      classification: row.classification,
      bucket: row.bucket || 'service_contract',
      summary: row.summary,
      raw_text: row.raw_text,
      estimated_hours: row.estimated_hours == null ? null : Number(row.estimated_hours),
      actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
      retainer_covered: Boolean(row.retainer_covered),
      status: row.status,
      shipped_at: row.shipped_at ? new Date(row.shipped_at as Date).toISOString() : null,
      received_at: row.received_at ? new Date(row.received_at as Date).toISOString() : null,
      shipped_commit_sha: row.shipped_commit_sha,
    })),
  })
}
