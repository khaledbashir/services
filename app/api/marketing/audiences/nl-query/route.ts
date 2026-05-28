export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { naturalLanguageToSql } from '@/lib/signal/audience-nl'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const userQuery = String(body.query || '').trim()
  if (!userQuery) {
    return NextResponse.json({ error: 'query is required' }, { status: 400 })
  }

  let result
  try {
    result = await naturalLanguageToSql(userQuery)
  } catch (err) {
    return NextResponse.json({ error: 'NL translation failed', detail: String(err) }, { status: 500 })
  }

  if (result.rejected) {
    return NextResponse.json({
      sql: result.sql,
      rejected: result.rejected,
      rows: [],
      total: 0,
    })
  }

  // Execute the synthesized SELECT against the read-only-by-convention DB
  try {
    const rows = await dbQuery(result.sql)
    return NextResponse.json({
      sql: result.sql,
      rows: rows.rows,
      total: rows.rowCount,
    })
  } catch (err) {
    return NextResponse.json(
      { sql: result.sql, error: 'SQL execution failed', detail: String(err) },
      { status: 500 },
    )
  }
}
