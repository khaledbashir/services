import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { query } from '@/lib/db'

const execFileAsync = promisify(execFile)

async function verifyToken(token: string): Promise<any | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload
  } catch { return null }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

    // Return last sync result from app_settings
    const result = await query(`SELECT value FROM app_settings WHERE key = 'last_calendar_sync'`)
    const lastSync = result.rows[0] ? JSON.parse(result.rows[0].value) : null

    return NextResponse.json({ status: 'ready', lastSync })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const payload = await verifyToken(token)
    if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    if (payload.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    try {
      const { stdout, stderr } = await execFileAsync('python3', [
        '/app/scripts/sync-calendar.py'
      ], { timeout: 300000, maxBuffer: 10 * 1024 * 1024 })

      const lines = stdout.trim().split('\n')
      const jsonLine = lines[lines.length - 1]
      const result = JSON.parse(jsonLine)

      // Persist last sync result
      await query(
        `INSERT INTO app_settings (key, value) VALUES ('last_calendar_sync', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify({ ...result, executedAt: new Date().toISOString(), stderr: stderr || null })]
      )

      return NextResponse.json({ success: true, ...result, executedAt: new Date().toISOString() })
    } catch (execError: any) {
      const errPayload = {
        status: 'error',
        error: execError.stderr || execError.message,
        executedAt: new Date().toISOString(),
      }
      // Persist error too so UI can show it
      await query(
        `INSERT INTO app_settings (key, value) VALUES ('last_calendar_sync', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
        [JSON.stringify(errPayload)]
      ).catch(() => {})

      return NextResponse.json({ error: 'Sync script failed', details: execError.stderr || execError.message }, { status: 500 })
    }
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
