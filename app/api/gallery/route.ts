import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getImageEmbedding, getMultimodalEmbedding, getTextEmbedding } from '@/lib/embeddings'

// GET — browse all images (KB + tickets)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const issueType = searchParams.get('issue_type')
    const venue = searchParams.get('venue')
    const limit = parseInt(searchParams.get('limit') || '50')

    // Get KB entries with images
    const kbResult = await query(
      `SELECT k.id, k.title, k.description, k.issue_type, k.suggested_fix, k.image_url,
              k.created_at, 'kb' as source, NULL as venue_name, NULL as ticket_number
       FROM kb_entries k
       WHERE k.image_url IS NOT NULL
       ORDER BY k.created_at DESC
       LIMIT $1`,
      [limit]
    )

    // Get tickets with images
    const ticketResult = await query(
      `SELECT t.id, t.title, t.description, t.category as issue_type, t.resolution_notes as suggested_fix,
              t.image_url, t.created_at, 'ticket' as source, v.name as venue_name, t.ticket_number
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       WHERE t.image_url IS NOT NULL
       ORDER BY t.created_at DESC
       LIMIT $1`,
      [limit]
    )

    let items = [...kbResult.rows, ...ticketResult.rows]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Filter
    if (issueType) {
      items = items.filter(i => (i.issue_type || '').toLowerCase().includes(issueType.toLowerCase()))
    }
    if (venue) {
      items = items.filter(i => (i.venue_name || '').toLowerCase().includes(venue.toLowerCase()))
    }

    return NextResponse.json({ items: items.slice(0, limit), total: items.length })
  } catch (err: any) {
    console.error('Gallery error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST — visual search by image and/or text
export async function POST(request: NextRequest) {
  try {
    const { image, text, limit = 10 } = await request.json()

    if (!image?.data && !text) {
      return NextResponse.json({ error: 'Provide image or text' }, { status: 400 })
    }

    // Generate query embedding
    let queryEmbedding: number[]
    if (image?.data && text) {
      queryEmbedding = await getMultimodalEmbedding(text, image.data, image.mimeType || 'image/jpeg')
    } else if (image?.data) {
      queryEmbedding = await getImageEmbedding(image.data, image.mimeType || 'image/jpeg')
    } else {
      queryEmbedding = await getTextEmbedding(text)
    }

    const embeddingStr = '{' + queryEmbedding.join(',') + '}'

    // Search KB entries with embeddings
    const kbResult = await query(
      `SELECT k.id, k.title, k.description, k.issue_type, k.suggested_fix, k.image_url,
              k.created_at, 'kb' as source, NULL as venue_name, NULL as ticket_number,
              cosine_similarity(k.embedding, $1::float8[]) as similarity
       FROM kb_entries k
       WHERE k.embedding IS NOT NULL
       ORDER BY cosine_similarity(k.embedding, $1::float8[]) DESC
       LIMIT $2`,
      [embeddingStr, limit]
    )

    // Combine and filter
    const matches = kbResult.rows
      .filter((r: any) => r.similarity > 0.25)
      .map((r: any) => ({
        ...r,
        similarity: Math.round(r.similarity * 1000) / 10,
      }))

    return NextResponse.json({
      matches,
      query_type: image?.data ? (text ? 'multimodal' : 'image') : 'text',
    })
  } catch (err: any) {
    console.error('Gallery search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
