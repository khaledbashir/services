import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET() {
  try {
    // Create table if not exists
    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)

    const result = await query(`SELECT value FROM app_settings WHERE key = 'bot_name'`)
    const botName = result.rows[0]?.value || 'ANC Bot'

    return NextResponse.json({ botName })
  } catch (err) {
    console.error('Error fetching bot name:', err)
    return NextResponse.json({ botName: 'ANC Bot' })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { botName } = await request.json()
    if (!botName || typeof botName !== 'string' || botName.trim().length === 0) {
      return NextResponse.json({ error: 'Bot name is required' }, { status: 400 })
    }

    await query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `)

    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('bot_name', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [botName.trim()]
    )

    return NextResponse.json({ botName: botName.trim() })
  } catch (err) {
    console.error('Error updating bot name:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
