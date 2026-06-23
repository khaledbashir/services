import { getProjectScheduleInsights } from '@/lib/project-schedule'
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

function summarizeProject(projectId: string) {
  const data = getProjectScheduleInsights()
  const project = data.activeProjects.find((item) => item.id === projectId)
  if (!project) {
    return {
      text_summary: `Project not found: ${projectId}`,
      markdown: `I could not find a project with id \`${projectId}\` in the current schedule workbook.`,
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

function summarizeRegister(args: Record<string, unknown>) {
  const data = getProjectScheduleInsights()
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

function summarizeAgenda() {
  const data = getProjectScheduleInsights()
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

function summarizeInstallReadiness() {
  const data = getProjectScheduleInsights()
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

function summarizeLeadershipDemo() {
  const data = getProjectScheduleInsights()
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
        enum: ['register', 'agenda', 'project', 'install_readiness', 'leadership_demo'],
        description: 'register for submittal rows, agenda for PM sync priorities, project for a single project detail, install_readiness for blocker scan, leadership_demo for an executive-ready live demo script.',
      },
      project_id: {
        type: 'string',
        description: 'Project id/slug from the project schedule URL, required for mode=project.',
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
    if (args.mode === 'project') return summarizeProject(String(args.project_id || ''))
    if (args.mode === 'agenda') return summarizeAgenda()
    if (args.mode === 'install_readiness') return summarizeInstallReadiness()
    if (args.mode === 'leadership_demo') return summarizeLeadershipDemo()
    return summarizeRegister(args)
  },
}

export default skill
