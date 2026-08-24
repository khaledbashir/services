import { query } from '@/lib/db'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { uploadProof, isConfigured } from '@/lib/proof-storage'
import {
  buildPlan,
  buildImagePrompt,
  validatePlan,
  type DesignContext,
  type PackagePlan,
} from '@/lib/ai/signage-planner'
import type { Skill } from '@/lib/ai/types'

const AI_MODEL = process.env.POLLINATIONS_IMAGE_MODEL || 'flux'
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1.5'
const AI_SIZE = '1024x1024'
const AI_QUALITY = 'low'

function getPollinationsKey(args: Record<string, unknown>): string {
  if (args.pollinations_api_key && typeof args.pollinations_api_key === 'string') return args.pollinations_api_key
  return process.env.POLLINATIONS_API_KEY || ''
}

function getOpenAIKey(args: Record<string, unknown>): string {
  if (args.api_key && typeof args.api_key === 'string') return args.api_key
  try {
    const list = JSON.parse(process.env.AI_PROVIDERS_JSON || '[]')
    const openai = Array.isArray(list) ? list.find((p: any) => p?.name === 'openai' && p?.apiKey) : null
    if (openai?.apiKey) return openai.apiKey
  } catch {}
  return process.env.OPENAI_API_KEY || ''
}

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

async function generateImage(prompt: string, apiKey: string, provider: 'pollinations' | 'openai'): Promise<Buffer> {
  if (provider === 'pollinations') {
    return generatePollinationsImage(prompt, apiKey)
  }

  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
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
    const img = await fetch(item.url)
    return Buffer.from(await img.arrayBuffer())
  }
  throw new Error('No image data in response')
}

async function generatePollinationsImage(prompt: string, apiKey: string): Promise<Buffer> {
  const baseUrl = (process.env.POLLINATIONS_BASE_URL || 'https://gen.pollinations.ai').replace(/\/$/, '')
  const params = new URLSearchParams({
    model: AI_MODEL,
    width: '1024',
    height: '1024',
    enhance: 'true',
  })

  const res = await fetch(`${baseUrl}/image/${encodeURIComponent(prompt)}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    signal: AbortSignal.timeout(120_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pollinations image gen ${res.status}: ${body.slice(0, 300)}`)
  }

  const contentType = res.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    const body = await res.text().catch(() => '')
    throw new Error(`Pollinations returned non-image response: ${body.slice(0, 300)}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

function storagePrompt(prompt: string, plan: PackagePlan): string {
  const summary = JSON.stringify({
    planning_version: plan.planning_version,
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

const skill: Skill = {
  name: 'generate_signage_proof',
  description: 'Generate a venue-ready arena signage proof for a design request. Plans board geometry, classifies the request type, builds a creative brief with board-specific adaptation strategies, validates production constraints, then generates a production-minded AI proof image. Returns the plan and the proof file.',
  category: 'Creative',
  icon: '@/',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      design_request_id: {
        type: 'string',
        description: 'The design request ID to generate a proof for',
      },
      api_key: {
        type: 'string',
        description: 'Optional OpenAI API key override. Used only when Pollinations is not configured.',
      },
      pollinations_api_key: {
        type: 'string',
        description: 'Optional Pollinations API key override. If not provided, uses POLLINATIONS_API_KEY.',
      },
      dry_run: {
        type: 'boolean',
        description: 'If true, returns the plan and prompt without generating an image. Useful for reviewing the plan before committing to generation.',
      },
    },
    required: ['design_request_id'],
  },

  async handler(args, ctx) {
    const id = String(args.design_request_id || '').trim()
    if (!id) throw new Error('design_request_id is required')

    const pollinationsKey = getPollinationsKey(args)
    const openAiKey = getOpenAIKey(args)
    const imageProvider: 'pollinations' | 'openai' = pollinationsKey ? 'pollinations' : 'openai'
    const apiKey = pollinationsKey || openAiKey

    let designCtx: DesignContext
    try {
      designCtx = await loadDesignContext(id)
    } catch {
      throw new Error('Failed to load design context for request ' + id)
    }

    const plan = buildPlan(designCtx)
    const validation = validatePlan(plan)

    if (!validation.valid) {
      return {
        ok: false,
        error: {
          code: 'validation_failed',
          message: `Plan validation failed: ${validation.blocks.join('; ')}`,
          suggestion: 'Check board sizes and request details. Provide at least one valid board size.',
        },
        text_summary: `Validation failed for "${designCtx.title}"`,
        plan,
        validation,
      }
    }

    const prompt = buildImagePrompt(designCtx, plan)

    if (args.dry_run) {
      return {
        ok: true,
        dry_run: true,
        plan,
        prompt,
        validation,
        text_summary: `Dry run for "${designCtx.title}" — plan built, no image generated. ${validation.warnings.length > 0 ? `Warnings: ${validation.warnings.join('; ')}` : ''}`,
      }
    }

    if (!apiKey) {
      return {
        ok: false,
        error: {
          code: 'no_api_key',
          message: 'No image generation key configured',
          suggestion: 'Configure POLLINATIONS_API_KEY or OPENAI_API_KEY, or pass pollinations_api_key/api_key.',
        },
        text_summary: 'No image generation key available',
        plan,
      }
    }

    const existsRes = await query(`SELECT id FROM design_requests WHERE id = $1`, [id])
    if (existsRes.rows.length === 0) {
      if (isTwentyBackedEnabled('DESIGNS')) {
        const d = await Designs.get(id) as any
        if (!d) {
          return { ok: false, error: { code: 'not_found', message: `Design request ${id} not found` }, text_summary: 'Design request not found' }
        }
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
        return { ok: false, error: { code: 'not_found', message: `Design request ${id} not found` }, text_summary: 'Design request not found' }
      }
    }

    let bytes: Buffer
    try {
      bytes = await generateImage(prompt, apiKey, imageProvider)
    } catch (err: any) {
      return {
        ok: false,
        error: { code: 'image_generation_failed', message: err?.message || 'AI image generation failed' },
        text_summary: `Image generation failed for "${designCtx.title}"`,
        plan,
        prompt,
      }
    }

    const filename = `ai-signage-proof-${Date.now()}.png`
    const contentType = 'image/png'

    let storageBackend: 's3' | 'postgres_bytea' = 'postgres_bytea'
    let storageKey: string | null = null
    let storageEtag: string | null = null
    let byteaData: Buffer | null = bytes

    if (isConfigured()) {
      try {
        const uploaded = await uploadProof({ designRequestId: id, filename, contentType, body: bytes })
        storageBackend = 's3'
        storageKey = uploaded.key
        storageEtag = uploaded.etag
        byteaData = null
      } catch (err) {
        console.error('[generate-signage-proof] MinIO failed, falling back to bytea:', err)
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
        id,
        filename,
        contentType,
        bytes.byteLength,
        byteaData,
        ctx.userId,
        storageKey,
        storageBackend,
        storageEtag,
        storagePrompt(prompt, plan),
        imageProvider === 'pollinations' ? `pollinations:${AI_MODEL}` : `openai:${OPENAI_IMAGE_MODEL}`,
      ]
    )

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'
    const downloadUrl = `${baseUrl}/api/design-requests/${id}/proofs/${inserted.rows[0].id}/download`

    const boardSummary = plan.boards.map(b => `${b.board_name} (${b.width}x${b.height}, ${b.board_type})`).join(', ')

    return {
      ok: true,
      proof: {
        id: inserted.rows[0].id,
        filename: inserted.rows[0].filename,
        mime_type: inserted.rows[0].mime_type,
        size_bytes: Number(inserted.rows[0].size_bytes || 0),
        backend: inserted.rows[0].storage_backend,
        uploaded_at: inserted.rows[0].created_at,
        version: Number(inserted.rows[0].version || 1),
        is_ai_generated: true,
        ai_model: imageProvider === 'pollinations' ? `pollinations:${AI_MODEL}` : `openai:${OPENAI_IMAGE_MODEL}`,
        download_url: downloadUrl,
      },
      plan,
      prompt_used: prompt,
      validation,
      text_summary: `Generated ${plan.request_type} signage proof for "${designCtx.title}" — ${plan.boards.length} board(s): ${boardSummary}. [open →](/designs/${id})`,
      _ui_action: { type: 'refresh' },
    }
  },
}

export default skill
