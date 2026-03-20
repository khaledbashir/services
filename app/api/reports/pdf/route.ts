import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

async function getReportData(period: string) {
  const now = new Date()
  let startDate: string
  const endDate = now.toISOString().split('T')[0]

  // Previous period for trend comparison
  let prevStartDate: string
  let prevEndDate: string

  if (period === 'month') {
    const d = new Date(now); d.setMonth(d.getMonth() - 1)
    startDate = d.toISOString().split('T')[0]
    const pd = new Date(d); pd.setMonth(pd.getMonth() - 1)
    prevStartDate = pd.toISOString().split('T')[0]
    prevEndDate = startDate
  } else {
    const d = new Date(now); d.setDate(d.getDate() - 7)
    startDate = d.toISOString().split('T')[0]
    const pd = new Date(d); pd.setDate(pd.getDate() - 7)
    prevStartDate = pd.toISOString().split('T')[0]
    prevEndDate = startDate
  }

  const [totalR, coveredR, workflowR, laborR, marketR, topStaffR, topVenuesR, ticketsR, prevTotalR, prevCoveredR, prevWfR, upcomingUnassignedR] = await Promise.all([
    query(`SELECT COUNT(*) as total FROM events WHERE event_date >= $1 AND event_date <= $2`, [startDate, endDate]),
    query(`SELECT COUNT(DISTINCT e.id) as covered FROM events e JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2`, [startDate, endDate]),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed FROM events WHERE event_date >= $1 AND event_date <= $2 AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)`, [startDate, endDate]),
    query(`SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours, COUNT(DISTINCT ea.staff_id) as unique_staff FROM event_assignments ea JOIN events e ON ea.event_id = e.id WHERE e.event_date >= $1 AND e.event_date <= $2`, [startDate, endDate]),
    query(`SELECT m.name as market, COUNT(e.id) as events, COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered, COALESCE(SUM(ea.estimated_hours), 0) as hours FROM events e JOIN venues v ON e.venue_id = v.id JOIN markets m ON v.market_id = m.id LEFT JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY m.name ORDER BY events DESC`, [startDate, endDate]),
    query(`SELECT s.full_name, COUNT(ea.id) as events, COALESCE(SUM(ea.estimated_hours), 0) as hours, COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed FROM event_assignments ea JOIN staff s ON ea.staff_id = s.id JOIN events e ON ea.event_id = e.id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY s.id, s.full_name ORDER BY hours DESC LIMIT 5`, [startDate, endDate]),
    query(`SELECT v.name, m.name as market, COUNT(e.id) as events, COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered FROM events e JOIN venues v ON e.venue_id = v.id JOIN markets m ON v.market_id = m.id LEFT JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY v.id, v.name, m.name ORDER BY events DESC LIMIT 5`, [startDate, endDate]),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN status IN ('resolved','closed') THEN 1 END) as resolved, COUNT(CASE WHEN priority = 'critical' THEN 1 END) as critical, COUNT(CASE WHEN sla_response_met = true THEN 1 END) as sla_met, COUNT(CASE WHEN sla_response_met = false THEN 1 END) as sla_breached, AVG(CASE WHEN resolved_at IS NOT NULL THEN EXTRACT(EPOCH FROM (resolved_at - created_at))/3600 END) as avg_resolution FROM tickets WHERE created_at >= $1 AND created_at <= $2::date + 1`, [startDate, endDate]),
    // Previous period for trends
    query(`SELECT COUNT(*) as total FROM events WHERE event_date >= $1 AND event_date < $2`, [prevStartDate, prevEndDate]),
    query(`SELECT COUNT(DISTINCT e.id) as covered FROM events e JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date < $2`, [prevStartDate, prevEndDate]),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed FROM events WHERE event_date >= $1 AND event_date < $2 AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)`, [prevStartDate, prevEndDate]),
    // Upcoming unassigned (next 7 days)
    query(`SELECT COUNT(*) as count FROM events e JOIN venues v ON e.venue_id = v.id WHERE e.event_date > $1 AND e.event_date <= $1::date + 7 AND v.requires_assignment = true AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)`, [endDate]),
  ])

  const total = parseInt(totalR.rows[0]?.total || '0')
  const covered = parseInt(coveredR.rows[0]?.covered || '0')
  const wfTotal = parseInt(workflowR.rows[0]?.total || '0')
  const wfCompleted = parseInt(workflowR.rows[0]?.completed || '0')
  const coverageRate = total > 0 ? Math.round((covered / total) * 100) : 100
  const wfRate = wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 100

  const prevTotal = parseInt(prevTotalR.rows[0]?.total || '0')
  const prevCovered = parseInt(prevCoveredR.rows[0]?.covered || '0')
  const prevCoverageRate = prevTotal > 0 ? Math.round((prevCovered / prevTotal) * 100) : 100
  const prevWfTotal = parseInt(prevWfR.rows[0]?.total || '0')
  const prevWfCompleted = parseInt(prevWfR.rows[0]?.completed || '0')
  const prevWfRate = prevWfTotal > 0 ? Math.round((prevWfCompleted / prevWfTotal) * 100) : 100

  const tix = ticketsR.rows[0]
  const upcomingUnassigned = parseInt(upcomingUnassignedR.rows[0]?.count || '0')

  return {
    period, startDate, endDate, total, covered, coverageRate, wfRate, wfTotal, wfCompleted,
    laborHours: parseFloat(laborR.rows[0]?.total_hours || '0'),
    uniqueStaff: parseInt(laborR.rows[0]?.unique_staff || '0'),
    markets: marketR.rows, topStaff: topStaffR.rows, topVenues: topVenuesR.rows,
    prevCoverageRate, prevWfRate,
    coverageTrend: coverageRate - prevCoverageRate,
    wfTrend: wfRate - prevWfRate,
    tickets: {
      total: parseInt(tix?.total || '0'), resolved: parseInt(tix?.resolved || '0'),
      critical: parseInt(tix?.critical || '0'),
      slaMet: parseInt(tix?.sla_met || '0'), slaBreached: parseInt(tix?.sla_breached || '0'),
      avgResolution: tix?.avg_resolution ? Math.round(parseFloat(tix.avg_resolution) * 10) / 10 : null,
    },
    upcomingUnassigned,
  }
}

function fmt(d: string) { return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) }
function trendArrow(v: number) { return v > 0 ? `<span style="color:#059669">▲ +${v}%</span>` : v < 0 ? `<span style="color:#dc2626">▼ ${v}%</span>` : '<span style="color:#64748b">— No change</span>' }
function progressBar(pct: number, color: string) { return `<div style="width:100%;height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;margin-top:6px"><div style="width:${pct}%;height:100%;background:${color};border-radius:3px"></div></div>` }

function buildHTML(d: ReturnType<Awaited<typeof getReportData>>) {
  const periodLabel = d.period === 'month' ? 'Monthly' : 'Weekly'
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Executive summary
  const concerns: string[] = []
  if (d.coverageRate < 100) concerns.push(`${d.total - d.covered} event${d.total - d.covered > 1 ? 's' : ''} went unstaffed`)
  if (d.wfRate < 80) concerns.push(`workflow completion at ${d.wfRate}% (below 80% target)`)
  if (d.tickets.critical > 0) concerns.push(`${d.tickets.critical} critical ticket${d.tickets.critical > 1 ? 's' : ''} reported`)
  if (d.tickets.slaBreached > 0) concerns.push(`${d.tickets.slaBreached} SLA breach${d.tickets.slaBreached > 1 ? 'es' : ''}`)
  if (d.upcomingUnassigned > 0) concerns.push(`${d.upcomingUnassigned} event${d.upcomingUnassigned > 1 ? 's' : ''} next week still need assignment`)

  const highlights: string[] = []
  if (d.coverageRate === 100) highlights.push('100% staffing coverage achieved')
  if (d.wfRate >= 90) highlights.push(`${d.wfRate}% workflow completion rate`)
  if (d.coverageTrend > 0) highlights.push(`Coverage up ${d.coverageTrend}% vs prior period`)
  if (d.tickets.total > 0 && d.tickets.slaBreached === 0) highlights.push('Zero SLA breaches')
  if (d.topStaff.length > 0) highlights.push(`${d.uniqueStaff} technicians deployed across ${d.markets.length} markets`)

  const marketRows = d.markets.map((m: any, i: number) => {
    const rate = Number(m.events) > 0 ? Math.round((Number(m.covered) / Number(m.events)) * 100) : 0
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:8px 16px;font-weight:500">${m.market}</td>
      <td style="padding:8px 16px;text-align:center">${m.events}</td>
      <td style="padding:8px 16px;text-align:center"><span style="color:${rate === 100 ? '#059669' : '#d97706'};font-weight:600">${rate}%</span></td>
      <td style="padding:8px 16px;text-align:right">${Number(m.hours)}h</td></tr>`
  }).join('')

  const staffRows = d.topStaff.map((s: any, i: number) =>
    `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:8px 16px;font-weight:500">${s.full_name}</td>
      <td style="padding:8px 16px;text-align:center">${s.events}</td>
      <td style="padding:8px 16px;text-align:center">${Number(s.hours)}h</td>
      <td style="padding:8px 16px;text-align:center;color:#059669;font-weight:600">${s.completed}</td></tr>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#1e293b;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;position:relative;page-break-after:always}
.page:last-child{page-break-after:avoid}
.header{background:linear-gradient(135deg,#001845 0%,#002C73 40%,#0A52EF 100%);color:white;padding:40px 48px 32px;position:relative;overflow:hidden}
.slash{position:absolute;width:60px;height:200px;background:rgba(255,255,255,0.05);transform:skewX(-35deg)}
.header h1{font-size:20px;font-weight:800;position:relative;z-index:1}
.header .sub{font-size:11px;opacity:0.7;margin-top:3px;position:relative;z-index:1}
.header .period{font-size:10px;opacity:0.4;margin-top:2px;position:relative;z-index:1}
.content{padding:28px 48px}
table{width:100%;border-collapse:collapse;font-size:10px}
thead th{background:#f1f5f9;padding:8px 16px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0}
tbody td{border-bottom:1px solid #f1f5f9;color:#334155}
.footer{position:fixed;bottom:0;left:0;right:0;height:32px;background:#002C73;display:flex;align-items:center;justify-content:space-between;padding:0 48px}
.footer span{color:rgba(255,255,255,0.4);font-size:8px}
.exec{background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:16px 20px;margin-bottom:20px}
.exec p{font-size:11px;color:#0369a1;line-height:1.6}
.metric-row{display:flex;gap:12px;margin-bottom:20px}
.metric{flex:1;border:1px solid #e2e8f0;border-radius:8px;padding:16px;position:relative;overflow:hidden}
.metric .label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:#64748b}
.metric .value{font-size:28px;font-weight:800;margin-top:6px;line-height:1}
.metric .detail{font-size:9px;color:#94a3b8;margin-top:4px}
.metric .trend{font-size:9px;margin-top:4px}
.section{margin-bottom:20px}
.section-title{font-size:11px;font-weight:700;color:#002C73;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #0A52EF;display:inline-block}
.two-col{display:flex;gap:20px}
.two-col>div{flex:1}
.concern-list,.highlight-list{padding:0;list-style:none}
.concern-list li,.highlight-list li{padding:4px 0;font-size:10px;line-height:1.5}
.concern-list li:before{content:'⚠ ';color:#d97706}
.highlight-list li:before{content:'✓ ';color:#059669;font-weight:700}
.action-item{background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:10px 14px;margin-top:8px;font-size:10px;color:#92400e}
.action-item strong{color:#78350f}
</style></head><body>

<!-- PAGE 1 -->
<div class="page">
<div class="header">
<div class="slash" style="top:-40px;right:30px"></div>
<div class="slash" style="top:-40px;right:110px"></div>
<div class="slash" style="top:-40px;right:190px"></div>
<div class="slash" style="top:-40px;right:270px"></div>
<div class="slash" style="top:-40px;right:350px"></div>
<h1>Operations Report — ${periodLabel}</h1>
<div class="sub">ANC Sports — Operations & Venue Services</div>
<div class="period">${fmt(d.startDate)} — ${fmt(d.endDate)}</div>
</div>

<div class="content">

<!-- Executive Summary -->
<div class="exec">
<p><strong>Executive Summary:</strong> This ${d.period === 'month' ? 'month' : 'week'}, ANC covered <strong>${d.covered} of ${d.total} events</strong> across <strong>${d.markets.length} markets</strong> with <strong>${d.uniqueStaff} technicians</strong>, logging <strong>${d.laborHours} labor hours</strong>. ${d.coverageRate === 100 ? 'Full staffing coverage was achieved.' : `Coverage rate was ${d.coverageRate}%.`} ${d.tickets.total > 0 ? `${d.tickets.total} support ticket${d.tickets.total > 1 ? 's were' : ' was'} handled${d.tickets.slaBreached === 0 ? ' with zero SLA breaches' : ''}.` : 'No support tickets were reported.'}</p>
</div>

<!-- Key Metrics with Trends -->
<div class="metric-row">
<div class="metric">
<div class="label">Coverage Rate</div>
<div class="value" style="color:${d.coverageRate >= 90 ? '#059669' : d.coverageRate >= 70 ? '#d97706' : '#dc2626'}">${d.coverageRate}%</div>
<div class="detail">${d.covered} of ${d.total} events staffed</div>
<div class="trend">vs prior: ${trendArrow(d.coverageTrend)}</div>
${progressBar(d.coverageRate, d.coverageRate >= 90 ? '#059669' : '#d97706')}
</div>
<div class="metric">
<div class="label">Workflow Completion</div>
<div class="value" style="color:${d.wfRate >= 80 ? '#059669' : d.wfRate >= 50 ? '#d97706' : '#dc2626'}">${d.wfRate}%</div>
<div class="detail">${d.wfCompleted} of ${d.wfTotal} reports filed</div>
<div class="trend">vs prior: ${trendArrow(d.wfTrend)}</div>
${progressBar(d.wfRate, d.wfRate >= 80 ? '#059669' : '#d97706')}
</div>
<div class="metric">
<div class="label">Labor Hours</div>
<div class="value" style="color:#0A52EF">${d.laborHours}</div>
<div class="detail">${d.uniqueStaff} staff deployed</div>
<div class="detail">${d.markets.length} markets active</div>
</div>
<div class="metric">
<div class="label">Support</div>
<div class="value" style="color:${d.tickets.critical > 0 ? '#dc2626' : '#0A52EF'}">${d.tickets.total}</div>
<div class="detail">${d.tickets.resolved} resolved${d.tickets.avgResolution ? ` (avg ${d.tickets.avgResolution}h)` : ''}</div>
<div class="detail">${d.tickets.slaBreached === 0 ? '<span style="color:#059669;font-weight:600">0 SLA breaches</span>' : `<span style="color:#dc2626;font-weight:600">${d.tickets.slaBreached} SLA breaches</span>`}</div>
</div>
</div>

<!-- Highlights & Concerns -->
<div class="two-col" style="margin-bottom:20px">
<div>
<div class="section-title">Highlights</div>
${highlights.length > 0 ? `<ul class="highlight-list">${highlights.map(h => `<li>${h}</li>`).join('')}</ul>` : '<p style="font-size:10px;color:#94a3b8">No notable highlights</p>'}
</div>
<div>
<div class="section-title">Attention Required</div>
${concerns.length > 0 ? `<ul class="concern-list">${concerns.map(c => `<li>${c}</li>`).join('')}</ul>` : '<p style="font-size:10px;color:#059669;font-weight:500">No concerns — all clear</p>'}
${d.upcomingUnassigned > 0 ? `<div class="action-item"><strong>Action:</strong> ${d.upcomingUnassigned} event${d.upcomingUnassigned > 1 ? 's' : ''} next week need${d.upcomingUnassigned === 1 ? 's' : ''} staff assignment</div>` : ''}
</div>
</div>

<!-- Coverage by Market -->
<div class="section">
<div class="section-title">Coverage by Market</div>
<table><thead><tr><th>Market</th><th style="text-align:center">Events</th><th style="text-align:center">Coverage</th><th style="text-align:right">Hours</th></tr></thead>
<tbody>${marketRows}</tbody></table>
</div>

<!-- Two columns: Top Staff + Top Venues -->
<div class="two-col">
<div class="section">
<div class="section-title">Top Staff</div>
<table><thead><tr><th>Name</th><th style="text-align:center">Events</th><th style="text-align:center">Hours</th><th style="text-align:center">Completed</th></tr></thead>
<tbody>${staffRows}</tbody></table>
</div>
<div class="section">
<div class="section-title">Venue Coverage</div>
<table><thead><tr><th>Venue</th><th style="text-align:center">Events</th><th style="text-align:center">Coverage</th></tr></thead>
<tbody>${d.topVenues.map((v: any, i: number) => {
  const rate = Number(v.events) > 0 ? Math.round((Number(v.covered) / Number(v.events)) * 100) : 0
  return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}"><td style="padding:8px 16px;font-weight:500">${v.name}</td><td style="padding:8px 16px;text-align:center">${v.events}</td><td style="padding:8px 16px;text-align:center"><span style="color:${rate === 100 ? '#059669' : '#d97706'};font-weight:600">${rate}%</span></td></tr>`
}).join('')}</tbody></table>
</div>
</div>

</div>
<div class="footer"><span>www.anc.com</span><span>Confidential — ${today}</span></div>
</div>

</body></html>`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'

    const data = await getReportData(period) as any
    const html = buildHTML(data)

    const pdfResponse = await fetch(`http://abc_browserless:3000/pdf?token=923fe7f9bc3ff7f94c8337be4c2ee0f2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: { format: 'Letter', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
        gotoOptions: { waitUntil: 'networkidle0' },
      }),
    })

    if (!pdfResponse.ok) return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const periodLabel = period === 'month' ? 'Monthly' : 'Weekly'
    const filename = `ANC_Ops_Report_${periodLabel}_${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generating PDF report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
