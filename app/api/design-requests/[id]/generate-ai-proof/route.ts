import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { uploadProof, isConfigured } from '@/lib/proof-storage'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// ANC AI Design Assist — phase-1 endpoint (2026-04-23).
//
// Alexis on the call + in Slack asked for the system to take a first pass at
// the design brief so her designers refine/approve instead of starting from
// blank. This endpoint:
//   1. Fetches the design request context (local or Twenty-backed)
//   2. Builds a venue-aware prompt from title / client / boards / sizes / notes
//   3. Calls OpenAI's gpt-image-1 for a first-draft visual
//   4. Uploads the result to MinIO via the existing proof pipeline
//   5. Files it as a proof attachment with is_ai_generated=true so the UI
//      can badge it accordingly and the QC step still lives with the designer.
//
// Cost: ~$0.02-0.05 per generation at low quality / 1024x1024. Each design
// request can hit this multiple times (designers iterate). Fine for pilot.

const OPENAI_KEY = process.env.OPENAI_API_KEY || (() => {
  // Fall back to the shared AI_PROVIDERS_JSON OpenAI entry.
  try {
    const list = JSON.parse(process.env.AI_PROVIDERS_JSON || '[]')
    const openai = Array.isArray(list) ? list.find((p: any) => p?.name === 'openai' && p?.apiKey) : null
    return openai?.apiKey || ''
  } catch { return '' }
})()

// gpt-image-2 requires OpenAI org verification (503 on unverified accounts);
// gpt-image-1.5 is the latest we have unrestricted access to on this key.
const AI_MODEL = 'gpt-image-1.5'
const AI_SIZE = '1024x1024'
const AI_QUALITY = 'low'

async function loadDesignContext(id: string) {
  let ctx: {
    title: string
    client: string | null
    tricode: string | null
    venue: string | null
    boards: string | null
    sizes: string | null
    notes: string | null
  } = { title: 'Design Request', client: null, tricode: null, venue: null, boards: null, sizes: null, notes: null }

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
  // Merge in local row (has venue + notes that may not be in Twenty)
  const r = await query(
    `SELECT dr.job_title, dr.company_name, dr.tricode, dr.boards_requested, dr.sizes_requested,
            dr.notes, v.name as venue_name
     FROM design_requests dr LEFT JOIN venues v ON v.id = dr.venue_id
     WHERE dr.id = $1`, [id])
  if (r.rows[0]) {
    const row = r.rows[0]
    ctx.title = ctx.title === 'Design Request' ? (row.job_title || ctx.title) : ctx.title
    ctx.client = ctx.client || row.company_name || null
    ctx.tricode = ctx.tricode || row.tricode || null
    ctx.venue = row.venue_name || null
    ctx.boards = ctx.boards || row.boards_requested || null
    ctx.sizes = ctx.sizes || row.sizes_requested || null
    ctx.notes = ctx.notes || row.notes || null
  }
  return ctx
}

function buildPrompt(ctx: Awaited<ReturnType<typeof loadDesignContext>>): string {
  // Sports-broadcast graphic vocabulary. ANC's work is LED scoreboard, ribbon,
  // fascia, pre-game hype graphics. The prompt needs to push toward
  // "production-ready arena graphic" not "generic marketing poster."
  const parts: string[] = []
  parts.push('Professional sports venue LED scoreboard graphic mockup.')
  parts.push(`Design concept: ${ctx.title}.`)
  if (ctx.client) parts.push(`Client / team: ${ctx.client}${ctx.tricode ? ` (${ctx.tricode})` : ''}.`)
  if (ctx.venue) parts.push(`Venue context: ${ctx.venue}.`)
  if (ctx.boards) parts.push(`Display board(s): ${ctx.boards}.`)
  if (ctx.sizes) parts.push(`Target dimensions: ${ctx.sizes}.`)
  if (ctx.notes) parts.push(`Creative brief notes: ${ctx.notes.slice(0, 400)}.`)
  parts.push(
    'Style: bold, high-contrast, readable from 200 feet in a packed arena.',
    'Composition: clean hero graphic, proper typography hierarchy, team colors accurate where inferable.',
    'Technical: professional broadcast graphics quality, NOT photorealistic, NOT a photo of a stadium.',
    'Output should look like a finished scoreboard graphic ready for a designer to refine.',
  )
  return parts.join(' ')
}

async function generateImage(prompt: string): Promise<Buffer> {
  if (!OPENAI_KEY) throw new Error('OpenAI API key not configured')
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_MODEL,
      prompt,
      n: 1,
      size: AI_SIZE,
      quality: AI_QUALITY,
    }),
    signal: AbortSignal.timeout(120_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI image gen ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { data?: Array<{ b64_json?: string; url?: string }> }
  const item = data.data?.[0]
  if (!item) throw new Error('Empty image response')
  if (item.b64_json) return Buffer.from(item.b64_json, 'base64')
  if (item.url) {
    // Some accounts return URL instead of base64. Fetch + buffer it.
    const img = await fetch(item.url)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('No image data in response')
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  // Make sure the local mirror row exists (same pattern as regular upload)
  const existsRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (existsRes.rows.length === 0) {
    if (isTwentyBackedEnabled('DESIGNS')) {
      const d = await Designs.get(params.id) as any
      if (!d) return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      await query(
        `INSERT INTO design_requests (id, job_title, company_name, status, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [d.id, d.name || '(untitled)', d.designClient?.name || null,
         ((d.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted',
         typeof d.notes === 'object' ? (d.notes?.markdown || '') : (d.notes || d.aiPrompt || '')]
      )
    } else {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
    }
  }

  if (!OPENAI_KEY) {
    return NextResponse.json({ error: 'AI image generation is not configured on this environment' }, { status: 501 })
  }

  let ctx
  try {
    ctx = await loadDesignContext(params.id)
  } catch (err) {
    return NextResponse.json({ error: 'Failed to load design context' }, { status: 500 })
  }

  const prompt = buildPrompt(ctx)

  let bytes: Buffer
  try {
    bytes = await generateImage(prompt)
  } catch (err: any) {
    console.error('[generate-ai-proof] image gen failed:', err)
    return NextResponse.json({ error: err?.message || 'AI image generation failed' }, { status: 502 })
  }

  const filename = `ai-first-draft-${Date.now()}.png`
  const contentType = 'image/png'

  // MinIO upload with bytea fallback — mirrors the regular upload path.
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
    [params.id, filename, contentType, bytes.byteLength, byteaData, auth.userId,
     storageKey, storageBackend, storageEtag,
     prompt.slice(0, 2000), AI_MODEL]
  )

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
  const downloadUrl = `${baseUrl}/api/design-requests/${params.id}/proofs/${inserted.rows[0].id}/download`

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
      ai_model: AI_MODEL,
      download_url: downloadUrl,
    },
    prompt_used: prompt,
  })
}
