import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getTextEmbedding, getImageEmbedding, getMultimodalEmbedding } from '@/lib/embeddings'

// POST — search KB by text, image, or both
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, image, limit = 5 } = body

    if (!text && !image?.data) {
      return NextResponse.json({ error: 'Provide text or image to search' }, { status: 400 })
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

    // Search by cosine similarity
    const result = await query(
      `SELECT id, title, description, issue_type, venue_id, suggested_fix, image_url, created_at,
              cosine_similarity(embedding, $1) as similarity
       FROM kb_entries
       WHERE embedding IS NOT NULL
       ORDER BY cosine_similarity(embedding, $1) DESC
       LIMIT $2`,
      [queryEmbedding, limit]
    )

    // Filter out low-quality matches
    const matches = result.rows
      .filter((r: any) => r.similarity > 0.3)
      .map((r: any) => ({
        ...r,
        similarity: Math.round(r.similarity * 1000) / 10, // e.g. 89.2%
        image_url: r.image_url ? '[has image]' : null, // Don't send full base64 in search results
      }))

    return NextResponse.json({ matches, query_type: image?.data ? (text ? 'multimodal' : 'image') : 'text' })
  } catch (err) {
    console.error('KB search error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
