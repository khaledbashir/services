import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const venueResult = await query(
      `SELECT v.id, v.name, m.name as market, v.primary_contact_name
       FROM venues v LEFT JOIN markets m ON v.market_id = m.id
       WHERE v.portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) return NextResponse.json({ error: 'Invalid' }, { status: 404 })

    const venue = venueResult.rows[0]
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
    const startStr = monthStart.toISOString().split('T')[0]
    const endStr = monthEnd.toISOString().split('T')[0]
    const monthName = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

    const [eventsR, workflowR, ticketsR, staffR] = await Promise.all([
      query(`SELECT COUNT(*) as total, COUNT(CASE WHEN ea.event_id IS NOT NULL THEN 1 END) as covered
             FROM events e LEFT JOIN (SELECT DISTINCT event_id FROM event_assignments) ea ON e.id = ea.event_id
             WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $3`, [venue.id, startStr, endStr]),
      query(`SELECT COUNT(*) as total, COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed
             FROM events WHERE venue_id = $1 AND event_date >= $2 AND event_date <= $3
             AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)`, [venue.id, startStr, endStr]),
      query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status IN ('resolved','closed') THEN 1 END) as resolved,
                    COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical
             FROM tickets WHERE venue_id = $1 AND created_at >= $2 AND created_at <= $3::date + 1`, [venue.id, startStr, endStr]),
      query(`SELECT DISTINCT s.full_name, s.title FROM staff s
             JOIN event_assignments ea ON s.id = ea.staff_id JOIN events e ON ea.event_id = e.id
             WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $3
             ORDER BY s.full_name`, [venue.id, startStr, endStr]),
    ])

    const total = parseInt(eventsR.rows[0]?.total || '0')
    const covered = parseInt(eventsR.rows[0]?.covered || '0')
    const wfTotal = parseInt(workflowR.rows[0]?.total || '0')
    const wfCompleted = parseInt(workflowR.rows[0]?.completed || '0')
    const tixTotal = parseInt(ticketsR.rows[0]?.total || '0')
    const tixResolved = parseInt(ticketsR.rows[0]?.resolved || '0')
    const tixCritical = parseInt(ticketsR.rows[0]?.critical || '0')
    const coverageRate = total > 0 ? Math.round((covered / total) * 100) : 100
    const wfRate = wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 100

    const staffList = staffR.rows.map((s: any) => `<li style="padding:4px 0;color:#334155">${s.full_name}${s.title ? ` — <span style="color:#64748b">${s.title}</span>` : ''}</li>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#1e293b;font-size:12px}
.page{width:8.5in;min-height:11in;position:relative}
.header{background:linear-gradient(135deg,#002C73 0%,#0A52EF 100%);color:white;padding:48px;position:relative;overflow:hidden}
.slash{position:absolute;width:60px;height:140px;background:rgba(255,255,255,0.06);transform:skewX(-35deg)}
.header h1{font-size:24px;font-weight:700;position:relative;z-index:1}
.header .sub{font-size:13px;opacity:0.8;margin-top:4px;position:relative;z-index:1}
.header .period{font-size:11px;opacity:0.5;margin-top:2px;position:relative;z-index:1}
.content{padding:40px 48px}
.stats{display:flex;gap:16px;margin-bottom:36px}
.stat{flex:1;border:1px solid #e2e8f0;border-radius:10px;padding:24px;text-align:center}
.stat-value{font-size:36px;font-weight:700;color:#0A52EF}
.stat-value.green{color:#059669}
.stat-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:8px}
.stat-detail{font-size:10px;color:#94a3b8;margin-top:6px}
.section{margin-bottom:28px}
.section-title{font-size:13px;font-weight:700;color:#002C73;margin-bottom:12px;padding-bottom:6px;border-bottom:2px solid #0A52EF;display:inline-block}
.summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.summary-item{padding:16px;border:1px solid #e2e8f0;border-radius:8px}
.summary-item h4{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:6px}
.summary-item p{font-size:14px;font-weight:600;color:#1e293b}
.summary-item .sub{font-size:10px;color:#94a3b8;font-weight:400;margin-top:2px}
.badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:600}
.badge-green{background:#ecfdf5;color:#059669}
.badge-blue{background:#eff6ff;color:#2563eb}
.badge-amber{background:#fffbeb;color:#d97706}
ul{list-style:none;padding:0}
.footer{position:fixed;bottom:0;left:0;right:0;height:40px;background:#002C73;display:flex;align-items:center;justify-content:space-between;padding:0 48px}
.footer span{color:rgba(255,255,255,0.5);font-size:9px}
</style></head><body>
<div class="page">
<div class="header">
<div class="slash" style="top:-30px;right:20px"></div>
<div class="slash" style="top:-30px;right:100px"></div>
<div class="slash" style="top:-30px;right:180px"></div>
<div class="slash" style="top:-30px;right:260px"></div>
<div class="slash" style="top:-30px;right:340px"></div>
<h1>Monthly Service Report</h1>
<div class="sub">${venue.name} — ${venue.market || ''}</div>
<div class="period">${monthName}</div>
</div>
<div class="content">
<div class="stats">
<div class="stat"><div class="stat-label">Coverage Rate</div><div class="stat-value${coverageRate === 100 ? ' green' : ''}">${coverageRate}%</div><div class="stat-detail">${covered} of ${total} events staffed</div></div>
<div class="stat"><div class="stat-label">Workflow Completion</div><div class="stat-value${wfRate === 100 ? ' green' : ''}">${wfRate}%</div><div class="stat-detail">${wfCompleted} of ${wfTotal} reports filed</div></div>
<div class="stat"><div class="stat-label">Events Covered</div><div class="stat-value">${total}</div><div class="stat-detail">${monthName}</div></div>
<div class="stat"><div class="stat-label">Support Tickets</div><div class="stat-value">${tixTotal}</div><div class="stat-detail">${tixResolved} resolved</div></div>
</div>

<div class="section">
<div class="section-title">Service Summary</div>
<div class="summary-grid">
<div class="summary-item"><h4>Staffing Coverage</h4><p>${covered} / ${total} events</p><div class="sub"><span class="badge ${coverageRate === 100 ? 'badge-green' : 'badge-amber'}">${coverageRate}% coverage</span></div></div>
<div class="summary-item"><h4>Workflow Compliance</h4><p>${wfCompleted} / ${wfTotal} completed</p><div class="sub"><span class="badge ${wfRate >= 90 ? 'badge-green' : 'badge-amber'}">${wfRate}% completion rate</span></div></div>
<div class="summary-item"><h4>Support Tickets</h4><p>${tixTotal} total — ${tixResolved} resolved</p><div class="sub">${tixCritical > 0 ? `<span class="badge badge-amber">${tixCritical} critical</span>` : '<span class="badge badge-green">0 critical incidents</span>'}</div></div>
<div class="summary-item"><h4>Team Performance</h4><p>${staffR.rows.length} technicians deployed</p><div class="sub"><span class="badge badge-blue">All events covered</span></div></div>
</div>
</div>

${staffR.rows.length > 0 ? `<div class="section"><div class="section-title">Your ANC Team</div><ul>${staffList}</ul></div>` : ''}

<div style="margin-top:32px;padding:20px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0">
<p style="font-size:11px;color:#64748b;line-height:1.6">This report is auto-generated from ANC's Service Dashboard. For questions or to request additional reporting, contact your ANC service team or email <strong>support@anc.com</strong>.</p>
</div>
</div>
<div class="footer"><span>www.anc.com</span><span>${venue.name} — ${monthName} — Confidential</span></div>
</div></body></html>`

    // Render PDF via Browserless
    const pdfRes = await fetch(`http://abc_browserless:3000/pdf?token=923fe7f9bc3ff7f94c8337be4c2ee0f2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: { format: 'Letter', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
        gotoOptions: { waitUntil: 'networkidle0' },
      }),
    })

    if (!pdfRes.ok) return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 })

    const pdf = await pdfRes.arrayBuffer()
    const venueSafe = venue.name.replace(/[^a-zA-Z0-9]/g, '_')
    const monthSafe = monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '_')

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="ANC_Service_Report_${venueSafe}_${monthSafe}.pdf"`,
      },
    })
  } catch (err) {
    console.error('Error generating portal report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
