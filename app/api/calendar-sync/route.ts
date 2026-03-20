import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// Verify JWT token from cookie
async function verifyToken(token: string): Promise<any | null> {
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const verified = await jwtVerify(token, secret)
    return verified.payload
  } catch (err) {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify JWT and check if user is admin
    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Check if user is admin (adjust role check based on your role structure)
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 })
    }

    // Execute the sync script
    try {
      const { stdout, stderr } = await execFileAsync('python3', [
        '/app/scripts/sync-calendar.py'
      ], {
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      })

      // Parse the JSON output from the script
      const lines = stdout.trim().split('\n')
      const jsonLine = lines[lines.length - 1]
      const result = JSON.parse(jsonLine)

      return NextResponse.json({
        success: true,
        ...result,
        executedAt: new Date().toISOString(),
      })
    } catch (execError: any) {
      console.error('Script execution error:', execError)
      return NextResponse.json(
        {
          error: 'Failed to execute sync script',
          details: execError.stderr || execError.message,
        },
        { status: 500 }
      )
    }
  } catch (err) {
    console.error('Calendar sync error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Optional: Add GET endpoint to check if a sync is in progress
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = await verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    // Return info about calendar sync (you could add status tracking here)
    return NextResponse.json({
      status: 'ready',
      lastSyncInfo: 'Use POST to trigger a sync',
    })
  } catch (err) {
    console.error('Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
