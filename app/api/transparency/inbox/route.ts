export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// GET /api/transparency/inbox
// Admin-only. Returns rows that the auto-push hook (or any other automated
// source) wrote into the ledger but Ahmad hasn't confirmed yet. Each row
// carries its deterministic estimate + the comparable-priors rationale chain
// so the inbox UI can show "approve at 1.5h based on these 3 past tasks" with
// zero extra fetches.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const r = await query(
    `SELECT id::text, source, repo, area, classification, bucket,
            COALESCE(summary, raw_text) AS summary, raw_text,
            estimated_hours, estimate_basis, estimate_basis_chain,
            actual_hours, retainer_covered, shipped_at, received_at,
            shipped_commit_sha
       FROM service_requests
      WHERE COALESCE(bucket_confirmed, false) = false
        AND status IN ('shipped', 'in_progress', 'open')
        AND received_at >= NOW() - INTERVAL '14 days'
      ORDER BY shipped_at DESC NULLS LAST, received_at DESC
      LIMIT 100`,
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
      estimate_basis: row.estimate_basis,
      estimate_basis_chain: row.estimate_basis_chain,
      actual_hours: row.actual_hours == null ? null : Number(row.actual_hours),
      retainer_covered: Boolean(row.retainer_covered),
      shipped_at: row.shipped_at ? new Date(row.shipped_at as Date).toISOString() : null,
      received_at: row.received_at ? new Date(row.received_at as Date).toISOString() : null,
      shipped_commit_sha: row.shipped_commit_sha,
    })),
  })
}
