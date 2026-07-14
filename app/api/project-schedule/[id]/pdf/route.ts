export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  getProjectScheduleProjectLive,
  listProjectScheduleTasks,
  type ProjectScheduleTask,
} from '@/lib/project-schedule'

const fmt = (d: string | null | undefined) => {
  if (!d) return '—'
  const date = new Date(d)
  if (isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildHTML(projectName: string, meta: Record<string, string | null>, tasks: ProjectScheduleTask[]) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  // Group tasks by phase, ordered by each phase's earliest start date.
  const dated = tasks.filter((t) => t.start)
  const phaseStart = new Map<string, number>()
  for (const t of dated) {
    const ts = new Date(t.start!).getTime() || 0
    const cur = phaseStart.get(t.phase || 'Unphased')
    if (cur === undefined || ts < cur) phaseStart.set(t.phase || 'Unphased', ts)
  }
  const groups = new Map<string, ProjectScheduleTask[]>()
  for (const t of dated) {
    const phase = t.phase || 'Unphased'
    if (!groups.has(phase)) groups.set(phase, [])
    groups.get(phase)!.push(t)
  }
  const orderedPhases = Array.from(groups.keys()).sort((a, b) => (phaseStart.get(a) ?? 0) - (phaseStart.get(b) ?? 0))

  const metaRows = Object.entries(meta)
    .filter(([, v]) => v)
    .map(([k, v]) => `<div class="meta"><span class="meta-label">${k}</span><span class="meta-value">${v}</span></div>`)
    .join('')

  const sections = orderedPhases
    .map((phase) => {
      const items = groups
        .get(phase)!
        .slice()
        .sort((a, b) => (new Date(a.start!).getTime() || 0) - (new Date(b.start!).getTime() || 0) || a.orderIndex - b.orderIndex)
      const rows = items
        .map((t, i) => {
          const marker = t.isSubmittalMilestone ? '◆' : t.isMilestone ? '◇' : ''
          return `<tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
            <td style="padding:8px 16px;font-weight:500">${marker ? `<span style="color:#7350FF;font-weight:700">${marker}</span> ` : ''}${escapeHtml(t.name)}</td>
            <td style="padding:8px 16px;text-align:center" class="tab">${fmt(t.start)}</td>
            <td style="padding:8px 16px;text-align:center" class="tab">${fmt(t.end)}</td>
            <td style="padding:8px 16px;text-align:center" class="tab">${t.duration != null ? `${t.duration}d` : '—'}</td>
          </tr>`
        })
        .join('')
      return `<div class="section">
        <div class="section-title">${escapeHtml(phase)}</div>
        <table><thead><tr><th>Task</th><th style="text-align:center">Start</th><th style="text-align:center">End</th><th style="text-align:center">Duration</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8">No dated tasks</td></tr>'}</tbody></table>
      </div>`
    })
    .join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:letter landscape;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#1e293b;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:linear-gradient(135deg,#001845 0%,#002C73 40%,#0A52EF 100%);color:white;padding:32px 48px 24px;position:relative;overflow:hidden}
.slash{position:absolute;width:60px;height:200px;background:rgba(255,255,255,0.05);transform:skewX(-35deg)}
.header h1{font-size:18px;font-weight:800;position:relative;z-index:1}
.header .sub{font-size:11px;opacity:0.7;margin-top:3px;position:relative;z-index:1}
.content{padding:24px 48px}
.meta-row{display:flex;flex-wrap:wrap;gap:12px 28px;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #e2e8f0}
.meta-label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;display:block}
.meta-value{font-size:12px;font-weight:600;color:#1e293b;margin-top:2px;display:block}
.section{margin-bottom:22px}
.section-title{font-size:11px;font-weight:800;color:#7350FF;text-transform:uppercase;letter-spacing:0.6px;margin-bottom:8px;padding-bottom:4px;border-bottom:2px solid #7350FF}
table{width:100%;border-collapse:collapse;font-size:10px}
thead th{background:#f1f5f9;padding:8px 16px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0}
tbody td{border-bottom:1px solid #f1f5f9;color:#334155}
.tab{font-variant-numeric:tabular-nums}
.footer{margin-top:20px;padding:16px 48px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}
</style></head><body>
<div class="header">
<div class="slash" style="top:-40px;right:30px"></div>
<div class="slash" style="top:-40px;right:110px"></div>
<div class="slash" style="top:-40px;right:190px"></div>
<h1>Project Schedule — ${escapeHtml(projectName)}</h1>
<div class="sub">ANC Sports — LED Install Program</div>
</div>
<div class="content">
${metaRows ? `<div class="meta-row">${metaRows}</div>` : ''}
${sections || '<p style="color:#94a3b8">No scheduled tasks.</p>'}
</div>
<div class="footer"><span>ANC Sports — www.anc.com</span><span>Generated ${today}</span></div>
</body></html>`
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const result = await getProjectScheduleProjectLive(params.id)
    if (!result) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const project = result.project
    const tasks = await listProjectScheduleTasks(params.id)

    const meta: Record<string, string | null> = {
      'Install Onsite': fmt(project.installOnsite),
      'LED Ship Date': fmt(project.ledShipDate),
      'LED On Site': fmt(project.ledOnSite),
      'Substantial Completion': fmt(project.substantialCompletion),
      'Commissioning': fmt(project.commissioningDate),
      'PM': project.pm || null,
      'Phase': project.phase || null,
    }

    const html = buildHTML(project.project, meta, tasks)

    const pdfResponse = await fetch(`http://abc_browserless:3000/pdf?token=${process.env.BROWSERLESS_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: { format: 'Letter', landscape: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
        gotoOptions: { waitUntil: 'networkidle0' },
      }),
    })

    if (!pdfResponse.ok) return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const safeName = project.project.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `Project_Schedule_${safeName}_${new Date().toISOString().split('T')[0]}.pdf`

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error generating project schedule PDF:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}