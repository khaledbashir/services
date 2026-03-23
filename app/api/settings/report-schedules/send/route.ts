import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
    if (!RESEND_API_KEY) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    // Get due schedules
    const now = new Date()
    const result = await query(
      `SELECT * FROM report_schedules WHERE enabled = true`
    )

    const schedules = result.rows
    const sent: string[] = []

    for (const schedule of schedules) {
      // Check if it's time to send
      const lastSent = schedule.last_sent_at ? new Date(schedule.last_sent_at) : null
      const daysSinceLastSent = lastSent ? (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24) : Infinity

      const shouldSend =
        (schedule.frequency === 'weekly' && daysSinceLastSent >= 6.5) ||
        (schedule.frequency === 'monthly' && daysSinceLastSent >= 28)

      if (!shouldSend) continue

      // Determine period
      const period = schedule.frequency === 'monthly' ? 'month' : 'week'

      // For each venue (or all if empty), generate report PDF and send
      const venueIds = schedule.venue_ids && schedule.venue_ids.length > 0
        ? schedule.venue_ids
        : [null] // null means all venues

      for (const venueId of venueIds) {
        try {
          // Build report URL
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || 'http://localhost:3000'
          const params = new URLSearchParams({ period })
          if (venueId) params.set('venue_id', venueId)

          const pdfRes = await fetch(`${baseUrl}/api/reports/pdf?${params}`)
          if (!pdfRes.ok) continue

          const pdfBuffer = await pdfRes.arrayBuffer()

          // Get venue name for subject
          let venueName = 'All Venues'
          if (venueId) {
            const vResult = await query(`SELECT name FROM venues WHERE id = $1`, [venueId])
            if (vResult.rows.length > 0) venueName = vResult.rows[0].name
          }

          const filename = `ANC_Report_${venueName.replace(/[^a-zA-Z0-9]/g, '_')}_${period}_${now.toISOString().split('T')[0]}.pdf`

          // Send to all recipients
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'ANC Services <notifications@ancservices.app>',
              to: schedule.recipients,
              subject: `${schedule.frequency === 'monthly' ? 'Monthly' : 'Weekly'} Operations Report — ${venueName}`,
              html: `<p>Hi,</p><p>Attached is the ${schedule.frequency} operations report for <strong>${venueName}</strong>.</p><p>Best regards,<br/>ANC Sports Operations</p>`,
              attachments: [{
                filename,
                content: Buffer.from(pdfBuffer).toString('base64'),
              }],
            }),
          })
        } catch (err) {
          console.error(`Failed to send report for venue ${venueId}:`, err)
        }
      }

      // Update last_sent_at
      await query(`UPDATE report_schedules SET last_sent_at = NOW() WHERE id = $1`, [schedule.id])
      sent.push(schedule.name)
    }

    return NextResponse.json({ sent, count: sent.length })
  } catch (err) {
    console.error('Error sending scheduled reports:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
