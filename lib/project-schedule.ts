import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

const WORKBOOK_NAME = 'PM-Project Schedule_JV (2).xlsx'

export type ScheduleRisk = 'critical' | 'watch' | 'ready' | 'done'

export interface ActiveProject {
  id: string
  project: string
  pm: string
  pmList: string[]
  notes: string
  installOnsite: string
  substantialCompletion: string
  controlSystem: string
  productSupplier: string
  ledShipDate: string
  shippingMethod: string
  ledOnSite: string
  integrationManager: string
  integrationSub: string
  commissioningDate: string
  ancCommissioning: string
  installSub: string
  electricalSub: string
  risk: ScheduleRisk
  riskReasons: string[]
  phase: string
  nextActions: string[]
  nextDate: string | null
  nextDateLabel: string | null
}

export interface OnsiteAssignment {
  project: string
  month: string
  week: string
  assignment: string
  revenue: number | null
  margin: number | null
  integration: string
}

export interface OpportunityScheduleItem {
  stage: string
  account: string
  opportunity: string
  vendor: string
  awardDate: string
  estimatedStart: string
  estimatedCompletion: string
  substantialCompletion: string
}

export interface ProjectScheduleInsights {
  sourceFile: string
  generatedAt: string
  activeProjects: ActiveProject[]
  onsiteAssignments: OnsiteAssignment[]
  opportunities: OpportunityScheduleItem[]
  stats: {
    activeCount: number
    criticalCount: number
    watchCount: number
    readyCount: number
    next30Starts: number
    missingLedDates: number
    totalRevenue: number
    totalMargin: number
    marginPercent: number | null
  }
  pmLoad: Array<{ pm: string; count: number; critical: number; watch: number }>
  monthlyOnsite: Array<{ month: string; count: number; projects: string[] }>
  upcomingProjects: ActiveProject[]
  riskProjects: ActiveProject[]
  pipelineByStage: Array<{ stage: string; count: number }>
  filters: {
    pms: string[]
    phases: string[]
  }
}

type SheetRow = unknown[]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function workbookPath() {
  return path.join(process.cwd(), WORKBOOK_NAME)
}

function readRows(workbook: XLSX.WorkBook, sheetName: string): SheetRow[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as SheetRow[]
}

function value(row: SheetRow, index: number) {
  return row[index] ?? null
}

function cleanText(input: unknown): string {
  if (input === null || input === undefined) return ''
  if (input instanceof Date) return formatDate(input)
  return String(input).replace(/\s+/g, ' ').trim()
}

function asNumber(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) return input
  if (typeof input !== 'string') return null
  const parsed = Number(input.replace(/[$,]/g, '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 60000) return null
  const utcDays = Math.floor(serial - 25569)
  const utcValue = utcDays * 86400
  return new Date(utcValue * 1000)
}

function coerceDate(input: unknown): Date | null {
  if (input instanceof Date && !Number.isNaN(input.getTime())) return input
  if (typeof input === 'number') return excelSerialToDate(input)
  if (typeof input !== 'string') return null

  const trimmed = input.trim()
  if (!trimmed || /^(tbd|done|punch|now|onsite|en route|in transit|in stock)$/i.test(trimmed)) return null

  const explicit = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/)
  if (explicit) {
    const year = explicit[3].length === 2 ? 2000 + Number(explicit[3]) : Number(explicit[3])
    return new Date(year, Number(explicit[1]) - 1, Number(explicit[2]))
  }

  const shortDate = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\b/)
  if (shortDate) return new Date(2026, Number(shortDate[1]) - 1, Number(shortDate[2]))

  const parsed = new Date(trimmed)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(input: Date): string {
  return input.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function displayDate(input: unknown): string {
  const date = coerceDate(input)
  return date ? formatDate(date) : cleanText(input)
}

function daysUntil(input: Date, from = new Date('2026-06-23T00:00:00Z')) {
  return Math.ceil((input.getTime() - from.getTime()) / (24 * 60 * 60 * 1000))
}

function splitPeople(input: string): string[] {
  return input
    .split(/\/|,|&|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function classifyPhase(project: Partial<ActiveProject>, installDate: Date | null, completionDate: Date | null): string {
  const text = `${project.project ?? ''} ${project.notes ?? ''} ${project.installOnsite ?? ''} ${project.substantialCompletion ?? ''} ${project.ledShipDate ?? ''} ${project.ledOnSite ?? ''}`.toLowerCase()
  if (/\bdone\b|\bcomplete\b/.test(text)) return 'Complete'
  if (/\bpunch|closeout|signoff|training|docs?\b/.test(text)) return 'Closeout'
  if (/\bonsite|install ongoing|now\b/.test(text)) return 'On site'
  if (installDate) {
    const delta = daysUntil(installDate)
    if (delta >= -14 && delta <= 30) return 'Install window'
  }
  if (/\ben route|in transit|ordered|ship|delivery|stock\b/.test(text) || project.ledShipDate || project.ledOnSite) return 'Logistics'
  if (/\bawaiting|pricing|contract|coordination|electrical|engineering|submittal|kickoff|asap\b/.test(text)) return 'Coordination'
  if (completionDate && daysUntil(completionDate) > 60) return 'Planning'
  return 'Planning'
}

function deriveNextActions(project: Partial<ActiveProject>, installDate: Date | null, completionDate: Date | null, riskReasons: string[]): string[] {
  const actions = new Set<string>()
  const text = `${project.notes ?? ''} ${project.installOnsite ?? ''} ${project.substantialCompletion ?? ''}`.toLowerCase()

  if (!project.pm) actions.add('Assign PM owner')
  if (!project.installOnsite) actions.add('Set install window')
  if (!project.ledShipDate && !project.ledOnSite && installDate && daysUntil(installDate) <= 45) actions.add('Confirm LED ship and on-site dates')
  if (!project.commissioningDate && installDate && daysUntil(installDate) <= 45) actions.add('Schedule commissioning coverage')
  if (/awaiting|pricing|asap|contract|coordination|electrical|inspection|outstanding|change/.test(text)) actions.add('Capture latest PM update')
  if (completionDate && daysUntil(completionDate) < 0 && !/\bdone\b|\bcomplete\b/.test(text)) actions.add('Update completion or closeout status')
  if (riskReasons.some((reason) => reason.includes('Install starts'))) actions.add('Confirm site readiness')

  if (actions.size === 0) actions.add('Review at next PM sync')
  return Array.from(actions)
}

function classifyRisk(project: Partial<ActiveProject>, installDate: Date | null, completionDate: Date | null): { risk: ScheduleRisk; reasons: string[] } {
  const haystack = `${project.project ?? ''} ${project.notes ?? ''} ${project.installOnsite ?? ''} ${project.substantialCompletion ?? ''} ${project.ledShipDate ?? ''}`.toLowerCase()
  const reasons: string[] = []

  if (/\bdone\b|\bcomplete\b/.test(haystack)) return { risk: 'done', reasons: ['Marked done or complete'] }

  if (/\b(tbd|on hold|awaiting|outstanding|asap|pricing|contract|change|coordination|inspection|punch)\b/.test(haystack)) {
    reasons.push('Needs PM follow-up')
  }

  if (!project.ledShipDate && !project.ledOnSite && installDate && daysUntil(installDate) <= 45) {
    reasons.push('LED logistics not confirmed')
  }

  if (installDate) {
    const delta = daysUntil(installDate)
    if (delta < 0) reasons.push('Install date is in flight or past')
    if (delta >= 0 && delta <= 21) reasons.push('Install starts within 21 days')
  }

  if (completionDate && daysUntil(completionDate) < 0) {
    reasons.push('Substantial completion date is past')
  }

  if (reasons.length >= 2) return { risk: 'critical', reasons }
  if (reasons.length === 1) return { risk: 'watch', reasons }
  return { risk: 'ready', reasons: ['Schedule fields look usable'] }
}

function getNextMilestone(row: SheetRow): { nextDate: string | null; nextDateLabel: string | null } {
  const milestones = [
    { label: 'Install onsite', date: coerceDate(value(row, 3)) },
    { label: 'LED ship', date: coerceDate(value(row, 7)) },
    { label: 'LED on-site', date: coerceDate(value(row, 9)) },
    { label: 'Commissioning', date: coerceDate(value(row, 12)) },
    { label: 'Substantial completion', date: coerceDate(value(row, 4)) },
  ]
    .filter((item): item is { label: string; date: Date } => Boolean(item.date))
    .sort((a, b) => Math.abs(daysUntil(a.date)) - Math.abs(daysUntil(b.date)))

  if (!milestones[0]) return { nextDate: null, nextDateLabel: null }
  return { nextDate: formatDate(milestones[0].date), nextDateLabel: milestones[0].label }
}

function parseActiveProjects(rows: SheetRow[]): ActiveProject[] {
  return rows.slice(1)
    .map((row) => {
      const project = cleanText(value(row, 0))
      if (!project) return null

      const installDate = coerceDate(value(row, 3))
      const completionDate = coerceDate(value(row, 4))
      const base: Partial<ActiveProject> = {
        id: slugify(project),
        project,
        pm: cleanText(value(row, 1)),
        pmList: splitPeople(cleanText(value(row, 1))),
        notes: cleanText(value(row, 2)),
        installOnsite: displayDate(value(row, 3)),
        substantialCompletion: displayDate(value(row, 4)),
        controlSystem: cleanText(value(row, 5)),
        productSupplier: cleanText(value(row, 6)),
        ledShipDate: displayDate(value(row, 7)),
        shippingMethod: cleanText(value(row, 8)),
        ledOnSite: displayDate(value(row, 9)),
        integrationManager: cleanText(value(row, 10)),
        integrationSub: cleanText(value(row, 11)),
        commissioningDate: displayDate(value(row, 12)),
        ancCommissioning: cleanText(value(row, 13)),
        installSub: cleanText(value(row, 16)),
        electricalSub: cleanText(value(row, 17)),
      }
      const risk = classifyRisk(base, installDate, completionDate)
      const phase = classifyPhase(base, installDate, completionDate)
      return {
        ...base,
        risk: risk.risk,
        riskReasons: risk.reasons,
        phase,
        nextActions: deriveNextActions(base, installDate, completionDate, risk.reasons),
        ...getNextMilestone(row),
      } as ActiveProject
    })
    .filter((project): project is ActiveProject => Boolean(project))
}

function parseOnsiteAssignments(rows: SheetRow[]): OnsiteAssignment[] {
  const monthsByColumn: Record<number, string> = {}
  let activeMonth = ''

  rows[0]?.forEach((cell, index) => {
    const text = cleanText(cell)
    if (MONTHS.includes(text)) activeMonth = text
    if (activeMonth && index >= 6) monthsByColumn[index] = activeMonth
  })

  return rows.slice(3).flatMap((row) => {
    const project = cleanText(value(row, 0))
    if (!project) return []
    const revenue = asNumber(value(row, 1))
    const margin = asNumber(value(row, 2))
    const integration = cleanText(value(row, 4))

    return row.slice(6, 50).map((cell, offset) => {
      const assignment = cleanText(cell)
      if (!assignment) return null
      const column = offset + 6
      return {
        project,
        month: monthsByColumn[column] || 'Unscheduled',
        week: cleanText(value(rows[1], column)),
        assignment,
        revenue,
        margin,
        integration,
      }
    }).filter((item): item is OnsiteAssignment => Boolean(item))
  })
}

function parseOpportunities(rows: SheetRow[]): OpportunityScheduleItem[] {
  let stage = ''
  return rows.slice(4)
    .map((row) => {
      const stageCell = cleanText(value(row, 1))
      if (stageCell && !/^subtotal$/i.test(stageCell)) stage = stageCell
      const account = cleanText(value(row, 3))
      const opportunity = cleanText(value(row, 4))
      if (!account || !opportunity) return null
      return {
        stage: stage || 'Unstaged',
        account,
        opportunity,
        awardDate: displayDate(value(row, 5)),
        estimatedStart: displayDate(value(row, 6)),
        estimatedCompletion: displayDate(value(row, 7)),
        vendor: cleanText(value(row, 8)),
        substantialCompletion: displayDate(value(row, 9)),
      }
    })
    .filter((item): item is OpportunityScheduleItem => Boolean(item))
}

function buildPmLoad(projects: ActiveProject[]) {
  const load = new Map<string, { pm: string; count: number; critical: number; watch: number }>()
  projects.forEach((project) => {
    const people = splitPeople(project.pm || 'Unassigned')
    people.forEach((pm) => {
      const current = load.get(pm) ?? { pm, count: 0, critical: 0, watch: 0 }
      current.count += 1
      if (project.risk === 'critical') current.critical += 1
      if (project.risk === 'watch') current.watch += 1
      load.set(pm, current)
    })
  })
  return Array.from(load.values()).sort((a, b) => b.count - a.count || b.critical - a.critical)
}

function buildMonthlyOnsite(assignments: OnsiteAssignment[]) {
  const grouped = new Map<string, Set<string>>()
  assignments.forEach((assignment) => {
    if (!grouped.has(assignment.month)) grouped.set(assignment.month, new Set())
    grouped.get(assignment.month)?.add(assignment.project)
  })
  return MONTHS
    .filter((month) => grouped.has(month))
    .map((month) => {
      const projects = Array.from(grouped.get(month) ?? []).sort()
      return { month, count: projects.length, projects }
    })
}

function buildPipelineByStage(items: OpportunityScheduleItem[]) {
  const counts = new Map<string, number>()
  items.forEach((item) => counts.set(item.stage, (counts.get(item.stage) ?? 0) + 1))
  return Array.from(counts.entries())
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)
}

export function getProjectScheduleInsights(): ProjectScheduleInsights {
  const filePath = workbookPath()
  if (!fs.existsSync(filePath)) {
    throw new Error(`Project schedule workbook not found: ${filePath}`)
  }

  const workbook = XLSX.read(fs.readFileSync(filePath), { cellDates: true })
  const activeProjects = parseActiveProjects(readRows(workbook, 'Active Projects'))
  const onsiteAssignments = parseOnsiteAssignments(readRows(workbook, 'On-Site PM Schedule (JOE)'))
  const opportunities = parseOpportunities(readRows(workbook, 'Sheet1'))
  const riskProjects = activeProjects.filter((project) => project.risk === 'critical' || project.risk === 'watch')
  const upcomingProjects = activeProjects
    .filter((project) => project.nextDate)
    .sort((a, b) => new Date(a.nextDate || '').getTime() - new Date(b.nextDate || '').getTime())
    .slice(0, 10)

  const revenueByProject = new Map<string, { revenue: number | null; margin: number | null }>()
  onsiteAssignments.forEach((assignment) => {
    if (!revenueByProject.has(assignment.project)) {
      revenueByProject.set(assignment.project, { revenue: assignment.revenue, margin: assignment.margin })
    }
  })
  const totals = Array.from(revenueByProject.values()).reduce<{ revenue: number; margin: number }>(
    (acc, item) => ({
      revenue: acc.revenue + (item.revenue ?? 0),
      margin: acc.margin + (item.margin ?? 0),
    }),
    { revenue: 0, margin: 0 },
  )

  return {
    sourceFile: WORKBOOK_NAME,
    generatedAt: new Date().toISOString(),
    activeProjects,
    onsiteAssignments,
    opportunities,
    stats: {
      activeCount: activeProjects.length,
      criticalCount: activeProjects.filter((project) => project.risk === 'critical').length,
      watchCount: activeProjects.filter((project) => project.risk === 'watch').length,
      readyCount: activeProjects.filter((project) => project.risk === 'ready').length,
      next30Starts: activeProjects.filter((project) => {
        const date = coerceDate(project.installOnsite)
        return date ? daysUntil(date) >= 0 && daysUntil(date) <= 30 : false
      }).length,
      missingLedDates: activeProjects.filter((project) => !project.ledShipDate && !project.ledOnSite).length,
      totalRevenue: totals.revenue,
      totalMargin: totals.margin,
      marginPercent: totals.revenue > 0 ? Math.round((totals.margin / totals.revenue) * 1000) / 10 : null,
    },
    pmLoad: buildPmLoad(activeProjects),
    monthlyOnsite: buildMonthlyOnsite(onsiteAssignments),
    upcomingProjects,
    riskProjects,
    pipelineByStage: buildPipelineByStage(opportunities),
    filters: {
      pms: Array.from(new Set(activeProjects.flatMap((project) => project.pmList.length ? project.pmList : ['Unassigned']))).sort(),
      phases: Array.from(new Set(activeProjects.map((project) => project.phase))).sort(),
    },
  }
}
