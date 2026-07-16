/**
 * POST /api/proof-share/[token]/client-upload
 *
 * Charlie 2026-07-16: when a client denies proofs (or sends wrong media),
 * they can drop replacement assets on the proof link. Files land in proof
 * storage under client-uploads/<token>/ and are recorded on proof_shares
 * for designers to pick up — FTP is read-only so we cannot write back into
 * the original proof folder.
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { uploadProof } from '@/lib/proof-storage'
import { logDesignActivity } from '@/lib/design-activity'
import { logCgDesignActivity } from '@/lib/cg-design-activity'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

type ClientUpload = {
  key: string
  filename: string
  contentType: string
  size: number
  uploadedAt: string
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } },
) {
  try {
    const token = params.token
    const shareRes = await query(
      `SELECT token, twenty_object_type, twenty_record_id, client_uploads, expires_at
       FROM proof_shares WHERE token = $1`,
      [token],
    )
    const share = shareRes.rows[0]
    if (!share) {
      return NextResponse.json({ error: 'Proof link not found' }, { status: 404 })
    }
    if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This proof link has expired' }, { status: 410 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (file.size > 200 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 200MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const designRequestId =
      share.twenty_object_type === 'localDesignRequest' || share.twenty_object_type === 'designRequest'
        ? String(share.twenty_record_id || token)
        : `proof-${token}`

    const stored = await uploadProof({
      designRequestId: `client-uploads/${designRequestId}`,
      filename: file.name || 'client-upload',
      contentType: file.type || 'application/octet-stream',
      body: buffer,
    })

    const entry: ClientUpload = {
      key: stored.key,
      filename: stored.filename,
      contentType: stored.contentType,
      size: stored.size,
      uploadedAt: stored.uploadedAt,
    }

    if (share.twenty_object_type === 'localCgDesignRequest' && share.twenty_record_id) {
      await query(
        `UPDATE cg_design_requests SET status = 'revisions', updated_at = NOW() WHERE id = $1`,
        [share.twenty_record_id],
      )
      await logCgDesignActivity({
        cgDesignRequestId: String(share.twenty_record_id),
        eventType: 'client_upload',
        actor: { fullName: 'Client' },
        toValue: entry.filename,
        detail: { proofToken: token, key: entry.key, size: entry.size },
      })
    }

    const prior: ClientUpload[] = Array.isArray(share.client_uploads) ? share.client_uploads : []
    const next = [...prior, entry]
    await query(
      `UPDATE proof_shares SET client_uploads = $2::jsonb WHERE token = $1`,
      [token, JSON.stringify(next)],
    )

    if (
      (share.twenty_object_type === 'localDesignRequest' || share.twenty_object_type === 'designRequest') &&
      share.twenty_record_id
    ) {
      // Any client media drop should pull the job back into In Queue for rework.
      await query(
        `UPDATE design_requests SET status = 'in_queue', updated_at = NOW() WHERE id = $1`,
        [share.twenty_record_id],
      )
      await logDesignActivity({
        designRequestId: String(share.twenty_record_id),
        eventType: 'client_upload',
        actor: { fullName: 'Client' },
        toValue: entry.filename,
        detail: { proofToken: token, key: entry.key, size: entry.size },
      }).catch(() => {})
    }

    return NextResponse.json({ ok: true, upload: entry, uploads: next })
  } catch (err) {
    console.error('[proof client-upload]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Upload failed' },
      { status: 500 },
    )
  }
}
