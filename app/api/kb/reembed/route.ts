import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getTextEmbedding } from '@/lib/embeddings'

// POST — generate embeddings for entries that are missing them
export async function POST() {
  try {
    const result = await query(
      `SELECT id, title, description, issue_type, suggested_fix FROM kb_entries WHERE embedding IS NULL`
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ ok: true, message: 'All entries already have embeddings', processed: 0 })
    }

    let processed = 0
    const errors: string[] = []

    for (const row of result.rows) {
      try {
        const text = `${row.title}. ${row.description || ''}. Issue: ${row.issue_type || 'unknown'}. Fix: ${row.suggested_fix || 'unknown'}`
        const embedding = await getTextEmbedding(text)
        const embeddingStr = '{' + embedding.join(',') + '}'
        await query(`UPDATE kb_entries SET embedding = $1::float8[] WHERE id = $2`, [embeddingStr, row.id])
        processed++
        console.log(`[kb-reembed] Embedded: ${row.title}`)
      } catch (err: any) {
        errors.push(`${row.title}: ${err.message}`)
        console.error(`[kb-reembed] Failed: ${row.title}`, err)
      }
    }

    return NextResponse.json({ ok: true, processed, errors, total: result.rows.length })
  } catch (err) {
    console.error('KB reembed error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
