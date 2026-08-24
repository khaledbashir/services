import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, isConfigured } from '@/lib/proof-storage'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import {
  buildPlan,
  buildImagePrompt,
  type DesignContext,
  type PackagePlan,
} from '@/lib/ai/signage-planner'
import { generateImage, isImageGenerationConfigured } from '@/lib/ai/image-provider'

async function loadDesignContext(id: string): Promise<DesignContext> {
  const ctx: DesignContext = {
    title: 'Design Request',
    client: null,
    tricode: null,
    venue: null,
    boards: null,
    sizes: null,
    notes: null,
    clientBrief: null,
  }

  if (isTwentyBackedEnabled('DESIGNS')) {
    const d = await Designs.get(id) as any
    if (d) {
      ctx.title = d.name || ctx.title
      ctx.client = d.designClient?.name || null
      ctx.tricode = d.clientTriCode || null
      ctx.boards = d.boardSection || null
      ctx.sizes = d.sizes || null
      ctx.notes = typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || '')
    }
  }

  const r = await query(
    `SELECT dr.job_title, dr.company_name, dr.tricode, dr.boards_requested, dr.sizes_requested,
            dr.notes, dr.client_brief, v.name as venue_name
     FROM design_requests dr LEFT JOIN venues v ON v.id = dr.venue_id
     WHERE dr.id = $1`,
    [id]
  )

  if (r.rows[0]) {
    const row = r.rows[0]
    ctx.title = ctx.title === 'Design Request' ? (row.job_title || ctx.title) : ctx.title
    ctx.client = ctx.client || row.company_name || null
    ctx.tricode = ctx.tricode || row.tricode || null
    ctx.venue = row.venue_name || null
    // The client's own words (client_brief) are the request; `notes` is the
    // account manager's summary of it. The planner reads both.
    ctx.clientBrief = ctx.clientBrief || row.client_brief || null
    ctx.boards = ctx.boards || row.boards_requested || null
    ctx.sizes = ctx.sizes || row.sizes_requested || null
    ctx.notes = ctx.notes || row.notes || null
  }

  return ctx
}

function storagePrompt(prompt: string, plan: PackagePlan): string {
  const summary = JSON.stringify({
    request_type: plan.request_type,
    creative_brief: plan.creative_brief,
    boards: plan.boards.map(board => ({
      board_name: board.board_name,
      dimensions: `${board.width}x${board.height}`,
      board_type: board.board_type,
    })),
  })
  return `${prompt}\n\nPLAN ${summary}`.slice(0, 2000)
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    return await handle(request, params)
  } catch (err: any) {
    console.error('[generate-ai-proof] unhandled error:', err)
    return NextResponse.json(
      {
        error: err?.message || 'AI image generation crashed',
        where: err?.where || null,
        code: err?.code || null,
        detail: err?.detail || null,
      },
      { status: 500 }
    )
  }
}

async function handle(request: NextRequest, params: { id: string }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const existsRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (existsRes.rows.length === 0) {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const d = await Designs.get(params.id) as any
      if (!d) return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      await query(
        `INSERT INTO design_requests (id, job_title, company_name, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          d.id,
          d.name || '(untitled)',
          d.designClient?.name || null,
          ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
          typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || ''),
        ]
      )
    } else {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
  }

  if (!isImageGenerationConfigured()) {
    return NextResponse.json({ error: 'AI image generation is not configured on this environment' }, { status: 501 })
  }

  let ctx: DesignContext
  try {
    ctx = await loadDesignContext(params.id)
  } catch {
    return NextResponse.json({ error: 'Failed to load design context' }, { status: 500 })
  }

  const plan = buildPlan(ctx)
  const prompt = buildImagePrompt(ctx, plan)

  let image: Awaited<ReturnType<typeof generateImage>>
  try {
    image = await generateImage(prompt)
  } catch (err: any) {
    console.error('[generate-ai-proof] image gen failed:', err)
    return NextResponse.json({ error: err?.message || 'AI image generation failed' }, { status: 502 })
  }

  const bytes = image.bytes
  // Name the file after what it actually is. Providers do not all return PNG,
  // and a .png holding JPEG bytes fails to open on a designer's desk.
  const filename = `ai-signage-proof-${Date.now()}.${image.extension}`
  const contentType = image.contentType
  const aiModel = `${image.provider}/${image.model}`

  let storageBackend: 's3' | 'postgres_bytea' = 'postgres_bytea'
  let storageKey: string | null = null
  let storageEtag: string | null = null
  let byteaData: Buffer | null = bytes

  if (isConfigured()) {
    try {
      const uploaded = await uploadProof({
        designRequestId: params.id,
        filename,
        contentType,
        body: bytes,
      })
      storageBackend = 's3'
      storageKey = uploaded.key
      storageEtag = uploaded.etag
      byteaData = null
    } catch (err) {
      console.error('[generate-ai-proof] MinIO failed, falling back to bytea:', err)
    }
  }

  const inserted = await query(
    `INSERT INTO design_request_files
       (design_request_id, filename, mime_type, size_bytes, data, uploaded_by,
        storage_key, storage_backend, storage_etag, version,
        is_ai_generated, ai_prompt, ai_model)
     SELECT
       $1, $2, $3, $4, $5, $6, $7, $8, $9,
       COALESCE(MAX(version), 0) + 1,
       true, $10, $11
     FROM design_request_files
     WHERE design_request_id = $1
     RETURNING id, filename, mime_type, size_bytes, storage_backend, created_at, version`,
    [
      params.id,
      filename,
      contentType,
      bytes.byteLength,
      byteaData,
      auth.userId,
      storageKey,
      storageBackend,
      storageEtag,
      storagePrompt(prompt, plan),
      aiModel,
    ]
  )

  const baseUrl = request.nextUrl.origin
  const downloadUrl = `${baseUrl}/api/design-requests/${params.id}/proofs/${inserted.rows[0].id}/download`
  await query(
    `UPDATE design_requests SET ftp_proof_link = $1, updated_at = NOW() WHERE id = $2`,
    [downloadUrl, params.id],
  )
  if (isTwentyBackedEnabled('DESIGNS')) {
    try {
      await Designs.update(params.id, { proofLink: downloadUrl })
    } catch (err) {
      console.error('[generate-ai-proof] Twenty proof link update failed:', err)
    }
  }

  return NextResponse.json({
    proof: {
      id: inserted.rows[0].id,
      filename: inserted.rows[0].filename,
      mime_type: inserted.rows[0].mime_type,
      size_bytes: Number(inserted.rows[0].size_bytes || 0),
      backend: inserted.rows[0].storage_backend,
      uploaded_at: inserted.rows[0].created_at,
      version: Number(inserted.rows[0].version || 1),
      is_ai_generated: true,
      ai_model: aiModel,
      download_url: downloadUrl,
    },
    plan,
    prompt_used: prompt,
  })
}
