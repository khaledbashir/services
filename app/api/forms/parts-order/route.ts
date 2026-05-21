import { NextRequest, NextResponse } from 'next/server'
import { twentyCreate, requireFields, str } from '../_helpers'
import { notifyOps } from '@/lib/slack'
import { sendEmail } from '@/lib/email'
import { notifyMarketingFormSubmission } from '@/lib/marketing-form-notifications'

const SLACK_PARTS_CHANNEL = process.env.SLACK_PARTS_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || '#ops-parts'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://abc-anc-services.izcgmb.easypanel.host'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const check = requireFields(body, [
      'requestorName',
      'requestorEmail',
      'venueName',
      'partsNeeded',
      'shippingAddress',
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

    // Async slack and email notifications
    const dashboardLink = { label: 'View Order', url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/parts-orders/${created.id}` }
    notifyOps(
      ':package:',
      `New Parts Order: *${created.name}*\nRequestor: ${payload.requestorName} (${payload.requestorEmail})\nUrgency: ${urgency || 'Normal'}\nParts: ${payload.partsNeeded}`,
      dashboardLink,
      SLACK_PARTS_CHANNEL
    )

    if (payload.requestorEmail && typeof payload.requestorEmail === 'string') {
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:20px auto;border:1px solid #e2e8f0;border-radius:8px;padding:24px;">
          <h2 style="color:#002C73;margin-top:0;">Parts Order Received</h2>
          <p>Hi ${payload.requestorName},</p>
          <p>Your parts order for <strong>${body.venueName}</strong> has been submitted successfully.</p>
          <div style="background:#f8fafc;padding:16px;border-radius:4px;margin:20px 0;">
            <p style="margin:0 0 8px;"><strong>Parts needed:</strong><br/>${String(payload.partsNeeded).replace(/\n/g, '<br/>')}</p>
            <p style="margin:0 0 8px;"><strong>Shipping to:</strong><br/>${payload.shippingAddress}</p>
          </div>
          <p style="margin-bottom:0;">Gianni has been notified and will process this shortly.</p>
        </div>
      `
      sendEmail(
        [payload.requestorEmail as string],
        `[ANC Parts] Order Confirmation: ${body.venueName}`,
        html
      ).catch(console.error)
    }

    await notifyMarketingFormSubmission({
      formId: 'parts-order',
      formTitle: 'ANC Parts Order',
      inquiryType: 'parts',
      submitterName: str(body.requestorName) || null,
      submitterEmail: str(body.requestorEmail) || null,
      companyName: str(body.venueName) || null,
      subject: `[ANC Forms] New parts order: ${created.name}`,
      crmTargetUrl: `${APP_URL}/parts-orders/${created.id}`,
      sourceUrl: `${APP_URL}/forms/parts-order`,
      summaryFields: {
        venueName: str(body.venueName),
        urgency: urgency || 'Normal',
        quantity: Number(body.quantity) || 1,
        shippingAddress: str(body.shippingAddress, 1000),
        partsNeeded: str(body.partsNeeded, 1000),
      },
      rawSubmission: { ...body, crmRecordId: created.id, crmObject: 'partsOrders' },
    }).catch((err) => console.error('Parts order form notification failed:', err))

    return NextResponse.json({ id: created.id, name: created.name })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
