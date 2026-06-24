/**
 * Submittal register entries for a project.
 *
 * GET  → list the OCR-created "extra" submittals for the project.
 * POST → auto-create register rows from reviewed OCR detections (or any manual
 *        list). These persist as real SubmittalRegisterItem rows and merge into
 *        project.submittals everywhere — same board UI, same override PATCH path,
 *        same transmittal derivation.
 * DELETE ?submittalId= → remove an OCR-created submittal.
 */

import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  createExtraSubmittals,
  deleteExtraSubmittal,
  listExtraSubmittals,
  type ExtraSubmittalInput,
} from '@/lib/project-schedule'

function cleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  return String(value).replace(/\s+/g, ' ').trim()
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    const data = await listExtraSubmittals(params.id)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error listing extra submittals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const rawItems = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : null
    if (!rawItems || !rawItems.length) {
      return NextResponse.json({ error: 'No submittal items provided' }, { status: 400 })
    }

    const inputs: ExtraSubmittalInput[] = []
    for (const raw of rawItems) {
      const r = raw as Record<string, unknown>
      // Accept OCR detection shape (sheetNumber/title/revision/packageType) and
      // the register shape (submittalNo/title/...) interchangeably.
      const title = cleanString(r.title)
      if (!title) continue
      inputs.push({
        submittalNo: cleanString(r.submittalNo) ?? cleanString(r.sheetNumber),
        packageType: cleanString(r.packageType),
        title,
        revision: cleanString(r.revision),
        owner: cleanString(r.owner),
        dueDate: cleanString(r.dueDate),
        source: cleanString(r.source) ?? 'OCR auto-create',
      })
    }

    if (!inputs.length) {
      return NextResponse.json({ error: 'No valid submittal items (each needs a title)' }, { status: 400 })
    }

    const { created, data } = await createExtraSubmittals(params.id, inputs, auth.email || auth.fullName)
    return NextResponse.json({ created, data }, { status: 201 })
  } catch (err) {
    console.error('Error creating submittals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth
    const submittalId = new URL(request.url).searchParams.get('submittalId')
    if (!submittalId) {
      return NextResponse.json({ error: 'Missing submittalId' }, { status: 400 })
    }
    const ok = await deleteExtraSubmittal(params.id, submittalId)
    if (!ok) return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting submittal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
