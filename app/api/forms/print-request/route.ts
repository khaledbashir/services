import { NextRequest, NextResponse } from 'next/server'
import { twentyCreate, requireFields, str } from '../_helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const check = requireFields(body, ['submittedBy', 'requesterEmail', 'clientName', 'dueDate'])
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const name = `${str(body.clientName)} — Print Request ${new Date().toISOString().slice(0, 10)}`

    const payload: Record<string, unknown> = {
      name,
      status: 'STATUS_NEW_JOB',
      submittedBy: str(body.submittedBy),
      sfNumber: str(body.sfNumber),
      billTo: str(body.clientName),
      shippingAddress: str(body.shippingAddress, 1000),
      reprint: Boolean(body.reprint),
      rushRequest: Boolean(body.rushRequest),
      baselines: Number(body.baselines) || 0,
      homePlate: Number(body.homePlate) || 0,
      smallHomePlate: Number(body.smallHomePlate) || 0,
      otherQty: Number(body.otherQty) || 0,
    }

    if (body.dueDate) payload.dueDate = body.dueDate
    if (body.requesterEmail) {
      payload.requesterEmail = { primaryEmail: str(body.requesterEmail) }
    }
    if (body.notes) {
      payload.notes = { blocknote: null, markdown: str(body.notes, 5000) }
    }

    const result = await twentyCreate<{ data: { createPrintRequest: any } }>(
      'printRequests',
      payload
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const created = result.data.data.createPrintRequest
    return NextResponse.json({ id: created.id, name: created.name })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
