import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// Map DB job IDs to OpenClaw cron job names
async function syncOpenClawCron(jobId: string, enabled: boolean) {
  try {
    // Get OpenClaw cron job list and find matching job
    const { stdout } = await execAsync('openclaw cron list --json 2>/dev/null || echo "[]"')
    const jobs = JSON.parse(stdout || '[]')
    const clawJob = Array.isArray(jobs) ? jobs.find((j: any) => j.name === jobId) : null

    if (clawJob) {
      if (enabled) {
        await execAsync(`openclaw cron enable ${clawJob.id} 2>/dev/null`)
      } else {
        await execAsync(`openclaw cron disable ${clawJob.id} 2>/dev/null`)
      }
    }
  } catch (e) {
    console.error('Failed to sync OpenClaw cron:', e)
  }
}

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, description, schedule, enabled FROM automation_jobs ORDER BY created_at`
    )
    return NextResponse.json({ jobs: result.rows, channel: '#external--ai-services' })
  } catch (err) {
    console.error('Error fetching automation jobs:', err)
    return NextResponse.json({ jobs: [], channel: '#external--ai-services' })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { id, enabled, name, description, schedule } = await request.json()

    if (id && typeof enabled === 'boolean') {
      // Toggle existing job in DB
      await query(`UPDATE automation_jobs SET enabled = $1 WHERE id = $2`, [enabled, id])
      // Also toggle in OpenClaw
      syncOpenClawCron(id, enabled)
    } else if (name && schedule) {
      const newId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      await query(
        `INSERT INTO automation_jobs (id, name, description, schedule, enabled) VALUES ($1, $2, $3, $4, true) ON CONFLICT (id) DO NOTHING`,
        [newId, name, description || '', schedule]
      )
    }

    const result = await query(
      `SELECT id, name, description, schedule, enabled FROM automation_jobs ORDER BY created_at`
    )
    return NextResponse.json({ jobs: result.rows, channel: '#external--ai-services' })
  } catch (err) {
    console.error('Error updating automation job:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { id } = await request.json()
    await query(`DELETE FROM automation_jobs WHERE id = $1`, [id])

    const result = await query(
      `SELECT id, name, description, schedule, enabled FROM automation_jobs ORDER BY created_at`
    )
    return NextResponse.json({ jobs: result.rows, channel: '#external--ai-services' })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
