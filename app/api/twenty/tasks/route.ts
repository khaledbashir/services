export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { twentyClient, TwentyTask } from '@/lib/twenty-client'
import { query } from '@/lib/db'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

/**
 * GET /api/twenty/tasks — List tasks from Twenty CRM
 * Query params: ?status=TODO&assigneeId=...&taskVenueId=...
 *
 * POST /api/twenty/tasks — Create a task in Twenty CRM
 * Body: { title, body?, dueAt?, status?, taskType?, taskPriority?, taskVenueId?, taskCategory?, assigneeId? }
 */
export async function GET(request: NextRequest) {
  if (!twentyClient.isConfigured()) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const assigneeId = searchParams.get('assigneeId')
    const venueId = searchParams.get('taskVenueId')

    let filter: string | undefined
    if (status) filter = `status[eq]:"${status}"`
    else if (assigneeId) filter = `assigneeId[eq]:"${assigneeId}"`
    else if (venueId) filter = `taskVenueId[eq]:"${venueId}"`

    const tasks = await twentyClient.getTasks(filter)

    return NextResponse.json({
      data: tasks,
      totalCount: tasks.length,
    })
  } catch (err) {
    console.error('Twenty tasks fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch tasks' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { title, body: taskBody, dueAt, status, taskType, taskPriority, taskVenueId, taskCategory, assigneeId } = body

    if (!title) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 })
    }

    const taskData: Record<string, unknown> = { title }
    if (taskBody) taskData.body = taskBody
    if (dueAt) taskData.dueAt = dueAt
    if (status) taskData.status = status
    if (taskType) taskData.taskType = taskType
    if (taskPriority) taskData.taskPriority = taskPriority
    if (taskVenueId) taskData.taskVenueId = taskVenueId
    if (taskCategory) taskData.taskCategory = taskCategory
    if (assigneeId) taskData.assigneeId = assigneeId

    const res = await fetch(`${TWENTY_BASE}/rest/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TWENTY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(taskData),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Twenty API error: ${text}` }, { status: res.status })
    }

    const data = await res.json()
    const created = data?.data?.createTask || data?.data?.createTasks?.[0]

    // Log to activity_log
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('twenty_task_created', 'task', NULL, NULL, $1)`,
      [JSON.stringify({ title, taskType, taskPriority, twentyTaskId: created?.id })]
    )

    return NextResponse.json({ data: created })
  } catch (err) {
    console.error('Twenty task creation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create task' },
      { status: 500 }
    )
  }
}
