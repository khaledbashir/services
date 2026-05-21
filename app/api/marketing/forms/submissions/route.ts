export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const formId = sp.get('formId')
    const search = (sp.get('search') || '').trim().toLowerCase()
    const params: any[] = []
    const where: string[] = []

    if (formId) {
      params.push(formId)
      where.push(`s.form_id = $${params.length}`)
    }
    if (search) {
      params.push(`%${search}%`)
      where.push(`(
        LOWER(COALESCE(s.email, '')) LIKE $${params.length}
        OR LOWER(COALESCE(s.first_name, '') || ' ' || COALESCE(s.last_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(s.company_name, '')) LIKE $${params.length}
        OR LOWER(COALESCE(s.form_title, '')) LIKE $${params.length}
      )`)
    }

    const result = await query(
      `SELECT s.*
       FROM marketing_form_submissions s
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY s.submitted_at DESC NULLS LAST, s.created_at DESC
       LIMIT 250`,
      params,
    )
    return NextResponse.json({ submissions: result.rows })
  } catch (err) {
    console.error('Error loading marketing form submissions:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
