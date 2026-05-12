export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { buildConsultantContext } from '@/lib/consultant-context'

const UPSTREAM_BASE = process.env.ANYTHINGLLM_BASE_URL || 'https://abc-anything-llm.izcgmb.easypanel.host'
const API_KEY = process.env.ANYTHINGLLM_API_KEY || 'M2NAYWB-8AC4WDV-N57T6QT-5THRSJY'
const WORKSPACE_SLUG = process.env.ANC_CONSULTANT_WORKSPACE_SLUG || 'anc-executive-advisor'
const PINNED_DOC_TITLE = 'anc-live-context.md'

interface DocRow { name?: string; title?: string; location?: string; pinnedWorkspaces?: number[] }

/**
 * On call:
 *   1. Build a fresh ANC operating-state markdown block.
 *   2. POST it to /api/v1/document/raw-text (creates a custom-document).
 *   3. Move-into the executive-advisor workspace + pin it.
 *   4. Walk the existing workspace docs and delete previous live-context
 *      uploads so the workspace doesn't accumulate stale snapshots.
 *
 * The whole thing is best-effort — failures are reported but never block
 * the chat surface.
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  try {
    const markdown = await buildConsultantContext({
      fullName: auth.fullName,
      email: auth.email,
      role: auth.role,
    })

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    }

    // 1. Drop the markdown into AnythingLLM as a custom document
    const upload = await fetch(`${UPSTREAM_BASE}/api/v1/document/raw-text`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        textContent: markdown,
        metadata: {
          title: PINNED_DOC_TITLE,
          description: 'Live ANC operating state — retainer meter, expenses, change orders. Auto-refreshed on Advisor page load.',
          chunkSource: 'anc-services/consultant',
          docAuthor: 'ANC Service Dashboard',
        },
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!upload.ok) {
      const t = await upload.text().catch(() => '')
      return NextResponse.json({ error: `upload failed: ${upload.status} ${t.slice(0, 200)}` }, { status: 502 })
    }
    const uploadJson = await upload.json() as { documents?: Array<{ location?: string; title?: string }> }
    const newLocation = uploadJson.documents?.[0]?.location
    if (!newLocation) {
      return NextResponse.json({ error: 'upload returned no location' }, { status: 502 })
    }

    // 2. List existing workspace docs to find old live-context entries
    const wsInfoRes = await fetch(`${UPSTREAM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}`, { headers, signal: AbortSignal.timeout(15_000) })
    const wsInfo = await wsInfoRes.json().catch(() => ({})) as { workspace?: Array<{ documents?: Array<{ docpath?: string; filename?: string; pinnedWorkspaces?: unknown[] }> }> }
    const oldDocs: string[] = []
    const docs = wsInfo.workspace?.[0]?.documents || []
    for (const doc of docs) {
      const name = doc.filename || doc.docpath || ''
      if (name.includes(PINNED_DOC_TITLE) || name.startsWith('custom-documents/anc-live-context')) {
        if (doc.docpath) oldDocs.push(doc.docpath)
      }
    }

    // 3. Move the new document into the workspace (embed it)
    await fetch(`${UPSTREAM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}/update-embeddings`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        adds: [newLocation],
        deletes: oldDocs,
      }),
      signal: AbortSignal.timeout(45_000),
    })

    // 4. Pin the new document so it always shows in the workspace context
    await fetch(`${UPSTREAM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}/update-pin`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ docPath: newLocation, pinStatus: true }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {})

    return NextResponse.json({
      ok: true,
      location: newLocation,
      replaced: oldDocs.length,
      bytes: markdown.length,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'sync failed' }, { status: 500 })
  }
}
