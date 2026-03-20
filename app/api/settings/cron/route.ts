import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'

// Config lives in public dir (copied during build) and /app/claw-config.json at runtime
const CONFIG_PATH = path.join(process.cwd(), 'claw-config.json')

const DEFAULT_CONFIG = {
  jobs: [
    { id: 'daily-event-digest', name: 'Daily Event Digest', description: 'Posts today\'s full game slate and flags unassigned events', schedule: '8:00 AM ET daily', enabled: true },
    { id: 'escalation-alerts', name: 'Escalation Alerts', description: 'Alerts when events starting within 2 hours have no check-in', schedule: 'Every 30 minutes', enabled: true },
    { id: 'post-game-summary', name: 'Post-Game Summaries', description: 'Posts workflow completion wrap-up after each game ends', schedule: 'Every hour', enabled: true },
    { id: 'weekly-digest', name: 'Weekly Report', description: 'Last week\'s stats: events covered, workflows completed, tickets', schedule: 'Monday 8:00 AM ET', enabled: true },
  ],
  channel: '#external--ai-services'
}

function readConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    }
  } catch {}
  // Write default and return
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2)) } catch {}
  return DEFAULT_CONFIG
}

function writeConfig(config: any) {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)) } catch (e) { console.error('Write error:', e) }
}

export async function GET() {
  return NextResponse.json(readConfig())
}

export async function POST(request: NextRequest) {
  try {
    const { id, enabled, name, description, schedule } = await request.json()
    const config = readConfig()

    if (id && typeof enabled === 'boolean') {
      // Toggle existing job
      config.jobs = config.jobs.map((j: any) => j.id === id ? { ...j, enabled } : j)
    } else if (name && schedule) {
      // Create new job
      const newId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      config.jobs.push({ id: newId, name, description: description || '', schedule, enabled: true })
    }

    writeConfig(config)
    return NextResponse.json(config)
  } catch (err) {
    console.error('Error updating cron config:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    const config = readConfig()
    config.jobs = config.jobs.filter((j: any) => j.id !== id)
    writeConfig(config)
    return NextResponse.json(config)
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
