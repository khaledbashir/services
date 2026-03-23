import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const API_KEY = process.env.JWT_SECRET || 'anc-services-secret-key-change-me'

async function slackAPI(method: string, body: any) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    if (key !== API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SLACK_BOT_TOKEN) {
      return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
    }

    const { action, title, content, canvas_id, channel_id } = await request.json()

    if (action === 'create') {
      // Create a new canvas
      if (!title) {
        return NextResponse.json({ error: 'title is required for create' }, { status: 400 })
      }

      const res = await slackAPI('canvases.create', {
        title,
        document_content: {
          type: 'markdown',
          markdown: content || '',
        },
      })

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to create canvas', detail: res.error }, { status: 500 })
      }

      // If channel_id provided, share the canvas to that channel
      if (channel_id && res.canvas_id) {
        await slackAPI('conversations.canvases.create', {
          channel_id,
          document_content: {
            type: 'markdown',
            markdown: content || '',
          },
          title,
        }).catch(() => {})
      }

      return NextResponse.json({ canvas_id: res.canvas_id, title })

    } else if (action === 'update') {
      // Update existing canvas
      if (!canvas_id) {
        return NextResponse.json({ error: 'canvas_id is required for update' }, { status: 400 })
      }

      const changes = []
      if (content) {
        changes.push({
          operation: 'replace',
          document_content: {
            type: 'markdown',
            markdown: content,
          },
        })
      }

      const res = await slackAPI('canvases.edit', {
        canvas_id,
        changes,
      })

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to update canvas', detail: res.error }, { status: 500 })
      }

      return NextResponse.json({ canvas_id, updated: true })

    } else if (action === 'read') {
      // Read canvas sections
      if (!canvas_id) {
        return NextResponse.json({ error: 'canvas_id is required for read' }, { status: 400 })
      }

      const res = await slackAPI('canvases.sections.lookup', {
        canvas_id,
        criteria: {},
      })

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to read canvas', detail: res.error }, { status: 500 })
      }

      return NextResponse.json({ canvas_id, sections: res.sections })

    } else if (action === 'channel_canvas') {
      // Create a canvas in a channel
      if (!channel_id || !title) {
        return NextResponse.json({ error: 'channel_id and title required' }, { status: 400 })
      }

      const res = await slackAPI('conversations.canvases.create', {
        channel_id,
        document_content: {
          type: 'markdown',
          markdown: content || '',
        },
        title,
      })

      if (!res.ok) {
        return NextResponse.json({ error: 'Failed to create channel canvas', detail: res.error }, { status: 500 })
      }

      return NextResponse.json({ canvas_id: res.canvas_id, channel_id, title })

    } else {
      return NextResponse.json({ error: 'action must be create, update, read, or channel_canvas' }, { status: 400 })
    }
  } catch (err) {
    console.error('Error with canvas:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
