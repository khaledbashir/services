import { getProjectScheduleInsightsLive, type ActiveProject, type ProjectScheduleInsights } from '@/lib/project-schedule'
import type { Skill } from '@/lib/ai/types'

const statusLabels: Record<string, string> = {
  needed: 'Needed',
  returned: 'Returned',
  submitted: 'Submitted',
  approved: 'Approved',
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(1, Math.min(25, Math.floor(parsed))) : fallback
}

function projectUrl(projectId: string) {
  return `/project-schedule/${projectId}`
}

function projectLine(project: ActiveProject) {
  return `- **${project.project}** — ${project.phase} · ${project.pm || 'Unassigned'} · ${project.deploymentStatus} · ${project.nextDateLabel || 'Next'} ${project.nextDate || 'not set'} · [open ->](${projectUrl(project.id)})`
}

function resolveProject(data: ProjectScheduleInsights, input: string) {
  const q = input.trim().toLowerCase()
  if (!q) return null
  return data.activeProjects.find((item) => item.id === q)
    || data.activeProjects.find((item) => item.project.toLowerCase() === q)
    || data.activeProjects.find((item) => item.project.toLowerCase().includes(q))
    || null
}

async function summarizeProject(projectId: string) {
  const data = await getProjectScheduleInsightsLive()
  const project = resolveProject(data, projectId)
  if (!project) {
    return {
      text_summary: `Project not found: ${projectId}`,
      markdown: `I could not find a project matching \`${projectId}\` in the current schedule.`,
    }
  }

  const gaps = project.submittals.filter((item) => item.status === 'needed' || item.status === 'returned')
  const markdown = [
    `## ${project.project}`,
    `- **Status:** ${project.deploymentStatus}`,
    `- **Phase:** ${project.phase}`,
    `- **PM:** ${project.pm || 'Unassigned'}`,
    `- **Install:** ${project.installOnsite || 'Not set'}`,
    `- **Submittal gaps:** ${project.submittalGapCount}`,
    '',
    gaps.length
      ? [
        '### Package gaps',
        ...gaps.map((item) => `- **${item.submittalNo} ${item.packageType}:** ${statusLabels[item.status]} · ${item.revision} · owner ${item.owner || 'unassigned'} · due ${item.dueDate}`),
      ].join('\n')
      : '### Package gaps\n- No active package gaps on the current workbook read.',
    '',
    '### Next practical moves',
    ...project.nextActions.slice(0, 5).map((action) => `- ${action}`),
    '',
    `[Open project →](${projectUrl(project.id)})`,
  ].join('\n')

  return {
    text_summary: `${project.project}: ${project.submittalGapCount} submittal gaps · ${project.deploymentStatus}`,
    markdown,
    project,
  }
}

async function summarizeOverview() {
  const data = await getProjectScheduleInsightsLive()
  const markdown = [
    '## Project schedule overview',
    `- **Active projects:** ${data.stats.activeCount}`,
    `- **Needs attention:** ${data.stats.criticalCount}`,
    `- **Watch:** ${data.stats.watchCount}`,
    `- **Ready packages:** ${data.stats.readyForInstall}`,
    `- **Submittal blockers:** ${data.stats.submittalsNeeded}`,
    `- **Installs starting in 30 days:** ${data.stats.next30Starts}`,
    '',
    '### Next milestones',
    ...data.upcomingProjects.slice(0, 8).map(projectLine),
    '',
    '[Open Project Schedule ->](/project-schedule)',
  ].join('\n')
  return { text_summary: `${data.stats.activeCount} active projects, ${data.stats.criticalCount} needing attention`, markdown, stats: data.stats }
}

async function summarizeRisk() {
  const data = await getProjectScheduleInsightsLive()
  const projects = data.riskProjects.slice(0, 12)
  const markdown = [
    '## Projects at risk',
    `- **Needs attention:** ${data.stats.criticalCount}`,
    `- **Watch:** ${data.stats.watchCount}`,
    '',
    projects.length ? '### Risk list' : '### Risk list\n- No risk projects found.',
    ...projects.map((project) => [
      projectLine(project),
      `  - ${project.riskReasons.join('; ')}`,
      `  - Next action: ${project.nextActions[0]}`,
    ].join('\n')),
  ].join('\n')
  return { text_summary: `${projects.length} risk projects returned`, markdown, projects }
}

async function summarizeWorkload(args: Record<string, unknown>) {
  const data = await getProjectScheduleInsightsLive()
  const pmQuery = typeof args.pm === 'string' ? args.pm.trim().toLowerCase() : ''
  const loads = pmQuery ? data.pmLoad.filter((item) => item.pm.toLowerCase().includes(pmQuery)) : data.pmLoad
  const markdown = [
    pmQuery ? `## PM workload: ${args.pm}` : '## PM workload',
    '',
    ...loads.slice(0, 12).map((pm) => {
      const projects = data.activeProjects
        .filter((project) => project.pmList.includes(pm.pm) || (pm.pm === 'Unassigned' && project.pmList.length === 0))
        .slice(0, 8)
      return [
        `### ${pm.pm} — ${pm.count} projects`,
        `- **Needs attention:** ${pm.critical}`,
        `- **Watch:** ${pm.watch}`,
        ...projects.map(projectLine),
      ].join('\n')
    }),
  ].join('\n\n')
  return { text_summary: `${loads[0]?.pm || 'PM'} is carrying ${loads[0]?.count || 0} projects`, markdown, workload: loads }
}

async function summarizeRegister(args: Record<string, unknown>) {
  const data = await getProjectScheduleInsightsLive()
  const status = typeof args.status === 'string' ? args.status : ''
  const limit = asNumber(args.limit, 10)
  const rows = data.submittalRegister
    .filter((item) => !status || item.status === status)
    .sort((a, b) => {
      const priority: Record<string, number> = { returned: 0, needed: 1, submitted: 2, approved: 3 }
      return (priority[a.status] ?? 9) - (priority[b.status] ?? 9) || a.project.localeCompare(b.project)
    })
    .slice(0, limit)

  const markdown = [
    '## Submittal register',
    `- **Active projects:** ${data.stats.activeCount}`,
    `- **Needed/returned:** ${data.stats.submittalsNeeded}`,
    `- **Approved rows:** ${data.stats.submittalsApproved}`,
    `- **Ready packages:** ${data.stats.readyForInstall}`,
    '',
    rows.length
      ? [
        '### Top rows',
        ...rows.map((item) => `- **${item.project}** — ${item.submittalNo} ${item.packageType}: ${statusLabels[item.status]} · ${item.revision} · ${item.owner || 'unassigned'} · due ${item.dueDate} · [open →](${projectUrl(item.projectId)})`),
      ].join('\n')
      : '### Top rows\n- No register rows matched that filter.',
    '',
    '### How to run this pragmatically',
    '- Start each PM sync from **Needed** and **Returned** submittals.',
    '- Confirm the owner and due date before discussing general schedule status.',
    '- Treat install windows inside 30 days as escalation candidates if package rows are still needed.',
    '- Use the project detail page as the job packet: register first, then checklist, then team/logistics.',
  ].join('\n')

  return {
    text_summary: `${rows.length} submittal register rows returned`,
    markdown,
    stats: data.stats,
    rows,
  }
}

async function summarizeAgenda() {
  const data = await getProjectScheduleInsightsLive()
  const markdown = [
    '## PM sync agenda',
    '',
    '### 1. Submittal blockers',
    ...data.meetingAgenda.submittals.slice(0, 6).map((item) => `- **${item.project}** — ${item.submittalNo} ${item.packageType}: ${statusLabels[item.status]} · owner ${item.owner || 'unassigned'} · due ${item.dueDate}`),
    '',
    '### 2. Decisions',
    ...data.meetingAgenda.decisions.slice(0, 5).map((project) => `- **${project.project}:** ${project.nextActions[0]} · [open →](${projectUrl(project.id)})`),
    '',
    '### 3. Logistics watch',
    ...data.meetingAgenda.logistics.slice(0, 5).map((project) => `- **${project.project}:** confirm ship/on-site dates · [open →](${projectUrl(project.id)})`),
    '',
    '### 4. Install window',
    ...data.meetingAgenda.installWindow.slice(0, 5).map((project) => `- **${project.project}:** install ${project.installOnsite || 'not set'} · ${project.deploymentStatus}`),
  ].join('\n')

  return {
    text_summary: `PM agenda: ${data.meetingAgenda.submittals.length} submittal blockers and ${data.meetingAgenda.decisions.length} decisions`,
    markdown,
  }
}

async function summarizeInstallReadiness() {
  const data = await getProjectScheduleInsightsLive()
  const projects = data.activeProjects
    .filter((project) => project.deploymentStatus !== 'complete')
    .map((project) => ({
      project,
      blockers: [
        ...project.submittals
          .filter((item) => item.status === 'needed' || item.status === 'returned')
          .map((item) => `${item.submittalNo} ${item.packageType} ${statusLabels[item.status]}`),
        !project.ledShipDate && !project.ledOnSite ? 'LED logistics not confirmed' : '',
        !project.installOnsite ? 'Install window not set' : '',
      ].filter(Boolean),
    }))
    .filter((item) => item.blockers.length > 0)
    .sort((a, b) => b.blockers.length - a.blockers.length || a.project.project.localeCompare(b.project.project))
    .slice(0, 8)

  const markdown = [
    '## Install readiness scan',
    `- **Projects scanned:** ${data.stats.activeCount}`,
    `- **Submittal gaps:** ${data.stats.submittalsNeeded}`,
    `- **Ready packages:** ${data.stats.readyForInstall}`,
    '',
    projects.length
      ? [
        '### Watch list',
        ...projects.map(({ project, blockers }) => [
          `- **${project.project}** — ${project.phase} · ${project.pm || 'Unassigned'} · [open →](${projectUrl(project.id)})`,
          `  - ${blockers.slice(0, 4).join('; ')}`,
          `  - Next action: ${project.nextActions[0]}`,
        ].join('\n')),
      ].join('\n')
      : '### Watch list\n- No install-readiness blockers found in the current workbook read.',
    '',
    '### Leadership readout',
    '- The system is turning a static schedule into an exception list.',
    '- It separates normal schedule tracking from package blockers that can actually delay install.',
    '- The next build should attach real files/revisions to each row so this becomes the working source of truth.',
  ].join('\n')

  return {
    text_summary: `Install readiness: ${projects.length} projects with blockers`,
    markdown,
    projects,
  }
}

async function summarizeDeploymentBreakdown() {
  const data = await getProjectScheduleInsightsLive()
  const counts = data.activeProjects.reduce<Record<string, ActiveProject[]>>((acc, project) => {
    if (!acc[project.deploymentStatus]) acc[project.deploymentStatus] = []
    acc[project.deploymentStatus].push(project)
    return acc
  }, {})
  const markdown = [
    '## Deployment status breakdown',
    ...Object.entries(counts).map(([status, projects]) => [
      `### ${status} — ${projects.length}`,
      ...projects.slice(0, 6).map(projectLine),
    ].join('\n')),
  ].join('\n\n')
  return { text_summary: `${Object.keys(counts).length} deployment statuses represented`, markdown, counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.length])) }
}

async function summarizeDocumentGaps() {
  const data = await getProjectScheduleInsightsLive()
  const projects = data.activeProjects
    .filter((project) => project.documentGapCount > 0)
    .sort((a, b) => b.documentGapCount - a.documentGapCount)
    .slice(0, 12)
  const markdown = [
    '## Projects with document gaps',
    `- **Total document gaps:** ${data.stats.documentGaps}`,
    '',
    ...projects.map((project) => [
      projectLine(project),
      `  - ${project.documentGapCount} document gaps`,
      ...project.deploymentDocuments.filter((doc) => doc.status !== 'ready').slice(0, 4).map((doc) => `  - ${doc.label}: ${doc.status} (${doc.detail})`),
    ].join('\n')),
  ].join('\n')
  return { text_summary: `${projects.length} projects with document gaps`, markdown, projects }
}

async function summarizePipeline() {
  const data = await getProjectScheduleInsightsLive()
  const markdown = [
    '## Opportunity pipeline by stage',
    ...data.pipelineByStage.map((item) => `- **${item.stage}:** ${item.count}`),
    '',
    '### Sample opportunities',
    ...data.opportunities.slice(0, 10).map((item) => `- **${item.account}** — ${item.opportunity} · ${item.stage} · ${item.estimatedCompletion || 'completion not listed'}`),
  ].join('\n')
  return { text_summary: `${data.opportunities.length} opportunities across ${data.pipelineByStage.length} stages`, markdown, pipeline: data.pipelineByStage }
}

async function summarizeOnsite(args: Record<string, unknown>) {
  const data = await getProjectScheduleInsightsLive()
  const month = typeof args.month === 'string' ? args.month.trim().toLowerCase() : ''
  const months = month ? data.monthlyOnsite.filter((item) => item.month.toLowerCase().includes(month)) : data.monthlyOnsite.slice(0, 3)
  const markdown = [
    month ? `## On-site schedule: ${args.month}` : '## Upcoming on-site schedule',
    ...months.map((item) => [
      `### ${item.month} — ${item.count} projects`,
      ...item.projects.slice(0, 12).map((project) => `- ${project}`),
    ].join('\n')),
  ].join('\n\n')
  return { text_summary: `${months[0]?.month || 'On-site'} has ${months[0]?.count || 0} projects`, markdown, months }
}

async function summarizeInstallCalendar(args: Record<string, unknown>) {
  const data = await getProjectScheduleInsightsLive()
  const limit = asNumber(args.limit, 12)
  const projects = data.upcomingProjects.slice(0, limit)
  const markdown = [
    '## Upcoming install calendar',
    ...projects.map(projectLine),
  ].join('\n')
  return { text_summary: `${projects.length} upcoming project milestones`, markdown, projects }
}

async function summarizeInstallWindow() {
  const data = await getProjectScheduleInsightsLive()
  const projects = data.meetingAgenda.installWindow
  const markdown = [
    '## Projects in the install window',
    projects.length ? '' : '- No projects are currently in the install window.',
    ...projects.map(projectLine),
  ].join('\n')
  return { text_summary: `${projects.length} projects in install window`, markdown, projects }
}

async function exportActiveProjectsCsv() {
  const data = await getProjectScheduleInsightsLive()
  const headers = ['Project', 'PM', 'Phase', 'Deployment', 'Risk', 'Install', 'Completion', 'Next Milestone', 'Next Date', 'Next Action']
  const rows = data.activeProjects.map((project) => [
    project.project,
    project.pm,
    project.phase,
    project.deploymentStatus,
    project.risk,
    project.installOnsite,
    project.substantialCompletion,
    project.nextDateLabel || '',
    project.nextDate || '',
    project.nextActions[0] || '',
  ])
  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  return {
    text_summary: `CSV generated for ${data.activeProjects.length} active projects`,
    markdown: '## Active projects CSV\n```csv\n' + csv + '\n```',
    csv,
  }
}

async function summarizeNextActions(args: Record<string, unknown>) {
  const project = await summarizeProject(String(args.project_id || args.project || ''))
  return project
}

async function summarizeLeadershipDemo() {
  const data = await getProjectScheduleInsightsLive()
  const topSubmittals = data.meetingAgenda.submittals.slice(0, 5)
  const topDecisions = data.meetingAgenda.decisions.slice(0, 5)
  const markdown = [
    '## Leadership demo script',
    '',
    '### What to show first',
    '- Open the **Project Deployment Workspace**.',
    '- Click **Register** and filter to **Needed** or **Returned**.',
    '- Open one project, preferably Baltimore Ravens, and show the job packet: register, document package, checklist, delivery team, and schedule.',
    '',
    '### What the AI can do live',
    '- Turn the workbook into an install-readiness command center.',
    '- Pull out package blockers by project, owner, due date, and revision.',
    '- Build the next PM sync agenda without manually scanning rows.',
    '- Explain one job packet in plain English for a PM, ops lead, or executive.',
    '- Draft a concise handoff from the current schedule state.',
    '',
    '### Current proof points',
    `- **Active projects:** ${data.stats.activeCount}`,
    `- **Submittal blockers:** ${data.stats.submittalsNeeded}`,
    `- **Approved package rows:** ${data.stats.submittalsApproved}`,
    `- **Ready packages:** ${data.stats.readyForInstall}`,
    `- **Scheduled revenue represented:** ${data.stats.totalRevenue ? `$${Math.round(data.stats.totalRevenue).toLocaleString()}` : 'not listed'}`,
    '',
    '### Live blockers to call out',
    ...topSubmittals.map((item) => `- **${item.project}** — ${item.submittalNo} ${item.packageType}: ${statusLabels[item.status]} · ${item.owner || 'unassigned'} · due ${item.dueDate}`),
    '',
    '### PM decisions to call out',
    ...topDecisions.map((project) => `- **${project.project}:** ${project.nextActions[0]} · [open →](${projectUrl(project.id)})`),
    '',
    '### V5/V6 that will make it feel real',
    '- V5: attach files and revision history directly to each submittal row.',
    '- V6: approval workflow with owner nudges, due-date escalation, and install-readiness flags.',
    '- V7: Slack/email brief generation after each PM sync.',
  ].join('\n')

  return {
    text_summary: `Leadership demo ready: ${data.stats.submittalsNeeded} blockers, ${data.stats.readyForInstall} ready packages`,
    markdown,
    stats: data.stats,
  }
}

const skill: Skill = {
  name: 'project_schedule_workspace',
  description: 'Read the project schedule workspace, summarize submittal blockers, explain the practical workflow, or summarize one project.',
  category: 'Service Ops',
  icon: '📋',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: [
          'overview',
          'risk',
          'workload',
          'register',
          'agenda',
          'project',
          'install_calendar',
          'deployment_breakdown',
          'document_gaps',
          'pipeline',
          'onsite',
          'pm_detail',
          'install_window',
          'csv',
          'next_actions',
          'install_readiness',
          'leadership_demo',
        ],
        description: 'overview, risk, workload/pm_detail, register, agenda, project, install_calendar, deployment_breakdown, document_gaps, pipeline, onsite, install_window, csv, next_actions, install_readiness, or leadership_demo.',
      },
      project_id: {
        type: 'string',
        description: 'Project id/slug or project name. Used for mode=project or next_actions.',
      },
      project: {
        type: 'string',
        description: 'Project name search, e.g. Baltimore Ravens or Charlotte Hornets IPF.',
      },
      pm: {
        type: 'string',
        description: 'PM name for workload or pm_detail mode.',
      },
      month: {
        type: 'string',
        description: 'Month name for onsite mode.',
      },
      status: {
        type: 'string',
        enum: ['needed', 'returned', 'submitted', 'approved'],
        description: 'Optional submittal status filter for register mode.',
      },
      limit: {
        type: 'number',
        description: 'Maximum rows to return for register mode.',
      },
    },
    required: ['mode'],
  },
  async handler(args) {
    if (args.mode === 'overview') return summarizeOverview()
    if (args.mode === 'risk') return summarizeRisk()
    if (args.mode === 'workload' || args.mode === 'pm_detail') return summarizeWorkload(args)
    if (args.mode === 'project') return summarizeProject(String(args.project_id || args.project || ''))
    if (args.mode === 'agenda') return summarizeAgenda()
    if (args.mode === 'install_calendar') return summarizeInstallCalendar(args)
    if (args.mode === 'deployment_breakdown') return summarizeDeploymentBreakdown()
    if (args.mode === 'document_gaps') return summarizeDocumentGaps()
    if (args.mode === 'pipeline') return summarizePipeline()
    if (args.mode === 'onsite') return summarizeOnsite(args)
    if (args.mode === 'install_window') return summarizeInstallWindow()
    if (args.mode === 'csv') return exportActiveProjectsCsv()
    if (args.mode === 'next_actions') return summarizeNextActions(args)
    if (args.mode === 'install_readiness') return summarizeInstallReadiness()
    if (args.mode === 'leadership_demo') return summarizeLeadershipDemo()
    return summarizeRegister(args)
  },
}

export default skill
