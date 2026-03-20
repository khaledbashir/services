import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  try {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:letter;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#1e293b;font-size:12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.page{width:8.5in;min-height:11in;position:relative;page-break-after:always;overflow:hidden}
.page:last-child{page-break-after:avoid}

/* Cover */
.cover{background:linear-gradient(135deg,#001845 0%,#002C73 40%,#0A52EF 100%);color:white;height:11in;display:flex;flex-direction:column;justify-content:center;padding:0 80px;position:relative}
.cover-slashes{position:absolute;top:0;right:0;bottom:0;width:300px;overflow:hidden;opacity:0.04}
.cover-slash{width:80px;height:200%;background:white;transform:skewX(-35deg);position:absolute}
.cover h1{font-size:42px;font-weight:800;letter-spacing:-1px;line-height:1.1;position:relative;z-index:1}
.cover .subtitle{font-size:16px;opacity:0.7;margin-top:12px;position:relative;z-index:1}
.cover .meta{position:absolute;bottom:60px;left:80px;z-index:1}
.cover .meta p{font-size:11px;opacity:0.5;margin-top:4px}
.cover .logo-area{position:absolute;top:60px;left:80px;z-index:1}

/* Content pages */
.content-page{padding:60px 64px}
.page-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px;padding-bottom:16px;border-bottom:2px solid #0A52EF}
.page-header h2{font-size:22px;font-weight:700;color:#002C73}
.page-header .page-num{font-size:10px;color:#94a3b8}

.section{margin-bottom:32px}
.section-title{font-size:14px;font-weight:700;color:#002C73;margin-bottom:16px}

.feature-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.feature{padding:20px;border:1px solid #e2e8f0;border-radius:10px;background:#fff}
.feature-icon{font-size:20px;margin-bottom:8px}
.feature h4{font-size:12px;font-weight:700;color:#1e293b;margin-bottom:4px}
.feature p{font-size:10px;color:#64748b;line-height:1.5}

.highlight{background:linear-gradient(135deg,#002C73,#0A52EF);color:white;border-radius:12px;padding:24px;margin-bottom:16px}
.highlight h4{font-size:13px;font-weight:700;margin-bottom:6px}
.highlight p{font-size:10px;opacity:0.8;line-height:1.5}

.stat-row{display:flex;gap:12px;margin-bottom:20px}
.stat-box{flex:1;text-align:center;padding:16px;border:1px solid #e2e8f0;border-radius:8px}
.stat-box .num{font-size:28px;font-weight:800;color:#0A52EF}
.stat-box .label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-top:4px}

.check{color:#059669;font-weight:700}
.portal-preview{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-top:16px}

.footer{position:absolute;bottom:0;left:0;right:0;height:36px;background:#002C73;display:flex;align-items:center;justify-content:space-between;padding:0 64px}
.footer span{color:rgba(255,255,255,0.4);font-size:9px}

ul{padding-left:16px}
li{margin-bottom:6px;font-size:11px;color:#475569;line-height:1.5}
li strong{color:#1e293b}
</style></head><body>

<!-- PAGE 1: COVER -->
<div class="page cover">
<div class="cover-slashes">
<div class="cover-slash" style="left:20px;top:-50%"></div>
<div class="cover-slash" style="left:110px;top:-50%"></div>
<div class="cover-slash" style="left:200px;top:-50%"></div>
</div>
<div class="logo-area">
<div style="font-size:18px;font-weight:800;letter-spacing:2px">ANC</div>
<div style="font-size:9px;opacity:0.5;margin-top:2px">OPERATIONS & VENUE SERVICES</div>
</div>
<h1>Service Dashboard<br/>Platform Overview</h1>
<p class="subtitle">A unified operations platform for managing events, staff,<br/>workflows, tickets, and client services across 43+ venues.</p>
<div class="meta">
<p>Prepared by Ahmad Basheer</p>
<p>March 2026</p>
</div>
</div>

<!-- PAGE 2: PLATFORM AT A GLANCE -->
<div class="page">
<div class="content-page">
<div class="page-header">
<h2>Platform at a Glance</h2>
<span class="page-num">02</span>
</div>

<div class="stat-row">
<div class="stat-box"><div class="num">43+</div><div class="label">Venues</div></div>
<div class="stat-box"><div class="num">15</div><div class="label">Markets</div></div>
<div class="stat-box"><div class="num">150+</div><div class="label">Technicians</div></div>
<div class="stat-box"><div class="num">250+</div><div class="label">Events Loaded</div></div>
</div>

<div class="section">
<div class="section-title">Core Capabilities</div>
<div class="feature-grid">
<div class="feature"><div class="feature-icon">📅</div><h4>Event Management</h4><p>Auto-syncs from Google Calendar every 15 minutes. Calendar and list views with search, league badges, and staff assignments visible at a glance.</p></div>
<div class="feature"><div class="feature-icon">👥</div><h4>Staff Management</h4><p>Card and list views with profile photos. Detail pages showing hours, completion rate, markets covered. Excel import with downloadable template.</p></div>
<div class="feature"><div class="feature-icon">⚡</div><h4>3-Stage Workflow</h4><p>Check-in → Game Ready → Post-Game Report. Mobile-friendly — techs tap through on their phone. Managers see real-time status across all venues.</p></div>
<div class="feature"><div class="feature-icon">🎟️</div><h4>Ticketing System</h4><p>Full ticket lifecycle with SLA tracking, auto-assignment rules, canned responses, internal/external comments, and Slack notifications to venue channels.</p></div>
<div class="feature"><div class="feature-icon">📊</div><h4>Reports & Analytics</h4><p>Ops reports with coverage rate, labor hours by market, top staff, SLA compliance. Export as branded PDF. Weekly and monthly views.</p></div>
<div class="feature"><div class="feature-icon">🤖</div><h4>AI Slack Bot (Claw)</h4><p>"What games are tonight?" — answers from live data. Daily digests at 8 AM, escalation alerts for missed check-ins, weekly ops summaries.</p></div>
<div class="feature"><div class="feature-icon">🔐</div><h4>Role-Based Access</h4><p>Admin, Manager, Technician — each role sees what's relevant. Admins manage staff and settings. Managers assign and triage. Techs see their events.</p></div>
<div class="feature"><div class="feature-icon">📱</div><h4>Mobile Ready</h4><p>Collapsible sidebar, responsive grids, touch-friendly controls. Works on any device — phone, tablet, desktop.</p></div>
</div>
</div>
</div>
<div class="footer"><span>www.anc.com</span><span>ANC Service Dashboard — Platform Overview</span></div>
</div>

<!-- PAGE 3: DASHBOARD & INTELLIGENCE -->
<div class="page">
<div class="content-page">
<div class="page-header">
<h2>Dashboard & Intelligence</h2>
<span class="page-num">03</span>
</div>

<div class="highlight">
<h4>Smart Dashboard</h4>
<p>The dashboard surfaces what needs attention — not just data. Five clickable stat cards, real-time alerts, workflow completion charts, labor budget tracking, live activity feed, and market-level breakdowns.</p>
</div>

<div class="section">
<div class="section-title">Dashboard Alerts</div>
<p style="font-size:11px;color:#475569;line-height:1.6;margin-bottom:12px">The system proactively flags operational issues so managers don't have to hunt for problems:</p>
<ul>
<li><strong style="color:#dc2626">Critical:</strong> Events today with no staff assigned</li>
<li><strong style="color:#dc2626">Critical:</strong> Events starting within 2 hours with no check-in</li>
<li><strong style="color:#d97706">Warning:</strong> Events not game ready within 1 hour of start</li>
<li><strong style="color:#d97706">Warning:</strong> Overdue post-game reports from yesterday</li>
<li><strong style="color:#2563eb">Info:</strong> Upcoming events this week still needing assignment</li>
</ul>
</div>

<div class="section">
<div class="section-title">Labor Budget Tracking</div>
<div class="feature-grid">
<div class="feature"><h4>Estimated Hours by League</h4><p>NBA = 7.5 hrs, NHL = 7.0 hrs, MLB = 8.0 hrs — configurable per league. Auto-populates when assigning staff to events. Managers see weekly totals per tech to prevent overloading.</p></div>
<div class="feature"><h4>Smart Assignment</h4><p>When assigning a tech to an event, the dropdown shows their current week hours (color-coded: green under 30h, amber under 40h, red over 40h). Prevents burnout before it happens.</p></div>
</div>
</div>

<div class="section">
<div class="section-title">Ticketing — Enterprise Grade</div>
<div class="feature-grid">
<div class="feature"><h4>SLA Tracking</h4><p>Critical: 1h response / 4h resolution. High: 2h / 8h. Medium: 4h / 24h. Low: 8h / 72h. Auto-applied on creation. Visual indicators show met, overdue, or breached.</p></div>
<div class="feature"><h4>Auto-Assignment Rules</h4><p>Route tickets by category and/or venue. Hardware tickets → Chris D. Software tickets → on-call engineer. Most specific rule wins.</p></div>
<div class="feature"><h4>Canned Responses</h4><p>8 pre-loaded templates: "Acknowledged," "Technician Dispatched," "Issue Resolved," "Escalated," and more. One click to reply professionally.</p></div>
<div class="feature"><h4>Slack Integration</h4><p>Ticket created → posts to venue's Slack channel. Status changed → update posted. Resolved → confirmation posted. Real-time, no manual steps.</p></div>
</div>
</div>
</div>
<div class="footer"><span>www.anc.com</span><span>ANC Service Dashboard — Platform Overview</span></div>
</div>

<!-- PAGE 4: CLIENT PORTAL -->
<div class="page">
<div class="content-page">
<div class="page-header">
<h2>Client Portal</h2>
<span class="page-num">04</span>
</div>

<div class="highlight">
<h4>A portal that makes ANC look like a Fortune 500 service operation</h4>
<p>Each venue gets a unique, shareable link — no login required. Venue contacts see their events, submit tickets, track service levels, and download branded reports. Managed from a central portal admin page.</p>
</div>

<div class="section">
<div class="section-title">What Clients See</div>
<div class="feature-grid">
<div class="feature"><div class="feature-icon">📡</div><h4>Live Game Day Tracking</h4><p>Real-time workflow timeline — like FedEx tracking for events. "6:00 PM — Tech checked in on site." "6:45 PM — Game readiness confirmed." Clients see every step as it happens.</p></div>
<div class="feature"><div class="feature-icon">👤</div><h4>Your ANC Team</h4><p>Profile photos, names, and titles of every technician assigned to upcoming events. Puts a face to the service — makes ANC feel premium, not anonymous.</p></div>
<div class="feature"><div class="feature-icon">📈</div><h4>Service Level Dashboard</h4><p>Coverage rate, workflow completion %, events covered, average resolution time — all in a branded gradient banner. The numbers that justify the contract.</p></div>
<div class="feature"><div class="feature-icon">🤖</div><h4>AI Ticket Creation</h4><p>Client describes the problem in plain English: "The left scoreboard panel went dark." AI auto-categorizes (hardware), sets priority (high), writes a clean title, and submits the ticket.</p></div>
<div class="feature"><div class="feature-icon">📄</div><h4>Monthly Service Report</h4><p>One-click branded PDF download: coverage rate, workflow compliance, tickets handled, team deployed. The report venue ops directors forward to their boss.</p></div>
<div class="feature"><div class="feature-icon">🖥️</div><h4>Installed Display Specs</h4><p>Full LED specifications per venue: manufacturer, model, pixel pitch, dimensions, brightness. Auto-populated from the Proposal Engine when deals are signed.</p></div>
</div>
</div>

<div class="section">
<div class="section-title">Portal Security</div>
<ul>
<li><strong>Unique token per venue</strong> — each venue gets its own link, no shared access</li>
<li><strong>External comments only</strong> — internal ANC discussions are never visible to clients</li>
<li><strong>Read-only data</strong> — clients can view events and submit tickets, but can't modify operations</li>
<li><strong>No login required</strong> — zero friction for venue contacts, just click and go</li>
</ul>
</div>
</div>
<div class="footer"><span>www.anc.com</span><span>ANC Service Dashboard — Platform Overview</span></div>
</div>

<!-- PAGE 5: INTEGRATIONS & INFRASTRUCTURE -->
<div class="page">
<div class="content-page">
<div class="page-header">
<h2>Integrations & Infrastructure</h2>
<span class="page-num">05</span>
</div>

<div class="section">
<div class="section-title">Connected Systems</div>
<div class="feature-grid">
<div class="feature"><h4>Google Calendar</h4><p>Auto-syncs every 15 minutes via service account. 250+ events loaded across 43 venues. No manual entry — events flow in automatically.</p></div>
<div class="feature"><h4>Slack</h4><p>AI bot (Claw) answers questions from live data. Ticket notifications to venue channels. Daily digests, escalation alerts, weekly reports — all automated.</p></div>
<div class="feature"><h4>Proposal Engine</h4><p>When a proposal is signed, venue and display specs auto-populate in the Service Dashboard. Seamless handoff from sales to operations.</p></div>
<div class="feature"><h4>Browserless</h4><p>Headless Chrome for PDF generation. Branded ops reports and client service reports rendered server-side — no browser print hacks.</p></div>
</div>
</div>

<div class="section">
<div class="section-title">Technology Stack</div>
<ul>
<li><strong>Frontend:</strong> Next.js 14 (React) with Tailwind CSS</li>
<li><strong>Backend:</strong> Next.js API routes with PostgreSQL 17</li>
<li><strong>Hosting:</strong> Dedicated VPS with Docker, managed via EasyPanel</li>
<li><strong>AI:</strong> MiniMax M2.7 for ticket parsing, Claude for Slack bot</li>
<li><strong>Auth:</strong> JWT with role-based access control (admin/manager/technician)</li>
<li><strong>Deployment:</strong> Push to GitHub → auto-builds via EasyPanel</li>
</ul>
</div>

<div class="section">
<div class="section-title">What's Included</div>
<ul>
<li><span class="check">✓</span> Full source code ownership — ANC owns everything</li>
<li><span class="check">✓</span> Infrastructure on existing server (no additional hosting cost)</li>
<li><span class="check">✓</span> SSL certificates and domain configuration</li>
<li><span class="check">✓</span> 43 venues and 15 markets pre-loaded</li>
<li><span class="check">✓</span> AI Slack bot with custom ANC skills</li>
<li><span class="check">✓</span> 30 days of bug fixes and support after delivery</li>
</ul>
</div>

<div style="margin-top:24px;padding:20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px">
<p style="font-size:12px;font-weight:700;color:#0369a1;margin-bottom:4px">Ready to discuss?</p>
<p style="font-size:11px;color:#475569;line-height:1.5">Contact Ahmad Basheer — ahmadbasheerr@gmail.com</p>
</div>
</div>
<div class="footer"><span>www.anc.com</span><span>ANC Service Dashboard — Platform Overview</span></div>
</div>

</body></html>`

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
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="ANC_Service_Dashboard_Overview.pdf"',
      },
    })
  } catch (err) {
    console.error('Error generating showcase:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
