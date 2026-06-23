import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

const WORKBOOK_NAME = 'PM-Project Schedule_JV (2).xlsx'

export type ScheduleRisk = 'critical' | 'watch' | 'ready' | 'done'
export type DeploymentStatus = 'blocked' | 'needs-docs' | 'needs-update' | 'ready' | 'complete'
export type DeploymentDocumentStatus = 'ready' | 'watch' | 'missing'
export type SubmittalStatus = 'needed' | 'submitted' | 'returned' | 'approved'

export interface DeploymentDocument {
  key: string
  label: string
  status: DeploymentDocumentStatus
  detail: string
}

export interface DeploymentChecklistItem {
  label: string
  status: DeploymentDocumentStatus
  owner: string
}

export interface SubmittalRegisterItem {
  id: string
  projectId: string
  project: string
  submittalNo: string
  packageType: string
  title: string
  revision: string
  status: SubmittalStatus
  owner: string
  dueDate: string
  receivedDate: string
  latestRevision: boolean
  source: string
  documentStatus: DeploymentDocumentStatus
}

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
  deploymentStatus: DeploymentStatus
  deploymentDocuments: DeploymentDocument[]
  deploymentChecklist: DeploymentChecklistItem[]
  submittals: SubmittalRegisterItem[]
  documentGapCount: number
  submittalGapCount: number
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
  submittalRegister: SubmittalRegisterItem[]
  onsiteAssignments: OnsiteAssignment[]
  opportunities: OpportunityScheduleItem[]
  stats: {
    activeCount: number
    criticalCount: number
    watchCount: number
    readyCount: number
    next30Starts: number
    missingLedDates: number
    documentGaps: number
    submittalsNeeded: number
    submittalsApproved: number
    readyForInstall: number
    totalRevenue: number
    totalMargin: number
    marginPercent: number | null
  }
  pmLoad: Array<{ pm: string; count: number; critical: number; watch: number }>
  monthlyOnsite: Array<{ month: string; count: number; projects: string[] }>
  upcomingProjects: ActiveProject[]
  riskProjects: ActiveProject[]
  pipelineByStage: Array<{ stage: string; count: number }>
  meetingAgenda: {
    decisions: ActiveProject[]
    documentGaps: ActiveProject[]
    logistics: ActiveProject[]
    installWindow: ActiveProject[]
    submittals: SubmittalRegisterItem[]
  }
  filters: {
    pms: string[]
    phases: string[]
    deploymentStatuses: DeploymentStatus[]
    submittalStatuses: SubmittalStatus[]
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

function addDays(input: Date, days: number): Date {
  const next = new Date(input)
  next.setUTCDate(next.getUTCDate() + days)
  return next
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

function documentStatus(hasValue: boolean, nearInstall: boolean): DeploymentDocumentStatus {
  if (hasValue) return 'ready'
  return nearInstall ? 'missing' : 'watch'
}

function deriveDeploymentDocuments(project: Partial<ActiveProject>, installDate: Date | null): DeploymentDocument[] {
  const nearInstall = Boolean(installDate && daysUntil(installDate) <= 45)
  return [
    {
      key: 'led-specs',
      label: 'LED specs and drawings',
      status: documentStatus(Boolean(project.productSupplier || project.controlSystem), nearInstall),
      detail: project.productSupplier || project.controlSystem || 'Supplier/control package not listed',
    },
    {
      key: 'electrical',
      label: 'Electrical permit set',
      status: documentStatus(Boolean(project.electricalSub), nearInstall),
      detail: project.electricalSub || 'Electrical owner not listed',
    },
    {
      key: 'structural',
      label: 'Structural / install permit set',
      status: documentStatus(Boolean(project.installSub), nearInstall),
      detail: project.installSub || 'Install/structural owner not listed',
    },
    {
      key: 'rack-elevations',
      label: 'One-lines and rack elevations',
      status: documentStatus(Boolean(project.controlSystem || project.integrationManager), nearInstall),
      detail: project.integrationManager || project.controlSystem || 'Integration/control detail not listed',
    },
    {
      key: 'commissioning',
      label: 'Commissioning and closeout package',
      status: documentStatus(Boolean(project.commissioningDate || project.ancCommissioning), nearInstall),
      detail: project.commissioningDate || project.ancCommissioning || 'Commissioning detail not listed',
    },
  ]
}

function deriveDeploymentStatus(project: Partial<ActiveProject>, documents: DeploymentDocument[], risk: ScheduleRisk): DeploymentStatus {
  if (risk === 'done') return 'complete'
  if (risk === 'critical') return 'blocked'
  if (documents.some((item) => item.status === 'missing')) return 'needs-docs'
  if (risk === 'watch') return 'needs-update'
  return 'ready'
}

function deriveDeploymentChecklist(project: Partial<ActiveProject>, documents: DeploymentDocument[], actions: string[]): DeploymentChecklistItem[] {
  const owner = project.pm || 'PM'
  return [
    ...actions.slice(0, 4).map((action) => ({ label: action, status: 'watch' as DeploymentDocumentStatus, owner })),
    ...documents
      .filter((item) => item.status !== 'ready')
      .map((item) => ({ label: `Resolve ${item.label.toLowerCase()}`, status: item.status, owner })),
  ].slice(0, 7)
}

const submittalPackages: Record<string, { submittalNo: string; packageType: string; title: string; dueOffset: number }> = {
  'led-specs': {
    submittalNo: '005',
    packageType: 'LED specs / drawings',
    title: 'LED display specifications and drawings',
    dueOffset: -35,
  },
  electrical: {
    submittalNo: '002',
    packageType: 'Electrical permit set',
    title: 'Electrical engineering permit set',
    dueOffset: -42,
  },
  structural: {
    submittalNo: '003',
    packageType: 'Structural permit set',
    title: 'Structural engineering permit set',
    dueOffset: -42,
  },
  'rack-elevations': {
    submittalNo: '006',
    packageType: 'One-lines / rack elevations',
    title: 'One-line diagrams and rack elevations',
    dueOffset: -28,
  },
  commissioning: {
    submittalNo: '900',
    packageType: 'Commissioning / closeout',
    title: 'Commissioning and closeout package',
    dueOffset: -7,
  },
}

function submittalStatus(project: Partial<ActiveProject>, document: DeploymentDocument, risk: ScheduleRisk): SubmittalStatus {
  if (risk === 'done') return 'approved'
  if (document.status === 'missing') return 'needed'
  if (document.status === 'watch') return 'needed'
  if (/\bpunch|closeout|signoff|complete|done\b/i.test(`${project.notes ?? ''} ${project.substantialCompletion ?? ''}`)) return 'approved'
  if (/\brev|revision|change|coordination|inspection|outstanding\b/i.test(`${project.notes ?? ''}`)) return 'returned'
  return 'submitted'
}

function submittalRevision(status: SubmittalStatus, document: DeploymentDocument, project: Partial<ActiveProject>): string {
  if (status === 'needed') return 'Initial'
  if (status === 'approved') return document.key === 'commissioning' ? 'Closeout' : 'Rev2'
  if (status === 'returned') return 'Rev1'
  if (document.key === 'led-specs' && project.productSupplier) return 'Rev1'
  if (document.key === 'rack-elevations' && (project.controlSystem || project.integrationManager)) return 'Rev1'
  return 'Initial'
}

function submittalOwner(project: Partial<ActiveProject>, document: DeploymentDocument): string {
  if (document.key === 'electrical') return project.electricalSub || project.pm || 'Electrical owner'
  if (document.key === 'structural') return project.installSub || project.pm || 'Install owner'
  if (document.key === 'rack-elevations') return project.integrationManager || project.controlSystem || project.pm || 'Integration owner'
  if (document.key === 'led-specs') return project.productSupplier || project.pm || 'Product owner'
  return project.ancCommissioning || project.pm || 'PM'
}

function deriveSubmittals(
  project: Partial<ActiveProject>,
  documents: DeploymentDocument[],
  installDate: Date | null,
  risk: ScheduleRisk,
): SubmittalRegisterItem[] {
  const projectId = project.id || slugify(project.project || 'project')
  return documents.map((document) => {
    const template = submittalPackages[document.key] ?? {
      submittalNo: 'TBD',
      packageType: document.label,
      title: document.label,
      dueOffset: -30,
    }
    const status = submittalStatus(project, document, risk)
    const dueDate = installDate ? formatDate(addDays(installDate, template.dueOffset)) : 'Set after install window'
    const receivedDate = status === 'needed'
      ? ''
      : status === 'approved'
        ? (project.commissioningDate || project.substantialCompletion || project.ledOnSite || '')
        : (project.ledOnSite || project.ledShipDate || project.installOnsite || '')

    return {
      id: `${projectId}-${document.key}`,
      projectId,
      project: project.project || 'Unnamed project',
      submittalNo: template.submittalNo,
      packageType: template.packageType,
      title: template.title,
      revision: submittalRevision(status, document, project),
      status,
      owner: submittalOwner(project, document),
      dueDate,
      receivedDate,
      latestRevision: true,
      source: document.detail,
      documentStatus: document.status,
    }
  })
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
      const deploymentDocuments = deriveDeploymentDocuments(base, installDate)
      const nextActions = deriveNextActions(base, installDate, completionDate, risk.reasons)
      const deploymentStatus = deriveDeploymentStatus(base, deploymentDocuments, risk.risk)
      const submittals = deriveSubmittals(base, deploymentDocuments, installDate, risk.risk)
      return {
        ...base,
        risk: risk.risk,
        riskReasons: risk.reasons,
        phase,
        deploymentStatus,
        deploymentDocuments,
        deploymentChecklist: deriveDeploymentChecklist(base, deploymentDocuments, nextActions),
        submittals,
        documentGapCount: deploymentDocuments.filter((item) => item.status !== 'ready').length,
        submittalGapCount: submittals.filter((item) => item.status === 'needed' || item.status === 'returned').length,
        nextActions,
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
  const submittalRegister = activeProjects.flatMap((project) => project.submittals)
  const onsiteAssignments = parseOnsiteAssignments(readRows(workbook, 'On-Site PM Schedule (JOE)'))
  const opportunities = parseOpportunities(readRows(workbook, 'Sheet1'))
  const riskProjects = activeProjects.filter((project) => project.risk === 'critical' || project.risk === 'watch')
  const upcomingProjects = activeProjects
    .filter((project) => project.nextDate)
    .sort((a, b) => new Date(a.nextDate || '').getTime() - new Date(b.nextDate || '').getTime())
    .slice(0, 10)
  const meetingAgenda = {
    decisions: activeProjects
      .filter((project) => project.deploymentStatus === 'blocked' || project.nextActions.some((action) => /capture|assign|set|update/i.test(action)))
      .slice(0, 8),
    documentGaps: activeProjects
      .filter((project) => project.documentGapCount > 0 && project.deploymentStatus !== 'complete')
      .sort((a, b) => b.documentGapCount - a.documentGapCount)
      .slice(0, 8),
    logistics: activeProjects
      .filter((project) => !project.ledShipDate && !project.ledOnSite && project.deploymentStatus !== 'complete')
      .slice(0, 8),
    installWindow: activeProjects
      .filter((project) => {
        const date = coerceDate(project.installOnsite)
        return date ? daysUntil(date) >= -7 && daysUntil(date) <= 30 : false
      })
      .slice(0, 8),
    submittals: submittalRegister
      .filter((item) => item.status === 'needed' || item.status === 'returned')
      .sort((a, b) => {
        const aDate = coerceDate(a.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
        const bDate = coerceDate(b.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
        return aDate - bDate
      })
      .slice(0, 10),
  }

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
    submittalRegister,
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
      documentGaps: activeProjects.reduce((count, project) => count + project.documentGapCount, 0),
      submittalsNeeded: submittalRegister.filter((item) => item.status === 'needed' || item.status === 'returned').length,
      submittalsApproved: submittalRegister.filter((item) => item.status === 'approved').length,
      readyForInstall: activeProjects.filter((project) => project.deploymentStatus === 'ready').length,
      totalRevenue: totals.revenue,
      totalMargin: totals.margin,
      marginPercent: totals.revenue > 0 ? Math.round((totals.margin / totals.revenue) * 1000) / 10 : null,
    },
    pmLoad: buildPmLoad(activeProjects),
    monthlyOnsite: buildMonthlyOnsite(onsiteAssignments),
    upcomingProjects,
    riskProjects,
    pipelineByStage: buildPipelineByStage(opportunities),
    meetingAgenda,
    filters: {
      pms: Array.from(new Set(activeProjects.flatMap((project) => project.pmList.length ? project.pmList : ['Unassigned']))).sort(),
      phases: Array.from(new Set(activeProjects.map((project) => project.phase))).sort(),
      deploymentStatuses: Array.from(new Set(activeProjects.map((project) => project.deploymentStatus))).sort() as DeploymentStatus[],
      submittalStatuses: Array.from(new Set(submittalRegister.map((item) => item.status))).sort() as SubmittalStatus[],
    },
  }
}

export function getProjectScheduleProject(projectId: string) {
  const data = getProjectScheduleInsights()
  const project = data.activeProjects.find((item) => item.id === projectId)
  if (!project) return null
  const normalized = project.project.toLowerCase()
  const onsiteAssignments = data.onsiteAssignments.filter((assignment) => {
    const source = assignment.project.toLowerCase()
    return source.includes(normalized.slice(0, 16)) || normalized.includes(source.slice(0, 16))
  })
  const opportunities = data.opportunities.filter((item) => {
    const text = `${item.account} ${item.opportunity}`.toLowerCase()
    return normalized.split(/\s+/).filter((part) => part.length > 3).some((part) => text.includes(part))
  }).slice(0, 6)
  return { data, project, onsiteAssignments, opportunities }
}
