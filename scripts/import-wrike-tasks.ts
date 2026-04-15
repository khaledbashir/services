#!/usr/bin/env npx tsx
/**
 * Phase 4-2: Import Wrike Tasks into Twenty CRM
 *
 * Reads a CSV export from Wrike and creates Task records in Twenty.
 * Expected CSV columns: Title, Description, Due Date, Status, Assignee, Folder/Project
 *
 * Usage: npx tsx scripts/import-wrike-tasks.ts <path-to-wrike-export.csv>
 * Env: TWENTY_API_KEY
 */

import * as fs from 'fs'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

async function twentyFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

// Map Wrike statuses to Twenty statuses
const statusMap: Record<string, string> = {
  'new': 'TODO',
  'active': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  'completed': 'DONE',
  'done': 'DONE',
  'cancelled': 'DONE',
  'deferred': 'TODO',
}

// Map common folder/project names to task categories
const categoryMap: Record<string, string> = {
  'hardware': 'HARDWARE',
  'software': 'SOFTWARE',
  'content': 'CONTENT',
  'staffing': 'STAFFING',
  'logistics': 'LOGISTICS',
  'admin': 'ADMIN',
  'administrative': 'ADMIN',
  'sales': 'SALES',
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values: string[] = []
    let current = ''
    let inQuotes = false

    for (const char of lines[i]) {
      if (char === '"') inQuotes = !inQuotes
      else if (char === ',' && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())

    const row: Record<string, string> = {}
    headers.forEach((h, idx) => { row[h] = values[idx] || '' })
    rows.push(row)
  }

  return rows
}

function inferCategory(folder: string): string {
  const lower = (folder || '').toLowerCase()
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lower.includes(key)) return value
  }
  return 'ADMIN'
}

async function main() {
  const csvPath = process.argv[2]
  if (!csvPath) {
    console.error('Usage: npx tsx scripts/import-wrike-tasks.ts <path-to-csv>')
    console.error('\nExpected CSV columns: Title, Description, Due Date, Status, Assignee, Folder')
    process.exit(1)
  }

  if (!TWENTY_API_KEY) {
    console.error('TWENTY_API_KEY is required')
    process.exit(1)
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`)
    process.exit(1)
  }

  const content = fs.readFileSync(csvPath, 'utf-8')
  const rows = parseCSV(content)
  console.log(`Parsed ${rows.length} tasks from Wrike export\n`)

  let created = 0, errors = 0

  for (const row of rows) {
    const title = row['Title'] || row['title'] || row['Name'] || row['name']
    if (!title) continue

    const description = row['Description'] || row['description'] || ''
    const dueDate = row['Due Date'] || row['due_date'] || row['Due'] || ''
    const status = row['Status'] || row['status'] || 'New'
    const folder = row['Folder'] || row['Project'] || row['folder'] || ''

    const taskData: Record<string, unknown> = {
      title,
      body: description || undefined,
      status: statusMap[status.toLowerCase()] || 'TODO',
      taskType: 'PROJECT',
      taskPriority: 'MEDIUM',
      taskCategory: inferCategory(folder),
    }

    if (dueDate) {
      try {
        const parsed = new Date(dueDate)
        if (!isNaN(parsed.getTime())) {
          taskData.dueAt = parsed.toISOString()
        }
      } catch {}
    }

    try {
      const res = await twentyFetch('tasks', {
        method: 'POST',
        body: JSON.stringify(taskData),
      })

      if (res.ok) {
        console.log(`  [created] ${title}`)
        created++
      } else {
        console.error(`  [error] ${title}: ${await res.text()}`)
        errors++
      }

      await delay(1200) // Rate limit
    } catch (err) {
      console.error(`  [error] ${title}:`, err)
      errors++
    }
  }

  console.log(`\nDone! Created: ${created}, Errors: ${errors}`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
