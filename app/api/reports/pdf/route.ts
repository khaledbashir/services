import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

async function getReportData(period: string) {
  const now = new Date()
  let startDate: string
  const endDate = now.toISOString().split('T')[0]

  if (period === 'month') {
    const d = new Date(now)
    d.setMonth(d.getMonth() - 1)
    startDate = d.toISOString().split('T')[0]
  } else {
    const d = new Date(now)
    d.setDate(d.getDate() - 7)
    startDate = d.toISOString().split('T')[0]
  }

  const [totalR, coveredR, workflowR, laborR, marketR, leagueR, topStaffR, topVenuesR] = await Promise.all([
    query(`SELECT COUNT(*) as total FROM events WHERE event_date >= $1 AND event_date <= $2`, [startDate, endDate]),
    query(`SELECT COUNT(DISTINCT e.id) as covered FROM events e JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2`, [startDate, endDate]),
    query(`SELECT COUNT(*) as total, COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed FROM events WHERE event_date >= $1 AND event_date <= $2 AND EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)`, [startDate, endDate]),
    query(`SELECT COALESCE(SUM(ea.estimated_hours), 0) as total_hours, COUNT(DISTINCT ea.staff_id) as unique_staff FROM event_assignments ea JOIN events e ON ea.event_id = e.id WHERE e.event_date >= $1 AND e.event_date <= $2`, [startDate, endDate]),
    query(`SELECT m.name as market, COUNT(e.id) as events, COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered, COALESCE(SUM(ea.estimated_hours), 0) as hours FROM events e JOIN venues v ON e.venue_id = v.id JOIN markets m ON v.market_id = m.id LEFT JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY m.name ORDER BY events DESC`, [startDate, endDate]),
    query(`SELECT COALESCE(e.league, 'Other') as league, COUNT(e.id) as events, COALESCE(SUM(ea.estimated_hours), 0) as hours FROM events e LEFT JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY e.league ORDER BY events DESC`, [startDate, endDate]),
    query(`SELECT s.full_name, s.role, COUNT(ea.id) as events, COALESCE(SUM(ea.estimated_hours), 0) as hours, COUNT(CASE WHEN e.workflow_status = 'post_game_submitted' THEN 1 END) as completed FROM event_assignments ea JOIN staff s ON ea.staff_id = s.id JOIN events e ON ea.event_id = e.id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY s.id, s.full_name, s.role ORDER BY hours DESC LIMIT 10`, [startDate, endDate]),
    query(`SELECT v.name, m.name as market, COUNT(e.id) as events, COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as covered FROM events e JOIN venues v ON e.venue_id = v.id JOIN markets m ON v.market_id = m.id LEFT JOIN event_assignments ea ON e.id = ea.event_id WHERE e.event_date >= $1 AND e.event_date <= $2 GROUP BY v.id, v.name, m.name ORDER BY events DESC LIMIT 10`, [startDate, endDate]),
  ])

  const total = parseInt(totalR.rows[0]?.total || '0')
  const covered = parseInt(coveredR.rows[0]?.covered || '0')
  const wfTotal = parseInt(workflowR.rows[0]?.total || '0')
  const wfCompleted = parseInt(workflowR.rows[0]?.completed || '0')

  return {
    period,
    startDate,
    endDate,
    total,
    covered,
    coverageRate: total > 0 ? Math.round((covered / total) * 100) : 0,
    wfRate: wfTotal > 0 ? Math.round((wfCompleted / wfTotal) * 100) : 0,
    laborHours: parseFloat(laborR.rows[0]?.total_hours || '0'),
    uniqueStaff: parseInt(laborR.rows[0]?.unique_staff || '0'),
    markets: marketR.rows,
    leagues: leagueR.rows,
    topStaff: topStaffR.rows,
    topVenues: topVenuesR.rows,
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function buildHTML(data: Awaited<ReturnType<typeof getReportData>>) {
  const periodLabel = data.period === 'month' ? 'Monthly' : 'Weekly'
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const marketRows = data.markets.map((m: any, i: number) => {
    const rate = Number(m.events) > 0 ? Math.round((Number(m.covered) / Number(m.events)) * 100) : 0
    const rateColor = rate === 100 ? '#059669' : rate > 0 ? '#d97706' : '#dc2626'
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:10px 16px;font-weight:500;color:#1e293b">${m.market}</td>
      <td style="padding:10px 16px;text-align:center;color:#475569">${m.events}</td>
      <td style="padding:10px 16px;text-align:center"><span style="color:${rateColor};font-weight:600">${m.covered}/${m.events}</span></td>
      <td style="padding:10px 16px;text-align:right;color:#475569">${Number(m.hours)}</td>
    </tr>`
  }).join('')

  const leagueRows = data.leagues.map((l: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:10px 16px;font-weight:500;color:#1e293b">${l.league}</td>
      <td style="padding:10px 16px;text-align:center;color:#475569">${l.events}</td>
      <td style="padding:10px 16px;text-align:right;color:#475569">${Number(l.hours)}</td>
    </tr>`).join('')

  const staffRows = data.topStaff.map((s: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:10px 16px;font-weight:500;color:#1e293b">${s.full_name}</td>
      <td style="padding:10px 16px;text-align:center;color:#475569">${s.events}</td>
      <td style="padding:10px 16px;text-align:center;color:#475569">${Number(s.hours)}</td>
      <td style="padding:10px 16px;text-align:center;color:#059669;font-weight:600">${s.completed}</td>
    </tr>`).join('')

  const venueRows = data.topVenues.map((v: any, i: number) => {
    const rate = Number(v.events) > 0 ? Math.round((Number(v.covered) / Number(v.events)) * 100) : 0
    const rateColor = rate === 100 ? '#059669' : '#d97706'
    return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:10px 16px;font-weight:500;color:#1e293b">${v.name}</td>
      <td style="padding:10px 16px;color:#64748b;font-size:11px">${v.market}</td>
      <td style="padding:10px 16px;text-align:center;color:#475569">${v.events}</td>
      <td style="padding:10px 16px;text-align:center"><span style="color:${rateColor};font-weight:600">${v.covered}/${v.events}</span></td>
    </tr>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { size: letter portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', -apple-system, sans-serif; color: #1e293b; font-size: 12px; }
    .page { width: 8.5in; min-height: 11in; padding: 0; position: relative; page-break-after: always; }
    .page:last-child { page-break-after: avoid; }

    .header { background: linear-gradient(135deg, #002C73 0%, #0A52EF 100%); color: white; padding: 40px 48px 32px; position: relative; overflow: hidden; }
    .header-slashes { position: absolute; top: -20px; right: -10px; opacity: 0.08; }
    .header-slash { width: 60px; height: 140px; background: white; transform: skewX(-35deg); display: inline-block; margin-left: 12px; }
    .header h1 { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; position: relative; z-index: 1; }
    .header .subtitle { font-size: 12px; color: rgba(255,255,255,0.75); margin-top: 4px; position: relative; z-index: 1; }
    .header .date-range { font-size: 11px; color: rgba(255,255,255,0.6); margin-top: 2px; position: relative; z-index: 1; }

    .content { padding: 32px 48px; }

    .stat-grid { display: flex; gap: 16px; margin-bottom: 32px; }
    .stat-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: #fff; }
    .stat-label { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: #64748b; }
    .stat-value { font-size: 32px; font-weight: 700; color: #0A52EF; margin-top: 8px; line-height: 1; }
    .stat-value span { font-size: 18px; color: #94a3b8; }
    .stat-detail { font-size: 10px; color: #94a3b8; margin-top: 6px; }

    .section { margin-bottom: 28px; }
    .section-title { font-size: 13px; font-weight: 700; color: #002C73; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 2px solid #0A52EF; display: inline-block; }

    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #f1f5f9; padding: 10px 16px; text-align: left; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 2px solid #e2e8f0; }
    tbody td { border-bottom: 1px solid #f1f5f9; }

    .two-col { display: flex; gap: 24px; }
    .two-col > div { flex: 1; }

    .footer { position: fixed; bottom: 0; left: 0; right: 0; height: 36px; background: #002C73; display: flex; align-items: center; justify-content: space-between; padding: 0 48px; }
    .footer span { color: rgba(255,255,255,0.5); font-size: 9px; }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header -->
    <div class="header">
      <div class="header-slashes">
        <div class="header-slash"></div>
        <div class="header-slash"></div>
        <div class="header-slash"></div>
        <div class="header-slash"></div>
        <div class="header-slash"></div>
      </div>
      <h1>Operations Report — ${periodLabel}</h1>
      <div class="subtitle">ANC Sports — Operations & Venue Services</div>
      <div class="date-range">${formatDate(data.startDate)} — ${formatDate(data.endDate)}</div>
    </div>

    <div class="content">
      <!-- Summary Cards -->
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">Coverage Rate</div>
          <div class="stat-value">${data.coverageRate}<span>%</span></div>
          <div class="stat-detail">${data.covered} of ${data.total} events staffed</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Workflow Completion</div>
          <div class="stat-value">${data.wfRate}<span>%</span></div>
          <div class="stat-detail">Post-game reports submitted</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Labor Hours</div>
          <div class="stat-value">${data.laborHours}</div>
          <div class="stat-detail">${data.uniqueStaff} staff across ${data.total} events</div>
        </div>
      </div>

      <!-- Two column: Markets + Leagues -->
      <div class="two-col">
        <div class="section">
          <div class="section-title">Coverage by Market</div>
          <table>
            <thead><tr><th>Market</th><th style="text-align:center">Events</th><th style="text-align:center">Covered</th><th style="text-align:right">Hours</th></tr></thead>
            <tbody>${marketRows}</tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title">Events by League</div>
          <table>
            <thead><tr><th>League</th><th style="text-align:center">Events</th><th style="text-align:right">Hours</th></tr></thead>
            <tbody>${leagueRows}</tbody>
          </table>
        </div>
      </div>

      <!-- Two column: Top Staff + Top Venues -->
      <div class="two-col">
        <div class="section">
          <div class="section-title">Top Staff by Hours</div>
          <table>
            <thead><tr><th>Name</th><th style="text-align:center">Events</th><th style="text-align:center">Hours</th><th style="text-align:center">Completed</th></tr></thead>
            <tbody>${staffRows}</tbody>
          </table>
        </div>
        <div class="section">
          <div class="section-title">Top Venues</div>
          <table>
            <thead><tr><th>Venue</th><th>Market</th><th style="text-align:center">Events</th><th style="text-align:center">Covered</th></tr></thead>
            <tbody>${venueRows}</tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>www.anc.com</span>
      <span>Generated ${today} — Confidential</span>
    </div>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'

    const data = await getReportData(period)
    const html = buildHTML(data)

    // Use Browserless to generate PDF
    const browserlessUrl = 'http://abc_browserless:3000/pdf'
    const token = '923fe7f9bc3ff7f94c8337be4c2ee0f2'

    const pdfResponse = await fetch(`${browserlessUrl}?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: {
          format: 'Letter',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        },
        gotoOptions: {
          waitUntil: 'networkidle0',
        },
      }),
    })

    if (!pdfResponse.ok) {
      const err = await pdfResponse.text()
      console.error('Browserless error:', err)
      return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }

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
