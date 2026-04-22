import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { deleteProof } from '@/lib/proof-storage'

// Delete a specific proof (storage + DB row). Bytea rows just cascade;
// S3 rows also remove the MinIO object so we don't leak storage.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; fileId: string } }
) {
  const auth = await requireRole(_request, 'manager')
  if (isAuthError(auth)) return auth

  const res = await query(
    `SELECT storage_key, storage_backend FROM design_request_files
     WHERE id = $1 AND design_request_id = $2`,
    [params.fileId, params.id]
  )
  if (res.rows.length === 0) {
    return NextResponse.json({ error: 'Proof not found' }, { status: 404 })
  }
  const row = res.rows[0]

  if (row.storage_backend === 's3' && row.storage_key) {
    try {
      await deleteProof(row.storage_key)
    } catch (err) {
      console.error('[proof delete] S3 delete failed (continuing with DB delete):', err)
      // Don't block DB delete on S3 flake — we can run a reconcile cron later
    }
  }

  await query(`DELETE FROM design_request_files WHERE id = $1`, [params.fileId])
  return NextResponse.json({ ok: true })
}
