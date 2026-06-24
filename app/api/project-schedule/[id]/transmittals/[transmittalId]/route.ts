import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  deleteProjectTransmittal,
  getProjectTransmittal,
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

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; transmittalId: string } },
) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const data = await getProjectTransmittal(params.transmittalId)
    if (!data || data.projectId !== params.id) {
      return NextResponse.json({ error: 'Transmittal not found' }, { status: 404 })
    }
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error reading project transmittal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; transmittalId: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const existing = await getProjectTransmittal(params.transmittalId)
    if (!existing || existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Transmittal not found' }, { status: 404 })
    }

    const body = await request.json()
    const input = buildInput(body)
    const data = await saveProjectTransmittal(params.id, input, params.transmittalId, auth.email || auth.fullName)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error updating project transmittal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; transmittalId: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const existing = await getProjectTransmittal(params.transmittalId)
    if (!existing || existing.projectId !== params.id) {
      return NextResponse.json({ error: 'Transmittal not found' }, { status: 404 })
    }

    await deleteProjectTransmittal(params.transmittalId)
    return NextResponse.json({ data: { deleted: true } })
  } catch (err) {
    console.error('Error deleting project transmittal:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
