export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get('type')
    const params: any[] = []
    const where = ['is_active = true']
    if (type) {
      params.push(type)
      where.push(`template_type = $${params.length}`)
    }

    const result = await query(
      `SELECT *
       FROM marketing_templates
       WHERE ${where.join(' AND ')}
       ORDER BY template_type, category NULLS LAST, name`,
      params,
    )
    return NextResponse.json({ templates: result.rows })
  } catch (err) {
    console.error('Error loading marketing templates:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const templateType = String(body.templateType || '').trim().toLowerCase()
    const name = String(body.name || '').trim()
    if (!['newsletter', 'social'].includes(templateType)) {
      return NextResponse.json({ error: 'Template type must be newsletter or social' }, { status: 400 })
    }
    if (!name) return NextResponse.json({ error: 'Template name is required' }, { status: 400 })

    const visualContent = body.visualContent != null ? JSON.stringify(body.visualContent) : null
    const result = await query(
      `INSERT INTO marketing_templates
        (template_type, name, category, subject, preview_text, body_html, content, platform, metadata, visual_content)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb)
       ON CONFLICT (template_type, name) DO UPDATE
         SET category = EXCLUDED.category,
             subject = EXCLUDED.subject,
             preview_text = EXCLUDED.preview_text,
             body_html = EXCLUDED.body_html,
             content = EXCLUDED.content,
             platform = EXCLUDED.platform,
             metadata = marketing_templates.metadata || EXCLUDED.metadata,
             visual_content = COALESCE(EXCLUDED.visual_content, marketing_templates.visual_content),
             is_active = true,
             updated_at = NOW()
       RETURNING *`,
      [
        templateType,
        name,
        body.category || null,
        body.subject || null,
        body.previewText || null,
        body.bodyHtml || null,
        body.content || null,
        body.platform || null,
        JSON.stringify(body.metadata || { source: 'manual' }),
        visualContent,
      ],
    )
    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error saving marketing template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
