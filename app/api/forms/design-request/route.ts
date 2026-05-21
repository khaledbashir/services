import { NextRequest, NextResponse } from 'next/server'
import { twentyCreate, requireFields, str } from '../_helpers'
import { notifyMarketingFormSubmission } from '@/lib/marketing-form-notifications'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://abc-anc-services.izcgmb.easypanel.host'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const check = requireFields(body, [
      'requesterName',
      'requesterEmail',
      'clientName',
      'dueDate',
      'description',
    ])
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const deliverable = str(body.deliverableType) || 'Design Request'
    const name = `${str(body.clientName)} — ${deliverable}`

    const descMarkdown = [
      `**Requester:** ${str(body.requesterName)} (${str(body.requesterEmail)})`,
      body.sport ? `**Sport / League:** ${str(body.sport)}` : '',
      body.venueName ? `**Venue:** ${str(body.venueName)}` : '',
      body.rushRequest ? `**🚨 RUSH REQUEST**` : '',
      body.boardSection ? `\n## Boards / Sections\n${str(body.boardSection, 3000)}` : '',
      '',
      `## Description`,
      str(body.description, 5000) || '',
      body.referenceNotes ? `\n## Reference\n${str(body.referenceNotes, 2000)}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const payload: Record<string, unknown> = {
      name,
      status: 'STATUS_REQUEST_SUBMITTED',
      clientTriCode: str(body.clientTriCode, 50),
      notes: { blocknote: null, markdown: descMarkdown },
    }

    if (body.dueDate) payload.dueDate = body.dueDate
    if (body.boardSection) payload.boardSection = str(body.boardSection, 3000)

    const result = await twentyCreate<{ data: { createDesignRequest: any } }>(
      'designRequests',
      payload
    )
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    const created = result.data.data.createDesignRequest
    await notifyMarketingFormSubmission({
      formId: 'design-request',
      formTitle: 'ANC Design Request',
      inquiryType: 'design',
      submitterName: str(body.requesterName) || null,
      submitterEmail: str(body.requesterEmail) || null,
      companyName: str(body.clientName) || null,
      subject: `[ANC Forms] New design request: ${created.name}`,
      crmTargetUrl: `${APP_URL}/designs/${created.id}`,
      sourceUrl: `${APP_URL}/forms/design-request`,
      summaryFields: {
        clientName: str(body.clientName),
        dueDate: str(body.dueDate),
        deliverableType: deliverable,
        venueName: str(body.venueName),
        rushRequest: Boolean(body.rushRequest),
        sport: str(body.sport),
      },
      rawSubmission: { ...body, crmRecordId: created.id, crmObject: 'designRequests' },
    }).catch((err) => console.error('Design request form notification failed:', err))

    return NextResponse.json({ id: created.id, name: created.name })
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Unexpected server error' },
      { status: 500 }
    )
  }
}
