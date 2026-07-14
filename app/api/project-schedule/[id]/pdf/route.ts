export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  getProjectScheduleProjectLive,
  listProjectScheduleTasks,
  type ProjectScheduleTask,
} from '@/lib/project-schedule'

/**
 * Construction-schedule PDF — the MS Project layout ANC's PMs already read
 * (Jesse, 7/14: "ideally the exported PDF looks a lot like the attached").
 *
 * Left: ID / Task Name / Duration / Start / Finish, summary rows bold with
 * their children indented. Right: a dated Gantt — month band over week ticks,
 * black tapered bars for summaries, blue bars for tasks, diamonds for
 * milestones, each labelled. Legend and title block match the source format.
 */

const DAY_MS = 86_400_000

// ── dates ────────────────────────────────────────────────────────────────────

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/)
  const d = m
    ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Thu 5/14/26" — the source format. */
function fmtProjectDate(value: string | null | undefined): string {
  const d = parseDate(value)
  if (!d) return ''
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]
  const yr = String(d.getUTCFullYear()).slice(2)
  return `${dow} ${d.getUTCMonth() + 1}/${d.getUTCDate()}/${yr}`
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS)
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS)
}

/** Working days, inclusive — how MS Project reports duration. */
function workingDays(start: Date, end: Date): number {
  let count = 0
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const dow = cursor.getUTCDay()
    if (dow !== 0 && dow !== 6) count += 1
  }
  return Math.max(count, 1)
}

function startOfWeek(d: Date): Date {
  return addDays(d, -d.getUTCDay())
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
}

function addMonths(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))
}

// ── row model ────────────────────────────────────────────────────────────────

type Row = {
  id: number
  name: string
  level: number          // 0 = project, 1 = summary, 2+ = task
  isSummary: boolean
  isProject: boolean
  isMilestone: boolean
  start: Date | null
  end: Date | null
  duration: number | null
  atRisk: boolean
}

function buildRows(projectName: string, tasks: ProjectScheduleTask[]): Row[] {
  const dated = tasks.filter((t) => parseDate(t.start))
  if (dated.length === 0) return []

  // Phases in start order — each becomes a summary row with its tasks beneath.
  const groups = new Map<string, ProjectScheduleTask[]>()
  for (const t of dated) {
    const phase = t.phase || 'Schedule'
    if (!groups.has(phase)) groups.set(phase, [])
    groups.get(phase)!.push(t)
  }
  const phaseOrder = Array.from(groups.keys()).sort((a, b) => {
    const aStart = Math.min(...groups.get(a)!.map((t) => parseDate(t.start)!.getTime()))
    const bStart = Math.min(...groups.get(b)!.map((t) => parseDate(t.start)!.getTime()))
    return aStart - bStart
  })

  const allStarts = dated.map((t) => parseDate(t.start)!.getTime())
  const allEnds = dated.map((t) => (parseDate(t.end) ?? parseDate(t.start)!).getTime())
  const projectStart = new Date(Math.min(...allStarts))
  const projectEnd = new Date(Math.max(...allEnds))

  const rows: Row[] = [
    {
      id: 1,
      name: projectName,
      level: 0,
      isSummary: true,
      isProject: true,
      isMilestone: false,
      start: projectStart,
      end: projectEnd,
      duration: workingDays(projectStart, projectEnd),
      atRisk: false,
    },
  ]

  let id = 2
  for (const phase of phaseOrder) {
    const items = groups
      .get(phase)!
      .slice()
      .sort(
        (a, b) =>
          (parseDate(a.start)!.getTime() - parseDate(b.start)!.getTime()) ||
          a.orderIndex - b.orderIndex
      )
    const phaseStart = new Date(Math.min(...items.map((t) => parseDate(t.start)!.getTime())))
    const phaseEnd = new Date(
      Math.max(...items.map((t) => (parseDate(t.end) ?? parseDate(t.start)!).getTime()))
    )

    rows.push({
      id: id++,
      name: phase,
      level: 1,
      isSummary: true,
      isProject: false,
      isMilestone: false,
      start: phaseStart,
      end: phaseEnd,
      duration: workingDays(phaseStart, phaseEnd),
      atRisk: false,
    })

    for (const t of items) {
      const start = parseDate(t.start)!
      const end = parseDate(t.end) ?? start
      const milestone = t.isMilestone || t.isSubmittalMilestone || end.getTime() === start.getTime()
      rows.push({
        id: id++,
        name: t.name,
        level: 2,
        isSummary: false,
        isProject: false,
        isMilestone: milestone,
        start,
        end,
        duration: t.duration ?? workingDays(start, end),
        atRisk: /at risk/i.test(t.name),
      })
    }
  }

  return rows
}

// ── html ─────────────────────────────────────────────────────────────────────

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const LEGEND: Array<[string, string]> = [
  ['Task', 'bar-task'],
  ['Summary', 'bar-summary'],
  ['Milestone', 'bar-milestone'],
  ['Project Summary', 'bar-project'],
  ['At Risk', 'bar-risk'],
  ['Progress', 'bar-progress'],
]

function buildHTML(
  projectName: string,
  subtitle: string,
  rows: Row[],
  today: string
): string {
  if (rows.length === 0) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page{size:letter landscape;margin:14px}
      body{font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#111}
    </style></head><body><p>No scheduled tasks with dates.</p></body></html>`
  }

  const chartStart = startOfWeek(rows[0].start!)
  const chartEnd = addDays(rows[0].end!, 7)
  const totalDays = Math.max(dayDiff(chartEnd, chartStart), 1)

  // Month band across the top of the timeline.
  const months: Array<{ label: string; leftPct: number; widthPct: number }> = []
  let cursor = startOfMonth(chartStart)
  while (cursor < chartEnd) {
    const next = addMonths(cursor, 1)
    const from = cursor < chartStart ? chartStart : cursor
    const to = next > chartEnd ? chartEnd : next
    const leftPct = (dayDiff(from, chartStart) / totalDays) * 100
    const widthPct = (dayDiff(to, from) / totalDays) * 100
    if (widthPct > 0) {
      months.push({
        label: `${from.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(from.getUTCFullYear()).slice(2)}`,
        leftPct,
        widthPct,
      })
    }
    cursor = next
  }

  // Week ticks — the numbered row under the months in the source.
  const weeks: Array<{ label: string; leftPct: number; widthPct: number }> = []
  for (let w = startOfWeek(chartStart); w < chartEnd; w = addDays(w, 7)) {
    const leftPct = (dayDiff(w, chartStart) / totalDays) * 100
    const widthPct = (7 / totalDays) * 100
    weeks.push({ label: String(w.getUTCDate()), leftPct, widthPct })
  }

  const bodyRows = rows
    .map((row) => {
      const start = row.start!
      const end = row.end ?? start
      const leftPct = (dayDiff(start, chartStart) / totalDays) * 100
      const spanDays = Math.max(dayDiff(end, start) + 1, 1)
      const widthPct = (spanDays / totalDays) * 100
      const labelLeft = leftPct + widthPct

      // A label that would run off the right edge flips to the left of its bar
      // (MS Project does the same) so nothing is clipped at the frame.
      const flipLabel = labelLeft > 78
      const labelHtml = (anchorLeft: number, anchorRight: number) =>
        flipLabel
          ? `<div class="bar-label flip" style="right:calc(${100 - anchorLeft}% + 6px)">${escapeHtml(row.name)}</div>`
          : `<div class="bar-label" style="left:calc(${anchorRight}% + 6px)">${escapeHtml(row.name)}</div>`

      let bar: string
      if (row.isMilestone) {
        bar = `<div class="milestone" style="left:calc(${leftPct}% - 4px)"></div>
               ${flipLabel
                 ? `<div class="bar-label flip" style="right:calc(${100 - leftPct}% + 8px)">${escapeHtml(row.name)}</div>`
                 : `<div class="bar-label" style="left:calc(${leftPct}% + 8px)">${escapeHtml(row.name)}</div>`}`
      } else if (row.isProject) {
        bar = `<div class="project-bar" style="left:${leftPct}%;width:${widthPct}%"></div>
               <div class="bar-label on-bar" style="left:${leftPct + widthPct / 2}%;transform:translateX(-50%)">${escapeHtml(row.name)}</div>`
      } else if (row.isSummary) {
        bar = `<div class="summary-bar" style="left:${leftPct}%;width:${widthPct}%"></div>
               ${labelHtml(leftPct, labelLeft)}`
      } else {
        bar = `<div class="task-bar ${row.atRisk ? 'risk' : ''}" style="left:${leftPct}%;width:${widthPct}%"></div>
               ${labelHtml(leftPct, labelLeft)}`
      }

      const nameClass = row.isProject
        ? 'name project'
        : row.isSummary
          ? 'name summary'
          : 'name'
      const rowClass = row.isProject ? 'r project' : row.isSummary ? 'r summary' : 'r'

      return `<tr class="${rowClass}">
        <td class="id">${row.id}</td>
        <td class="${nameClass}" style="padding-left:${6 + row.level * 12}px">${escapeHtml(row.name)}</td>
        <td class="num">${row.duration != null ? `${row.duration} days` : ''}</td>
        <td class="date">${fmtProjectDate(start.toISOString())}</td>
        <td class="date">${fmtProjectDate(end.toISOString())}</td>
        <td class="gantt"><div class="lane">${bar}</div></td>
      </tr>`
    })
    .join('')

  const monthBand = months
    .map((m) => `<div class="month" style="left:${m.leftPct}%;width:${m.widthPct}%">${m.label}</div>`)
    .join('')
  const weekBand = weeks
    .map((w) => `<div class="week" style="left:${w.leftPct}%;width:${w.widthPct}%">${w.label}</div>`)
    .join('')
  const gridLines = weeks
    .map((w) => `<div class="grid-line" style="left:${w.leftPct}%"></div>`)
    .join('')

  const legend = LEGEND.map(
    ([label, cls]) => `<span class="legend-item"><span class="swatch ${cls}"></span>${label}</span>`
  ).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
@page{size:letter landscape;margin:12px}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;color:#000;font-size:7.5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.frame{border:1px solid #000}
.title{text-align:center;padding:6px 0 4px;border-bottom:1px solid #000}
.title .t1{font-size:11px;font-weight:700}
.title .t2{font-size:9px;font-weight:600;margin-top:1px}
.title .t3{font-size:8.5px;font-style:italic;margin-top:1px}
table{width:100%;border-collapse:collapse;table-layout:fixed}
col.c-id{width:22px}col.c-name{width:172px}col.c-dur{width:52px}col.c-start{width:60px}col.c-finish{width:60px}
thead th{border:1px solid #000;background:#fff;font-size:7.5px;font-weight:700;text-align:left;padding:2px 4px;vertical-align:bottom}
thead th.head-gantt{padding:0;position:relative;height:24px}
.band{position:absolute;left:0;right:0;height:12px}
.band.m{top:0;border-bottom:1px solid #000}
.band.w{top:12px}
.month{position:absolute;top:0;height:12px;line-height:12px;text-align:center;font-size:7px;font-weight:700;border-right:1px solid #000;overflow:hidden}
.week{position:absolute;top:0;height:12px;line-height:12px;text-align:center;font-size:6px;font-weight:400;color:#333;border-right:1px solid #d9d9d9;overflow:hidden}
tbody td{border:1px solid #bfbfbf;padding:2px 4px;vertical-align:middle;height:16px}
tbody td.id{text-align:center;color:#333;font-size:7px}
tbody td.num,tbody td.date{white-space:nowrap;font-size:7px}
tbody td.name{overflow:hidden;text-overflow:ellipsis}
tr.summary td{font-weight:700;background:#f2f2f2}
tr.project td{font-weight:700;background:#cfe8ef}
td.gantt{padding:0;position:relative;border-left:1px solid #000}
.lane{position:relative;height:16px}
.grid-line{position:absolute;top:0;bottom:0;width:1px;background:#e8e8e8}
.task-bar{position:absolute;top:5px;height:7px;background:#9DC3E6;border:1px solid #6f9fcc}
.task-bar.risk{background:#F4B183;border-color:#c98a55}
.summary-bar{position:absolute;top:5px;height:5px;background:#000}
.project-bar{position:absolute;top:4px;height:8px;background:#1F4E79}
.milestone{position:absolute;top:4px;width:8px;height:8px;background:#000;transform:rotate(45deg)}
.bar-label{position:absolute;top:3px;font-size:6.5px;font-weight:700;white-space:nowrap;color:#000}
.bar-label.flip{text-align:right}
.bar-label.on-bar{color:#fff}
.legend{border-top:1px solid #000;padding:5px 8px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:7px}
.legend-item{display:inline-flex;align-items:center;gap:4px}
.swatch{display:inline-block;width:18px;height:6px}
.swatch.bar-task{background:#9DC3E6;border:1px solid #6f9fcc}
.swatch.bar-summary{background:#000;height:4px}
.swatch.bar-milestone{width:7px;height:7px;background:#000;transform:rotate(45deg)}
.swatch.bar-project{background:#1F4E79;height:7px}
.swatch.bar-risk{background:#F4B183;border:1px solid #c98a55}
.swatch.bar-progress{background:#0A52EF;height:3px}
.foot{border-top:1px solid #000;display:flex;justify-content:space-between;align-items:center;padding:4px 8px;font-size:7px}
.foot .mid{text-align:center;font-weight:700}
</style></head><body>
<div class="frame">
  <div class="title">
    <div class="t1">${escapeHtml(projectName)}</div>
    ${subtitle ? `<div class="t2">${escapeHtml(subtitle)}</div>` : ''}
    <div class="t3">Construction Schedule</div>
  </div>
  <table>
    <colgroup><col class="c-id"><col class="c-name"><col class="c-dur"><col class="c-start"><col class="c-finish"><col></colgroup>
    <thead>
      <tr>
        <th>ID</th><th>Task Name</th><th>Duration</th><th>Start</th><th>Finish</th>
        <th class="head-gantt">
          <div class="band m">${monthBand}</div>
          <div class="band w">${weekBand}</div>
        </th>
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="legend">${legend}</div>
  <div class="foot">
    <div><div>Project: ${escapeHtml(projectName)}</div><div>Date: ${today}</div></div>
    <div class="mid">ANC<div style="font-weight:400">Page 1</div></div>
    <div style="width:120px"></div>
  </div>
</div>
<script>
  // Draw the week grid behind the bars once layout is known.
  document.querySelectorAll('.lane').forEach((lane) => {
    lane.insertAdjacentHTML('afterbegin', ${JSON.stringify(gridLines)});
  });
</script>
</body></html>`
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const result = await getProjectScheduleProjectLive(params.id)
    if (!result) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    const project = result.project
    const tasks = await listProjectScheduleTasks(params.id)

    const rows = buildRows(project.project, tasks)
    const today = fmtProjectDate(new Date().toISOString())
    const html = buildHTML(project.project, project.phase || '', rows, today)

    const pdfResponse = await fetch(
      `http://abc_browserless:3000/pdf?token=${process.env.BROWSERLESS_TOKEN}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          options: {
            format: 'Letter',
            landscape: true,
            printBackground: true,
            margin: { top: '0', right: '0', bottom: '0', left: '0' },
          },
          gotoOptions: { waitUntil: 'networkidle0' },
        }),
      }
    )

    if (!pdfResponse.ok) return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const safeName = project.project.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `${safeName}_Schedule_${new Date().toISOString().split('T')[0]}.pdf`

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
