import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { jwtVerify } from 'jose'

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

    const { body, is_internal } = await request.json()
    if (!body || !body.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, body, is_internal, created_at`,
      [params.id, user.userId, body, is_internal || false]
    )

    // Track first response for SLA (external comments only)
    if (!is_internal) {
      await query(
        `UPDATE tickets SET first_response_at = NOW(), sla_response_met = (NOW() <= sla_response_due)
         WHERE id = $1 AND first_response_at IS NULL`,
        [params.id]
      )

      // Email distribution list for client-visible comments
      const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
      if (RESEND_API_KEY) {
        const ticketRes = await query(`SELECT t.title, t.ticket_number, t.venue_id, v.name as venue_name, v.distribution_emails FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`, [params.id])
        const t = ticketRes.rows[0]
        if (t?.distribution_emails && t.distribution_emails.length > 0) {
          const caseNum = String(t.ticket_number).padStart(8, '0')
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${RESEND_API_KEY}` },
            body: JSON.stringify({
              from: 'ANC Services <notifications@ancservices.app>',
              to: t.distribution_emails,
              subject: `Case ${caseNum} Comment — ${t.title}`,
              html: `<div style="font-family:sans-serif;max-width:600px"><div style="background:#002C73;color:white;padding:20px 24px;border-radius:8px 8px 0 0"><h2 style="margin:0;font-size:16px">Case ${caseNum} — ${t.title}</h2><p style="margin:4px 0 0;opacity:0.7;font-size:13px">${t.venue_name}</p></div><div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px"><p style="margin:0 0 12px;font-size:14px;color:#334155"><strong>New Comment:</strong></p><p style="margin:0 0 12px;font-size:14px;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px">${body}</p><hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0"><p style="margin:0;font-size:12px;color:#94a3b8">This is an automated notification from ANC Sports Operations.</p></div></div>`,
            }),
          }).catch(() => {})
        }
      }
    }

    return NextResponse.json({ comment: result.rows[0] })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
