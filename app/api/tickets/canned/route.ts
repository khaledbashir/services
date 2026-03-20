import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(
      `SELECT id, title, body, category FROM canned_responses WHERE is_active = true ORDER BY title`
    )
    return NextResponse.json({ responses: result.rows })
  } catch (err) {
    console.error('Error fetching canned responses:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
