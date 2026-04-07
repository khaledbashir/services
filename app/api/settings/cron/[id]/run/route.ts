import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

function parseOpenClawJobs(stdout: string): any[] {
  try {
    const parsed = JSON.parse(stdout || '[]')
    if (Array.isArray(parsed)) return parsed
    if (parsed && Array.isArray(parsed.jobs)) return parsed.jobs
    return []
  } catch {
    return []
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { stdout } = await execAsync('openclaw cron list --json 2>/dev/null || echo "{\\"jobs\\":[]}"')
    const jobs = parseOpenClawJobs(stdout)
    const job = jobs.find((item: any) => item.name === params.id || item.id === params.id)

    if (!job) {
      return NextResponse.json({
        error: `OpenClaw cron job "${params.id}" was not found`,
        openclaw_job_count: jobs.length,
      }, { status: 404 })
    }

    await execAsync(`openclaw cron run ${job.id} 2>/dev/null`)

    return NextResponse.json({
      success: true,
      message: `Cron job ${job.name || params.id} triggered.`,
      job_id: job.id,
      ran_at: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Error running cron job:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
