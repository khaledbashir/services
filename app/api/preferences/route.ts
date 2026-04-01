import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const result = await requireAuth(request)
  if (isAuthError(result)) return result
  const user = result

  const key = request.nextUrl.searchParams.get('key')
  if (key) {
    const res = await query('SELECT value FROM user_preferences WHERE user_id = $1 AND key = $2', [user.userId, key])
    return NextResponse.json({ value: res.rows[0]?.value ?? null })
  }

  const res = await query('SELECT key, value FROM user_preferences WHERE user_id = $1', [user.userId])
  const prefs: Record<string, string> = {}
  for (const row of res.rows) prefs[row.key] = row.value
  return NextResponse.json(prefs)
}

export async function PUT(request: NextRequest) {
  const result = await requireAuth(request)
  if (isAuthError(result)) return result
  const user = result

  const { key, value } = await request.json()
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 })
  }

  await query(
    `INSERT INTO user_preferences (user_id, key, value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
    [user.userId, key, String(value)]
  )

  return NextResponse.json({ ok: true })
}
