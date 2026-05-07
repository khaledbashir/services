export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

// Called daily (or on deploy) to scan the codebase and generate a capabilities
// manifest that ANC bot reads from its workspace. This way ANC always knows
// what the dashboard can do — no manual updates needed.
//
// Scheduler: 0 6 * * * curl -s https://abc-anc-services.izcgmb.easypanel.host/api/cron/sync-capabilities

const WORKSPACE_PATH = '/root/.openclaw/workspace-anc-agent'
const OUTPUT_FILE = join(WORKSPACE_PATH, 'DASHBOARD_CAPABILITIES.md')

interface PageInfo {
  path: string
  description: string
}

interface ApiInfo {
  path: string
  methods: string[]
  description: string
}

async function scanPages(dir: string, base = ''): Promise<PageInfo[]> {
  const pages: PageInfo[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        pages.push(...await scanPages(fullPath, `${base}/${entry.name}`))
      } else if (entry.name === 'page.tsx') {
        const content = await readFile(fullPath, 'utf-8')
        const firstLines = content.slice(0, 2000)
        // Extract description from component name or first heading comment
        const fnMatch = firstLines.match(/(?:export default function|function)\s+(\w+)/)
        const route = base || '/'
        pages.push({
          path: route,
          description: fnMatch ? fnMatch[1].replace(/Page$/, '').replace(/([A-Z])/g, ' $1').trim() : route,
        })
      }
    }
  } catch { /* skip unreadable dirs */ }
  return pages
}

async function scanApiRoutes(dir: string, base = ''): Promise<ApiInfo[]> {
  const routes: ApiInfo[] = []
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        routes.push(...await scanApiRoutes(fullPath, `${base}/${entry.name}`))
      } else if (entry.name === 'route.ts') {
        const content = await readFile(fullPath, 'utf-8')
        const methods: string[] = []
        if (content.includes('export async function GET')) methods.push('GET')
        if (content.includes('export async function POST')) methods.push('POST')
        if (content.includes('export async function PUT')) methods.push('PUT')
        if (content.includes('export async function PATCH')) methods.push('PATCH')
        if (content.includes('export async function DELETE')) methods.push('DELETE')

        // Extract first comment line as description
        const commentMatch = content.match(/\/\/\s*(.+)/)
        const routePath = `/api${base}`

        routes.push({
          path: routePath,
          methods,
          description: commentMatch ? commentMatch[1].trim() : routePath,
        })
      }
    }
  } catch { /* skip */ }
  return routes
}

export async function GET() {
  try {
    const appDir = join(process.cwd(), 'app')
    const apiDir = join(appDir, 'api')

    const [pages, apiRoutes] = await Promise.all([
      scanPages(appDir),
      scanApiRoutes(apiDir),
    ])

    // Filter out API pages from the pages list
    const uiPages = pages.filter(p => !p.path.startsWith('/api'))

    // Build the markdown doc
    const now = new Date().toISOString()
    let md = `# ANC Service Dashboard — Live Capabilities\n\n`
    md += `> Auto-generated on ${now} by sync-capabilities cron.\n`
    md += `> This file is regenerated daily. Do NOT edit manually.\n\n`

    md += `## UI Pages (${uiPages.length})\n\n`
    md += `| Route | Description |\n|-------|-------------|\n`
    for (const p of uiPages.sort((a, b) => a.path.localeCompare(b.path))) {
      md += `| \`${p.path}\` | ${p.description} |\n`
    }

    md += `\n## API Endpoints (${apiRoutes.length})\n\n`
    md += `| Route | Methods | Description |\n|-------|---------|-------------|\n`
    for (const r of apiRoutes.sort((a, b) => a.path.localeCompare(b.path))) {
      md += `| \`${r.path}\` | ${r.methods.join(', ')} | ${r.description} |\n`
    }

    md += `\n## Key Features\n\n`
    md += `When someone asks "can the dashboard do X?" — check this list and the API endpoints above.\n`
    md += `If a feature exists here, answer confidently. If it doesn't, say it's not built yet.\n\n`

    // Feature keywords extracted from routes
    const features = [
      { name: 'Event Management', routes: ['/api/events', '/api/events/create', '/api/events/calendar'] },
      { name: 'AI Event Discovery', routes: ['/api/events/discover'] },
      { name: 'Staff Management', routes: ['/api/staff', '/api/staff/import'] },
      { name: 'Ticket System', routes: ['/api/tickets'] },
      { name: 'Workflow Tracking', routes: ['/api/workflow'] },
      { name: 'Venue Management', routes: ['/api/venues', '/api/venues/geocode', '/api/venues/map'] },
      { name: 'Client Portal', routes: ['/api/portal'] },
      { name: 'Reports & Analytics', routes: ['/api/reports', '/api/stats'] },
      { name: 'Knowledge Base & AI Diagnostics', routes: ['/api/kb', '/api/kb/diagnose'] },
      { name: 'Inventory Tracking', routes: ['/api/inventory'] },
      { name: 'Shift Templates', routes: ['/api/shift-templates'] },
      { name: 'MLB Schedule Feed', routes: ['/api/cron/sync-feeds'] },
      { name: 'Slack Notifications', routes: ['/api/slack/broadcast'] },
      { name: 'Email Webhooks', routes: ['/api/webhooks/email'] },
      { name: 'Automated Reminders', routes: ['/api/cron/reminders'] },
      { name: 'Scheduled Reports', routes: ['/api/settings/report-schedules'] },
    ]

    for (const f of features) {
      const exists = f.routes.some(r => apiRoutes.some(ar => ar.path.startsWith(r)))
      if (exists) {
        md += `- **${f.name}** — active\n`
      }
    }

    md += `\n---\n\n`
    md += `Dashboard URL: https://abc-anc-services.izcgmb.easypanel.host\n`
    md += `Total: ${uiPages.length} pages, ${apiRoutes.length} API endpoints\n`

    await writeFile(OUTPUT_FILE, md, 'utf-8')

    return NextResponse.json({
      success: true,
      pages: uiPages.length,
      api_routes: apiRoutes.length,
      output: OUTPUT_FILE,
      generated_at: now,
    })
  } catch (err) {
    console.error('Capabilities sync error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
