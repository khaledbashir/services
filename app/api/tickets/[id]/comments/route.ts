import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { postTicketComment } from '@/lib/ticket-comment'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // One-click status actions (Chris D): `close_ticket` (7/14) posts the note
    // AND closes; `set_status: 'in_progress'` (7/15) posts and moves New/On
    // Hold forward. One Slack notification either way. All side-effects live
    // in lib/ticket-comment.ts, shared with the Slack Reply modal.
    const { body, is_internal, close_ticket, set_status, attachments } = await request.json()
    const files = Array.isArray(attachments) ? attachments : []
    // A note carrying files needs no text — a screenshot on its own is a
    // legitimate post (Chris D 7/29).
    if ((!body || !body.trim()) && files.length === 0) {
      return NextResponse.json({ error: 'Add a note or attach a file' }, { status: 400 })
    }
    const statusAction = (close_ticket === true || set_status === 'closed')
      ? 'close' as const
      : set_status === 'in_progress' ? 'in_progress' as const : undefined

    const posted = await postTicketComment({
      ticketId: params.id,
      body: (body || '').trim(),
      isInternal: is_internal || false,
      actor: { userId: user.userId, fullName: user.fullName },
      statusAction,
      via: 'dashboard',
      attachments: files,
    })

    return NextResponse.json({
      comment: posted.comment,
      email: posted.email,
      closed: posted.closed,
      moved_in_progress: posted.movedInProgress,
      attachments: posted.attachments,
    })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
