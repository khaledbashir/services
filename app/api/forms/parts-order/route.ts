import { NextRequest, NextResponse } from 'next/server'
import { twentyCreate, requireFields, str } from '../_helpers'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const check = requireFields(body, [
      'requestorName',
      'requestorEmail',
      'venueName',
      'partsNeeded',
      'shippingAddress',
      'urgency',
    ])
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const name = `${str(body.venueName)} — Parts Order`

    const payload: Record<string, unknown> = {
      name,
      status: 'STATUS_REQUEST_SUBMITTED',
      requestorName: str(body.requestorName),
      requestorEmail: str(body.requestorEmail),
      partsNeeded: str(body.partsNeeded, 5000),
      shippingAddress: str(body.shippingAddress, 1000),
      quantity: Number(body.quantity) || 1,
    }

    // Append urgency + additional notes to partsNeeded if provided
    const urgency = str(body.urgency)
    const extraNotes = str(body.notes, 2000)
    if (urgency || extraNotes) {
      const suffix = [
        urgency ? `\n\nUrgency: ${urgency}` : '',
        extraNotes ? `\nNotes: ${extraNotes}` : '',
      ].join('')
      payload.partsNeeded = `${payload.partsNeeded}${suffix}`.slice(0, 5000)
    }

    const result = await twentyCreate<{ data: { createPartsOrder: any } }>(
      'partsOrders',
      payload
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const created = result.data.data.createPartsOrder
    return NextResponse.json({ id: created.id, name: created.name })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
