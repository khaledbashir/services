import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  deriveTransmittalFromSubmittal,
  listProjectTransmittals,
  saveProjectTransmittal,
  type TransmittalInput,
  type TransmittalItem,
} from '@/lib/project-schedule'

function cleanString(value: unknown) {
  if (value === null || value === undefined) return undefined
  return String(value).trim()
}

function cleanItems(value: unknown): TransmittalItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.map((item, idx) => ({
    n: Number((item as { n?: unknown })?.n ?? idx + 1) || idx + 1,
    description: String((item as { description?: unknown })?.description ?? '').trim(),
  }))
}

function buildInput(body: Record<string, unknown>): TransmittalInput {
  return {
    submittalId: cleanString(body.submittalId) ?? null,
    to: cleanString(body.to),
    from: cleanString(body.from),
    date: cleanString(body.date),
    project: cleanString(body.project),
    submittalNo: cleanString(body.submittalNo),
    sendingItems: cleanString(body.sendingItems),
    transmittedAs: cleanString(body.transmittedAs),
    items: cleanItems(body.items),
    remarks: cleanString(body.remarks),
    remarksBy: cleanString(body.remarksBy),
    copiesTo: cleanString(body.copiesTo),
    signedBy: cleanString(body.signedBy),
  }
}

// GET /api/project-schedule/[id]/transmittals            -> list saved transmittals
// GET /api/project-schedule/[id]/transmittals?deriveFrom=<submittalId> -> derived draft (not saved)
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const deriveFrom = request.nextUrl.searchParams.get('deriveFrom')
    if (deriveFrom) {
      const draft = await deriveTransmittalFromSubmittal(params.id, deriveFrom)
      if (!draft) return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
      return NextResponse.json({ data: draft })
    }

    const data = await listProjectTransmittals(params.id)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error reading project transmittals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/project-schedule/[id]/transmittals -> create a saved transmittal
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const input = buildInput(body)
    const data = await saveProjectTransmittal(params.id, input, null, auth.email || auth.fullName)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error creating project transmittal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
