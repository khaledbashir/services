import { NextRequest, NextResponse } from 'next/server'
import { notifyMarketingFormSubmission } from '@/lib/marketing-form-notifications'
import { requireFields, str } from '../_helpers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const check = requireFields(body, ['name', 'email', 'message'])
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

    const inquiryType = str(body.inquiryType, 80) || 'general'
    const companyName = str(body.companyName || body.company, 200) || null
    const sourceUrl = str(body.pageUrl || body.sourceUrl, 1000) || `${APP_URL}/forms/contact`

    const result = await notifyMarketingFormSubmission({
      formId: 'hubspot-contact-form-2026',
      formTitle: 'Contact Form 2026',
      inquiryType,
      submitterName: str(body.name, 200) || null,
      submitterEmail: str(body.email, 320) || null,
      companyName,
      subject: `[ANC Forms] New contact inquiry: ${companyName || str(body.name, 120)}`,
      sourceUrl,
      summaryFields: {
        inquiryType,
        companyName,
        phone: str(body.phone, 80),
        message: str(body.message, 5000),
        pageUrl: sourceUrl,
      },
      rawSubmission: {
        sourceId: str(body.sourceId, 200) || undefined,
        submissionId: str(body.submissionId, 200) || undefined,
        pageUrl: sourceUrl,
        ...body,
      },
    })

    return NextResponse.json({
      ok: true,
      routed: result.routeFound,
      submissionId: result.submissionId,
      marketingContactId: result.marketingContactId,
      crmPersonId: result.crmPersonId,
      crmNoteId: result.crmNoteId,
      timelineStatus: result.timelineStatus,
    })
  } catch (err: any) {
    console.error('Contact form submission failed:', err)
    return NextResponse.json({ error: err?.message || 'Unexpected server error' }, { status: 500 })
  }
}
