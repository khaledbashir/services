export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(
      `SELECT *
       FROM marketing_form_routing_rules
       ORDER BY is_active DESC, form_title ASC, inquiry_type ASC NULLS LAST`,
    )
    return NextResponse.json({ routes: result.rows })
  } catch (err) {
    console.error('Error loading form routing rules:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const formId = String(body.formId || '').trim()
    const formTitle = String(body.formTitle || '').trim()
    const routeToName = String(body.routeToName || '').trim()
    const routeToEmail = String(body.routeToEmail || '').trim().toLowerCase()
    if (!formId || !formTitle || !routeToName || !routeToEmail) {
      return NextResponse.json({ error: 'Form, owner, and email are required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO marketing_form_routing_rules
        (form_id, form_title, inquiry_type, route_to_name, route_to_email, slack_channel, crm_target, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING *`,
      [
        formId,
        formTitle,
        body.inquiryType || null,
        routeToName,
        routeToEmail,
        body.slackChannel || null,
        body.crmTarget || null,
      ],
    )
    return NextResponse.json({ route: result.rows[0] })
  } catch (err) {
    console.error('Error saving form routing rule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
