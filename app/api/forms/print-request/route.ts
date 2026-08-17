import { NextRequest, NextResponse } from 'next/server'
import { twentyCreate, requireFields, str } from '../_helpers'
import { notifyMarketingFormSubmission } from '@/lib/marketing-form-notifications'
import { DASHBOARD_URL } from '@/lib/app-url'

const APP_URL = DASHBOARD_URL

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
    await notifyMarketingFormSubmission({
      formId: 'print-request',
      formTitle: 'ANC Print Request',
      inquiryType: 'print',
      submitterName: str(body.submittedBy) || null,
      submitterEmail: str(body.requesterEmail) || null,
      companyName: str(body.clientName) || null,
      subject: `[ANC Forms] New print request: ${created.name}`,
      crmTargetUrl: `${APP_URL}/prints/${created.id}`,
      sourceUrl: `${APP_URL}/forms/print-request`,
      summaryFields: {
        clientName: str(body.clientName),
        dueDate: str(body.dueDate),
        sfNumber: str(body.sfNumber),
        rushRequest: Boolean(body.rushRequest),
        reprint: Boolean(body.reprint),
        shippingAddress: str(body.shippingAddress, 1000),
      },
      rawSubmission: { ...body, crmRecordId: created.id, crmObject: 'printRequests' },
    }).catch((err) => console.error('Print request form notification failed:', err))

    return NextResponse.json({ id: created.id, name: created.name })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
