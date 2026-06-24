import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  generateProjectScheduleFromTemplate,
  type ScheduleGeneratorInput,
} from '@/lib/project-schedule'

function cleanString(value: unknown) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\s+/g, ' ').trim()
}

// POST /api/project-schedule/[id]/tasks/generate
// Body: { projectName, startDate, displays: string[] }
// Generates the ANC LED-install template as real task rows (replaces existing tasks).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const projectName = cleanString(body.projectName)
    const startDate = cleanString(body.startDate)
    const displays = Array.isArray(body.displays)
      ? body.displays.map((d: unknown) => cleanString(d)).filter(Boolean)
      : []

    if (!startDate) {
      return NextResponse.json({ error: 'Missing startDate' }, { status: 400 })
    }

    const input: ScheduleGeneratorInput = {
      projectName: projectName || params.id,
      startDate,
      displays,
    }

    const data = await generateProjectScheduleFromTemplate(params.id, input, auth.email || auth.fullName)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error generating project schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
