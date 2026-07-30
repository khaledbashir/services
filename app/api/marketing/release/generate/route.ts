export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { query } from '@/lib/db'
import { extractUploadText } from '@/lib/marketing/docx-text'
import { generateReleaseKit } from '@/lib/marketing/release-kit'
import { recordReleaseRun } from '@/lib/marketing/release-runs'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Real audience names, so the model suggests a list that actually exists. */
async function audienceContext(): Promise<string> {
  try {
    const res = await query(`
      SELECT a.name, COUNT(m.contact_id) FILTER (WHERE m.status = 'active')::int AS members
        FROM marketing_audiences a
        LEFT JOIN marketing_audience_members m ON m.audience_id = a.id
       WHERE a.is_active = true
       GROUP BY a.id, a.name
       ORDER BY members DESC
       LIMIT 12`)
    if (!res.rows.length) return ''
    const lines = res.rows.map((r: { name: string; members: number }) =>
      `- ${r.name} (${r.members.toLocaleString()} contacts)`).join('\n')
    return `These mailing lists already exist. "suggestedAudience" must be one of them, copied exactly:\n${lines}\n`
  } catch {
    return ''
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let sourceText = ''
  let sourceName: string | null = null

  try {
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file')
      sourceText = String(form.get('text') || '').trim()
      if (file && typeof file !== 'string') {
        if (file.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json({ error: 'That file is over 8 MB — paste the text instead.' }, { status: 413 })
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        sourceText = extractUploadText(file.name, buffer)
        sourceName = file.name
      }
    } else {
      const body = await request.json().catch(() => ({}))
      sourceText = String(body.text || '').trim()
      sourceName = body.sourceName ? String(body.sourceName) : null
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not read that document' },
      { status: 400 },
    )
  }

  if (!sourceText || sourceText.trim().length < 80) {
    return NextResponse.json(
      { error: 'Add a bit more — paste the notes or the release, or upload the document.' },
      { status: 400 },
    )
  }

  try {
    const { kit, provider, model } = await generateReleaseKit(sourceText, await audienceContext())
    const id = await recordReleaseRun({
      kit, sourceText, sourceName, provider, model, createdBy: auth.fullName || auth.email,
    })
    return NextResponse.json({ id, kit, provider, model })
  } catch (err) {
    console.error('release-kit generate failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 502 },
    )
  }
}
