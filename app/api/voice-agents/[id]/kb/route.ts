import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  getVoiceAgent,
  setAgentKbDocuments,
  setAgentWorkspaceSlug,
  type KbDocument,
} from '@/lib/voice/agents'
import {
  deleteDocuments,
  embedToWorkspace,
  ensureWorkspace,
  removeFromWorkspace,
  uploadFile as allmUploadFile,
  uploadUrl as allmUploadUrl,
} from '@/lib/voice/anythingllm'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const agent = await getVoiceAgent(params.id)
  if (!agent) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    workspaceSlug: agent.allmWorkspaceSlug,
    documents: agent.kbDocuments,
  })
}

/**
 * Multi-purpose POST. Accepts either:
 *   - multipart/form-data with a `file` field (or multiple)
 *   - JSON body { url: string } to ingest a URL
 *   - JSON body { urls: string[] } for bulk URL ingest
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const agent = await getVoiceAgent(params.id)
  if (!agent) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })

  const contentType = request.headers.get('content-type') || ''

  try {
    let workspaceSlug = agent.allmWorkspaceSlug
    if (!workspaceSlug) {
      workspaceSlug = await ensureWorkspace(agent.slug, agent.name)
      await setAgentWorkspaceSlug(agent.id, workspaceSlug)
    }

    const newDocs: KbDocument[] = []
    const locationsToEmbed: string[] = []

    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData()
      const files = form.getAll('file').filter((f): f is File => f instanceof File)
      if (files.length === 0) {
        return NextResponse.json({ ok: false, error: 'no_files' }, { status: 400 })
      }
      for (const file of files) {
        const ingested = await allmUploadFile(file)
        for (const doc of ingested) {
          if (!doc.location) continue
          locationsToEmbed.push(doc.location)
          newDocs.push({
            id: doc.id || doc.location,
            type: 'file',
            name: doc.title || file.name,
            source: doc.location,
            addedAt: new Date().toISOString(),
          })
        }
      }
    } else {
      const body = await request.json().catch(() => ({}))
      const urls: string[] = Array.isArray(body.urls)
        ? body.urls.filter((s: unknown): s is string => typeof s === 'string')
        : typeof body.url === 'string'
          ? [body.url]
          : []
      const cleaned = urls.map((u) => u.trim()).filter(Boolean)
      if (cleaned.length === 0) {
        return NextResponse.json({ ok: false, error: 'url_required' }, { status: 400 })
      }
      for (const url of cleaned) {
        const ingested = await allmUploadUrl(url)
        for (const doc of ingested) {
          if (!doc.location) continue
          locationsToEmbed.push(doc.location)
          newDocs.push({
            id: doc.id || doc.location,
            type: 'url',
            name: doc.title || url,
            source: doc.location,
            url,
            addedAt: new Date().toISOString(),
          })
        }
      }
    }

    if (locationsToEmbed.length > 0) {
      await embedToWorkspace(workspaceSlug, locationsToEmbed)
    }

    const merged = [...agent.kbDocuments, ...newDocs]
    await setAgentKbDocuments(agent.id, merged)

    return NextResponse.json({ ok: true, added: newDocs, documents: merged })
  } catch (error) {
    console.error('voice-agent kb POST error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'kb_upload_failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const agent = await getVoiceAgent(params.id)
  if (!agent) return NextResponse.json({ ok: false, error: 'agent_not_found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const docId = typeof body.id === 'string' ? body.id : ''
  if (!docId) return NextResponse.json({ ok: false, error: 'doc_id_required' }, { status: 400 })

  const target = agent.kbDocuments.find((d) => d.id === docId)
  if (!target) {
    return NextResponse.json({ ok: false, error: 'doc_not_found' }, { status: 404 })
  }

  try {
    if (agent.allmWorkspaceSlug) {
      await removeFromWorkspace(agent.allmWorkspaceSlug, [target.source])
    }
    await deleteDocuments([target.source])

    const remaining = agent.kbDocuments.filter((d) => d.id !== docId)
    await setAgentKbDocuments(agent.id, remaining)

    return NextResponse.json({ ok: true, documents: remaining })
  } catch (error) {
    console.error('voice-agent kb DELETE error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'kb_delete_failed' },
      { status: 500 }
    )
  }
}
