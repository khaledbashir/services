import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getTextEmbedding, getImageEmbedding, getMultimodalEmbedding } from '@/lib/embeddings'

// GET — list all KB entries
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueType = searchParams.get('issue_type')
    const venueId = searchParams.get('venue_id')

    let sql = `SELECT id, title, description, issue_type, venue_id, suggested_fix, image_url, created_at
               FROM kb_entries WHERE 1=1`
    const params: any[] = []

    if (issueType) {
      params.push(issueType)
      sql += ` AND issue_type = $${params.length}`
    }
    if (venueId) {
      params.push(venueId)
      sql += ` AND venue_id = $${params.length}`
    }

    sql += ` ORDER BY created_at DESC`

    const result = await query(sql, params)
    return NextResponse.json({ entries: result.rows, count: result.rows.length })
  } catch (err) {
    console.error('KB list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — create a new KB entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, description, issue_type, venue_id, suggested_fix, image } = body

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Generate embedding
    let embedding: number[]
    let imageUrl: string | null = null

    if (image?.data && description) {
      // Multimodal: image + text
      embedding = await getMultimodalEmbedding(
        `${title}. ${description}. Issue: ${issue_type || 'unknown'}. Fix: ${suggested_fix || 'unknown'}`,
        image.data,
        image.mimeType || 'image/jpeg'
      )
      imageUrl = image.data // Store base64
    } else if (image?.data) {
      // Image only
      embedding = await getImageEmbedding(image.data, image.mimeType || 'image/jpeg')
      imageUrl = image.data
    } else {
      // Text only
      embedding = await getTextEmbedding(
        `${title}. ${description || ''}. Issue: ${issue_type || 'unknown'}. Fix: ${suggested_fix || 'unknown'}`
      )
    }

    const result = await query(
      `INSERT INTO kb_entries (title, description, issue_type, venue_id, suggested_fix, image_url, embedding)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, title, issue_type, created_at`,
      [title, description, issue_type, venue_id || null, suggested_fix, imageUrl, embedding]
    )

    return NextResponse.json({ ok: true, entry: result.rows[0] })
  } catch (err) {
    console.error('KB create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a KB entry
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    await query(`DELETE FROM kb_entries WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('KB delete error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
