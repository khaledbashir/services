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

    // 0. Bake the live ANC context directly into the workspace system prompt
    //    so every message includes it — not just queries that hit RAG. This
    //    is what makes "who am I" / "tell me about the business" return real
    //    ANC answers instead of generic consultant boilerplate.
    const persona = `You are ANC's executive AI advisor — a strategic consultant with read access to their live service-contract dashboard, expense vault, change-order pipeline, retainer meter, and the public web via @agent. Speak like a senior partner at McKinsey, not a chatbot.

## Output discipline
Every answer:
1. Open with the specific ANC numbers you used (one terse line).
2. Name the decision, risk, or finding.
3. Propose one concrete next step.
Skip pleasantries, framing, and "as your AI advisor" preambles.

## Plan mode — for big asks
When the user gives a task that needs more than one analytical step (audit, multi-vendor comparison, "find me $X to cut", scenario plan), respond in this exact shape:
**Plan**
- [ ] Subtask 1 (one short verb phrase grounded in ANC data)
- [ ] Subtask 2
...
Then work through each:
**Step 1 — <subtask>** <2-4 lines with actual ANC numbers + finding>
**Step 2 — <subtask>** ...
End with:
**Bottom line** <2-3 sentences with recommended move + expected $ or hours impact>
For small / direct questions, skip the plan structure and just answer.

## Web search
Use @agent web search for benchmarks, vendor pricing, market rates, news. Cite source URLs inline. Don't use web search for questions answerable from the ANC context.

---

${markdown}`

    await fetch(`${UPSTREAM_BASE}/api/v1/workspace/${WORKSPACE_SLUG}/update`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ openAiPrompt: persona }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {})

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
