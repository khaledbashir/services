import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  getProjectScheduleWorkbookMeta,
  replaceProjectScheduleWorkbook,
} from '@/lib/project-schedule'

export const dynamic = 'force-dynamic'

const MAX_BYTES = 15 * 1024 * 1024

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    const meta = await getProjectScheduleWorkbookMeta()
    return NextResponse.json({ workbook: meta })
  } catch (error) {
    console.error('[project-schedule/workbook] GET failed', error)
    return NextResponse.json({ error: 'Failed to read workbook status' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const form = await request.formData()
    const file = form.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Attach the schedule file as "file".' }, { status: 400 })
    }
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
      return NextResponse.json({ error: 'The schedule must be an .xlsx file.' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 15MB.' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const uploadedBy = auth.fullName || auth.email

    // A workbook that does not parse is rejected here, so a bad upload can never
    // replace a good schedule.
    const { meta, projectCount } = await replaceProjectScheduleWorkbook(buffer, file.name, uploadedBy)
    return NextResponse.json({ workbook: meta, projectCount })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to import workbook'
    console.error('[project-schedule/workbook] POST failed', error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
