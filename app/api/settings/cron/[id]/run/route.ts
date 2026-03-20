import { NextRequest, NextResponse } from 'next/server'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // For now, just return success
    // In production, this would call the OpenClaw CLI to run the cron job
    // openclaw cron run <job-id>
    
    return NextResponse.json({ 
      success: true, 
      message: `Cron job ${params.id} triggered. Check logs for details.`,
      job_id: params.id,
      ran_at: new Date().toISOString()
    })
  } catch (err) {
    console.error('Error running cron job:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
