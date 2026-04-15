#!/usr/bin/env npx tsx

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = process.cwd()
const WRIKE_DIR = path.join(ROOT, 'wrike-export')
const AIRTABLE_DIR = path.join(ROOT, 'airtable-export')
const AIRTABLE_RECORDS_DIR = path.join(AIRTABLE_DIR, 'records')

const DB_CONTAINER = process.env.DB_CONTAINER || 'anc-services-db-standalone'
const DB_USER = process.env.DB_USER || 'ancservices'
const DB_NAME = process.env.DB_NAME || 'anc_services'

const VENUE_STOPWORDS = new Set([
  'the', 'and', 'at', 'of', 'for', 'sports', 'venue', 'venues', 'stadium', 'arena', 'park',
  'center', 'centre', 'field', 'fieldhouse', 'casino', 'world', 'ballpark', 'campus', 'hall',
  'events', 'event', 'led', 'graphics',
])

const LEAGUE_HINTS = ['mlb', 'milb', 'nfl', 'nba', 'nhl', 'wnba', 'ncaa', 'soccer', 'mls', 'big3', 'wnba']

type JsonRecord = Record<string, any>
type SummaryStats = { new: number; updated: number; skipped: number; unmapped: number }

const summary = new Map<string, SummaryStats>()
const venueMisses = new Map<string, number>()
const staffMisses = new Map<string, number>()

function bucket(source: string, target: string) {
  const key = `${source}::${target}`
  if (!summary.has(key)) summary.set(key, { new: 0, updated: 0, skipped: 0, unmapped: 0 })
  return summary.get(key)!
}

function bumpMiss(map: Map<string, number>, value: string | null | undefined) {
  const key = String(value || '').trim()
  if (!key) return
  map.set(key, (map.get(key) || 0) + 1)
}

function readJson<T = any>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}

function psql(sql: string) {
  return execFileSync(
    'docker',
    ['exec', '-i', DB_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', DB_USER, '-d', DB_NAME, '-At', '-F', '\t'],
    { encoding: 'utf8', input: sql, maxBuffer: 1024 * 1024 * 128 },
  )
}

function queryRows<T = JsonRecord>(sql: string): T[] {
  const output = psql(`SELECT row_to_json(t) FROM (${sql}) t;`)
  return output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function queryJsonRows<T = JsonRecord>(sql: string): T[] {
  const output = psql(sql)
  return output
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T)
}

function execSql(sql: string) {
  psql(sql)
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function stripHtml(value: string | null | undefined) {
  if (!value) return ''
  return normalizeWhitespace(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"'),
  )
}

function toDate(value: any): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function toTimestamp(value: any): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

function toNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '')
    if (!cleaned) return null
    const parsed = Number(cleaned)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function csv(value: any): string | null {
  if (Array.isArray(value)) {
    const out = value
      .map((entry) => {
        if (typeof entry === 'string') return entry.trim()
        if (entry && typeof entry === 'object') return String(entry.name || entry.email || entry.id || '').trim()
        return ''
      })
      .filter(Boolean)
      .join(', ')
    return out || null
  }
  if (value && typeof value === 'object') return String(value.name || value.email || value.id || '').trim() || null
  if (value === null || value === undefined) return null
  const out = String(value).trim()
  return out || null
}

function slug(value: string | null | undefined) {
  return normalizeWhitespace(String(value || '').toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim()
}

function venueKey(value: string | null | undefined) {
  const base = slug(String(value || '').replace(/\([^)]*\)/g, ' '))
  if (!base) return ''
  return base
    .split(' ')
    .filter((token) => token && !VENUE_STOPWORDS.has(token))
    .join(' ')
}

function tokenSet(value: string | null | undefined) {
  return new Set(venueKey(value).split(' ').filter(Boolean))
}

function titleKey(value: string | null | undefined) {
  return slug(value)
}

function arrayify<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  return [value]
}

function isLikelyTeamName(title: string) {
  const lower = title.toLowerCase()
  if (LEAGUE_HINTS.some((hint) => lower.includes(hint))) return false
  if (lower.includes('creative services') || lower.includes('root') || lower.includes('venues')) return false
  return /\w+\s+\w+/.test(title) || /\([A-Z]{3}/.test(title)
}

type VenueRow = { id: string; name: string; is_active?: boolean }
type StaffRow = { id: string; full_name: string; email: string }

const venueByExact = new Map<string, VenueRow>()
const venueByTokens = new Map<string, VenueRow>()
const allVenues: VenueRow[] = []

const staffByEmail = new Map<string, StaffRow>()
const staffByName = new Map<string, StaffRow>()

const wrikeUserToStaffId = new Map<string, string>()
const wrikeUserLabel = new Map<string, string>()

const folderById = new Map<string, JsonRecord>()
const parentFolderById = new Map<string, string>()

const customFieldNames = new Map<string, string>()
const wrikeStatusById = new Map<string, { name: string; workflow: string; group: string }>()

const airtableRecordIndex = new Map<string, { baseName: string; tableName: string; record: JsonRecord }>()

function loadDbLookups() {
  const venues = queryRows<VenueRow>(`SELECT id, name, is_active FROM venues`)
  for (const venue of venues) {
    allVenues.push(venue)
    venueByExact.set(venueKey(venue.name), venue)
    venueByTokens.set(titleKey(venue.name), venue)
  }

  const staff = queryRows<StaffRow>(`SELECT id, full_name, email FROM staff`)
  for (const person of staff) {
    staffByEmail.set(String(person.email || '').toLowerCase(), person)
    staffByName.set(titleKey(person.full_name), person)
    const parts = String(person.full_name || '').split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      staffByName.set(titleKey(`${parts[0]} ${parts.at(-1)}`), person)
    }
  }
}

function loadWrikeLookups() {
  const folders = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'folders_tree.json')).data || []
  for (const folder of folders) {
    folderById.set(folder.id, folder)
    for (const childId of folder.childIds || []) parentFolderById.set(childId, folder.id)
  }

  const fields = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'custom_fields.json')).data || []
  for (const field of fields) customFieldNames.set(field.id, field.title || field.id)

  const workflows = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'workflows.json')).data || []
  for (const workflow of workflows) {
    for (const status of workflow.customStatuses || []) {
      wrikeStatusById.set(status.id, {
        name: status.name || '',
        workflow: workflow.name || '',
        group: status.group || '',
      })
    }
  }

  const contacts = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'contacts.json')).data || []
  for (const contact of contacts) {
    const email = String(contact.primaryEmail || contact.profiles?.find((profile: any) => profile.email)?.email || '').toLowerCase()
    const fullName = normalizeWhitespace(`${contact.firstName || ''} ${contact.lastName || ''}`)
    const staffHit = (email && staffByEmail.get(email)) || (fullName && staffByName.get(titleKey(fullName)))
    wrikeUserLabel.set(contact.id, email || fullName || contact.id)
    if (staffHit) wrikeUserToStaffId.set(contact.id, staffHit.id)
  }
}

function loadAirtableIndex() {
  for (const file of fs.readdirSync(AIRTABLE_RECORDS_DIR)) {
    if (!file.endsWith('.json')) continue
    const base = readJson<JsonRecord>(path.join(AIRTABLE_RECORDS_DIR, file))
    const baseName = base.name || file
    for (const [tableName, rows] of Object.entries(base.tables || {})) {
      for (const record of rows as JsonRecord[]) {
        airtableRecordIndex.set(record.id, { baseName, tableName, record })
      }
    }
  }
}

function resolveVenue(raw: string | null | undefined): VenueRow | null {
  const original = normalizeWhitespace(String(raw || ''))
  if (!original) return null

  const exact = venueByExact.get(venueKey(original)) || venueByTokens.get(titleKey(original))
  if (exact) return exact

  const wantedTokens = tokenSet(original)
  if (wantedTokens.size === 0) {
    bumpMiss(venueMisses, original)
    return null
  }

  let best: { venue: VenueRow; score: number } | null = null
  for (const venue of allVenues) {
    const candidateTokens = tokenSet(venue.name)
    if (candidateTokens.size === 0) continue
    let overlap = 0
    for (const token of wantedTokens) {
      if (candidateTokens.has(token)) overlap += 1
    }
    const score = overlap / Math.max(wantedTokens.size, candidateTokens.size)
    if (overlap > 0 && (!best || score > best.score)) best = { venue, score }
  }

  if (best && best.score >= 0.45) return best.venue
  bumpMiss(venueMisses, original)
  return null
}

function resolveStaff(raw: any): StaffRow | null {
  if (!raw) return null

  const values = Array.isArray(raw) ? raw : [raw]
  for (const value of values) {
    if (!value) continue
    if (typeof value === 'object') {
      const email = String(value.email || '').toLowerCase()
      if (email && staffByEmail.has(email)) return staffByEmail.get(email)!
      const name = String(value.name || value.fullName || '').trim()
      if (name && staffByName.has(titleKey(name))) return staffByName.get(titleKey(name))!
    }

    const stringValue = String(value).trim()
    if (!stringValue) continue
    const lower = stringValue.toLowerCase()
    if (staffByEmail.has(lower)) return staffByEmail.get(lower)!
    if (staffByName.has(titleKey(stringValue))) return staffByName.get(titleKey(stringValue))!
    bumpMiss(staffMisses, stringValue)
  }

  return null
}

function resolveWrikeAssignee(ids: any[]): StaffRow | null {
  for (const id of ids || []) {
    const staffId = wrikeUserToStaffId.get(id)
    if (staffId) {
      const found = Array.from(staffByEmail.values()).find((row) => row.id === staffId)
      if (found) return found
    }
    bumpMiss(staffMisses, wrikeUserLabel.get(id) || id)
  }
  return null
}

function wrikeLineage(task: JsonRecord) {
  const ids = [...arrayify(task.parentIds), ...arrayify(task.superParentIds)]
  const seen = new Set<string>()
  const titles: string[] = []

  for (const id of ids) {
    let current = String(id)
    let guard = 0
    while (current && !seen.has(current) && guard++ < 40) {
      seen.add(current)
      const folder = folderById.get(current)
      if (folder?.title) titles.push(String(folder.title))
      current = parentFolderById.get(current) || ''
    }
  }

  return titles
}

function wrikeCustomFields(task: JsonRecord) {
  const fields: Record<string, any> = {}
  for (const field of task.customFields || []) {
    const name = customFieldNames.get(field.id) || field.id
    fields[name] = field.value
  }
  return fields
}

function findFirstCustom(custom: Record<string, any>, patterns: string[]) {
  for (const [key, value] of Object.entries(custom)) {
    const lower = key.toLowerCase()
    if (patterns.some((pattern) => lower.includes(pattern))) return value
  }
  return null
}

function mapStatus(target: string, rawName: string | null | undefined, workflowName: string | null | undefined, rawTaskStatus: string | null | undefined) {
  const status = `${rawName || ''} ${workflowName || ''} ${rawTaskStatus || ''}`.toLowerCase()

  switch (target) {
    case 'design_requests':
      if (status.includes('approved')) return 'approved'
      if (status.includes('done') || status.includes('completed') || status.includes('closed')) return 'done'
      if (status.includes('client review') || status.includes('waiting client')) return 'client_review'
      if (status.includes('quality') || status.includes('qc')) return 'in_qc'
      if (status.includes('progress')) return 'in_progress'
      if (status.includes('queue')) return 'in_queue'
      return 'request_submitted'
    case 'print_requests':
      if (status.includes('invoic')) return 'invoiced'
      if (status.includes('ship')) return 'shipped'
      if (status.includes('production')) return 'in_production'
      if (status.includes('approved')) return 'approved'
      if (status.includes('approval')) return 'awaiting_approval'
      if (status.includes('layout')) return 'awaiting_layout'
      return 'new_request'
    case 'cg_design_requests':
      if (status.includes('posted') || status.includes('programmed') || status.includes('submitted to cs')) return 'posted'
      if (status.includes('approved')) return 'approved'
      if (status.includes('revision')) return 'revisions'
      if (status.includes('review')) return 'review'
      if (status.includes('progress')) return 'in_progress'
      if (status.includes('queue')) return 'in_queue'
      return 'request_submitted'
    case 'content_schedules':
      if (status.includes('confirmed')) return 'confirmed_with_client'
      if (status.includes('live')) return 'content_live'
      if (status.includes('scheduled')) return 'scheduled_to_launch'
      return 'in_queue'
    case 'parts_orders':
      if (status.includes('completed') || status.includes('delivered')) return 'completed'
      if (status.includes('shipped')) return 'shipped'
      if (status.includes('purchased')) return 'purchased'
      return 'requested'
    case 'checklist_items':
      if (status.includes('done') || status.includes('completed')) return 'done'
      if (status.includes('progress')) return 'in_progress'
      return 'not_started'
    case 'maintenance_logs':
      if (status.includes('completed') || status.includes('closed') || status.includes('done')) return 'completed'
      if (status.includes('cancel')) return 'cancelled'
      if (status.includes('progress') || status.includes('scheduled')) return 'in_progress'
      return 'open'
    default:
      return rawName || rawTaskStatus || 'new'
  }
}

function classifyWrikeTask(task: JsonRecord, lineage: string[], workflowName: string) {
  const haystack = `${lineage.join(' > ')} ${task.title || ''} ${workflowName || ''}`.toLowerCase()

  if (haystack.includes('ticket workflow') || haystack.includes('issue reported') || haystack.includes('support')) return null
  if (haystack.includes('30-60-90') || haystack.includes('opening day')) return 'checklist_items'
  if (haystack.includes('parts ordering') || haystack.includes('internal parts ordering')) return 'parts_orders'
  if (haystack.includes('cg design') || workflowName.toLowerCase().includes('cg workflow')) return 'cg_design_requests'
  if (workflowName.toLowerCase().includes('places scheduling') || haystack.includes('places scheduling') || haystack.includes('content review schdule')) return 'content_schedules'
  if (workflowName.toLowerCase().includes('britten') || /\bprint\b|\breprint\b|spec sheet|printers/i.test(task.title || '')) return 'print_requests'
  if (haystack.includes('creative services') || workflowName.toLowerCase().includes('default workflow') || workflowName.toLowerCase().includes('stat workflow')) return 'design_requests'

  return null
}

function extractLeague(lineage: string[]) {
  for (const title of lineage) {
    const lower = title.toLowerCase()
    const hit = LEAGUE_HINTS.find((hint) => lower.includes(hint))
    if (hit) return hit.toUpperCase()
  }
  return null
}

function extractTeam(lineage: string[]) {
  for (const title of lineage) {
    if (isLikelyTeamName(title)) return title
  }
  return null
}

function extractVenueFromWrike(lineage: string[], custom: Record<string, any>) {
  const candidates = [
    csv(findFirstCustom(custom, ['venue'])),
    ...lineage,
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    const hit = resolveVenue(candidate)
    if (hit) return hit
  }
  return null
}

function appendWrikeLink(text: string | null, permalink: string | null | undefined) {
  const base = normalizeWhitespace(String(text || ''))
  if (!permalink) return base || null
  return normalizeWhitespace(`${base}${base ? '\n\n' : ''}Wrike: ${permalink}`)
}

function ensureImportColumns() {
  const tables = [
    'checklist_items',
    'parts_orders',
    'design_requests',
    'print_requests',
    'cg_design_requests',
    'content_schedules',
    'designer_hours_budgets',
    'designer_time_entries',
    'maintenance_logs',
    'walkthrough_logs',
    'inventory',
    'rma_trackers',
  ]

  for (const table of tables) {
    execSql(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS external_id TEXT`)
    execSql(`CREATE INDEX IF NOT EXISTS idx_${table}_external_id ON ${table}(external_id)`)
  }
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

function jsonRecordset(columns: string[], rows: JsonRecord[]) {
  return `SELECT * FROM json_to_recordset(${sqlLiteral(JSON.stringify(rows))}) AS x(${columns.join(', ')})`
}

function insertBatch(target: string, rows: JsonRecord[], sqlBuilder: (jsonSql: string) => string, source: 'wrike' | 'airtable') {
  if (rows.length === 0) return
  const stats = bucket(source, target)

  for (const part of chunk(rows, 100)) {
    const sql = sqlBuilder(jsonRecordset(
      Array.from(new Set(part.flatMap((row) => Object.keys(row).map((key) => `${key} text`)))),
      part,
    ))
    execSql(sql)
    stats.new += part.length
  }
}

function queryExternalIds(table: string) {
  return new Set(queryRows<{ external_id: string }>(`SELECT external_id FROM ${table} WHERE external_id IS NOT NULL`).map((row) => row.external_id))
}

function quoteNullable(value: any) {
  if (value === null || value === undefined || value === '') return 'NULL'
  return sqlLiteral(String(value))
}

function upsertBudget(budgetKey: string, data: { client_name: string; venue_id: string | null; league: string | null; season: string | null; total_hours: number; notes: string | null; contract_start: string | null; contract_end: string | null }) {
  const existing = queryRows<{ id: string }>(
    `SELECT id FROM designer_hours_budgets WHERE external_id = ${sqlLiteral(budgetKey)} LIMIT 1`,
  )[0]
  if (existing) return existing.id

  const inserted = queryJsonRows<{ id: string }>(
    `WITH inserted AS (
      INSERT INTO designer_hours_budgets (
        external_id, client_name, venue_id, league, season, total_hours, notes, contract_start, contract_end
      ) VALUES (
        ${sqlLiteral(budgetKey)},
        ${sqlLiteral(data.client_name)},
        ${data.venue_id ? sqlLiteral(data.venue_id) : 'NULL'},
        ${data.league ? sqlLiteral(data.league) : 'NULL'},
        ${data.season ? sqlLiteral(data.season) : 'NULL'},
        ${Number.isFinite(data.total_hours) ? data.total_hours.toFixed(2) : '0'},
        ${quoteNullable(data.notes)},
        ${quoteNullable(data.contract_start)},
        ${quoteNullable(data.contract_end)}
      )
      RETURNING id
    )
    SELECT row_to_json(inserted) FROM inserted`,
  )[0]
  bucket('wrike', 'designer_hours_budgets').new += 1
  return inserted.id
}

function importWrikeTasks() {
  const tasks = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'tasks.json')).data || []
  const existingByTable = {
    checklist_items: queryExternalIds('checklist_items'),
    parts_orders: queryExternalIds('parts_orders'),
    design_requests: queryExternalIds('design_requests'),
    print_requests: queryExternalIds('print_requests'),
    cg_design_requests: queryExternalIds('cg_design_requests'),
    content_schedules: queryExternalIds('content_schedules'),
  }

  const budgetRollups = new Map<string, { client_name: string; venue_id: string | null; league: string | null; season: string | null; total_hours: number; notes: string | null; contract_start: string | null; contract_end: string | null }>()
  const designBudgetKeyByExternalId = new Map<string, string>()
  const wrikeTaskProgress = new Map<string, number>()

  const pending: Record<string, JsonRecord[]> = {
    checklist_items: [],
    parts_orders: [],
    design_requests: [],
    print_requests: [],
    cg_design_requests: [],
    content_schedules: [],
  }

  for (const task of tasks) {
    const lineage = wrikeLineage(task)
    const custom = wrikeCustomFields(task)
    const statusMeta = wrikeStatusById.get(task.customStatusId) || { name: task.status || '', workflow: '', group: '' }
    const target = classifyWrikeTask(task, lineage, statusMeta.workflow)
    if (!target) continue

    const stats = bucket('wrike', target)
    if (existingByTable[target as keyof typeof existingByTable].has(task.id)) {
      stats.skipped += 1
      continue
    }

    const venue = extractVenueFromWrike(lineage, custom)
    const assignee = resolveWrikeAssignee(task.responsibleIds || [])
    const league = extractLeague(lineage)
    const teamName = extractTeam(lineage)
    const dueDate = toDate(task.dates?.due)
    const createdAt = toTimestamp(task.createdDate)
    const customClient = csv(findFirstCustom(custom, ['client']))
    const companyName = customClient || venue?.name || teamName || null
    const notes = appendWrikeLink(stripHtml(task.description || task.briefDescription || ''), task.permalink)
    const hoursEstimated = toNumber(findFirstCustom(custom, ['booked effort', 'effort', 'hours estimated', 'estimate']))
    const hoursSpent = toNumber(findFirstCustom(custom, ['hours spent', 'actual effort', 'spent']))
    const tricode = csv(findFirstCustom(custom, ['tri-code', 'tri code']))
    const proofLink = csv(findFirstCustom(custom, ['proof ftp path', 'proof link']))
    const finalLink = csv(findFirstCustom(custom, ['ftp location', 'ftp path', 'shared link']))
    const shippingInfo = csv(findFirstCustom(custom, ['shipping info']))
    const shipDate = toDate(findFirstCustom(custom, ['date shipped']))

    switch (target) {
      case 'design_requests': {
        const season = (dueDate || createdAt || '').slice(0, 4) || null
        const budgetKey = `wrike-budget:${companyName || venue?.name || 'unknown'}:${season || 'unknown'}`
        designBudgetKeyByExternalId.set(task.id, budgetKey)
        if (!budgetRollups.has(budgetKey)) {
          budgetRollups.set(budgetKey, {
            client_name: companyName || venue?.name || 'Unknown Client',
            venue_id: venue?.id || null,
            league,
            season,
            total_hours: 0,
            notes: 'Imported from Wrike',
            contract_start: createdAt?.slice(0, 10) || null,
            contract_end: dueDate,
          })
        }
        if (hoursEstimated) budgetRollups.get(budgetKey)!.total_hours += hoursEstimated

        pending.design_requests.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          company_name: companyName,
          job_title: task.title,
          tricode,
          ftp_proof_link: proofLink,
          ftp_final_link: finalLink,
          final_file_name: null,
          final_duration: null,
          notes,
          boards_requested: csv(findFirstCustom(custom, ['board'])),
          sizes_requested: csv(findFirstCustom(custom, ['size'])),
          designer_id: assignee?.id || null,
          enterprise_contact_id: null,
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          hours_estimated: hoursEstimated,
          hours_spent: hoursSpent ?? 0,
          due_date: dueDate,
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
      }
      case 'print_requests':
        pending.print_requests.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          client_name: companyName,
          job_title: task.title,
          notes,
          shipping_info: shippingInfo,
          ship_date: shipDate,
          arrival_date: dueDate,
          britten_cost: toNumber(findFirstCustom(custom, ['britten price', 'britten cost', 'cost'])),
          anc_cost: null,
          tracking_number: csv(findFirstCustom(custom, ['tracking'])),
          assignee_id: assignee?.id || null,
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
      case 'cg_design_requests':
        pending.cg_design_requests.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          league,
          team_name: teamName,
          job_title: task.title,
          notes,
          designer_id: assignee?.id || null,
          due_date: dueDate,
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
      case 'content_schedules':
        pending.content_schedules.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          company_name: companyName,
          content_name: task.title,
          launch_date: dueDate,
          end_date: null,
          operator_id: assignee?.id || null,
          files_ready: proofLink ? 'true' : 'false',
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          notes,
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
      case 'parts_orders':
        pending.parts_orders.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          part_id: null,
          parts_needed: task.title,
          quantity: '1',
          requestor_name: customClient,
          requestor_email: null,
          shipping_address: shippingInfo,
          notes,
          photo_url: proofLink,
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          wrike_task_id: task.id,
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
      case 'checklist_items':
        pending.checklist_items.push({
          external_id: task.id,
          venue_id: venue?.id || null,
          days_out: lineage.find((value) => /\b(30|60|90)\b/.test(value))?.match(/\b(30|60|90)\b/)?.[1] || '30',
          league,
          team_name: teamName,
          task_description: task.title,
          prompt: notes,
          assignee_id: assignee?.id || null,
          due_date: dueDate,
          status: mapStatus(target, statusMeta.name, statusMeta.workflow, task.status),
          created_at: createdAt,
          updated_at: toTimestamp(task.updatedDate) || createdAt,
        })
        break
    }

    const progress = (wrikeTaskProgress.get(target) || 0) + 1
    wrikeTaskProgress.set(target, progress)
    if (progress % 100 === 0) console.log(`[wrike:${target}] prepared ${progress}`)
  }

  if (pending.design_requests.length) {
    for (const part of chunk(pending.design_requests, 100)) {
      const columns = [
        'external_id text', 'venue_id text', 'company_name text', 'job_title text', 'tricode text',
        'ftp_proof_link text', 'ftp_final_link text', 'final_file_name text', 'final_duration text',
        'notes text', 'boards_requested text', 'sizes_requested text', 'designer_id text',
        'enterprise_contact_id text', 'status text', 'hours_estimated text', 'hours_spent text',
        'due_date text', 'created_at text', 'updated_at text',
      ]
      execSql(`
        WITH input AS (${jsonRecordset(columns, part)})
        INSERT INTO design_requests (
          external_id, venue_id, company_name, job_title, tricode, ftp_proof_link, ftp_final_link,
          final_file_name, final_duration, notes, boards_requested, sizes_requested, designer_id,
          enterprise_contact_id, status, hours_estimated, hours_spent, due_date, created_at, updated_at
        )
        SELECT
          i.external_id,
          NULLIF(i.venue_id, '')::uuid,
          NULLIF(i.company_name, ''),
          i.job_title,
          NULLIF(i.tricode, ''),
          NULLIF(i.ftp_proof_link, ''),
          NULLIF(i.ftp_final_link, ''),
          NULLIF(i.final_file_name, ''),
          NULLIF(i.final_duration, ''),
          NULLIF(i.notes, ''),
          NULLIF(i.boards_requested, ''),
          NULLIF(i.sizes_requested, ''),
          NULLIF(i.designer_id, '')::uuid,
          NULLIF(i.enterprise_contact_id, '')::uuid,
          COALESCE(NULLIF(i.status, ''), 'request_submitted'),
          NULLIF(i.hours_estimated, '')::numeric,
          COALESCE(NULLIF(i.hours_spent, '')::numeric, 0),
          NULLIF(i.due_date, '')::date,
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()),
          COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM design_requests d WHERE d.external_id = i.external_id)
      `)
      bucket('wrike', 'design_requests').new += part.length
    }
  }

  const simpleWrikeInsertions: Array<{
    target: keyof typeof pending
    sql: (rows: JsonRecord[]) => string
  }> = [
    {
      target: 'print_requests',
      sql: (rows) => `
        WITH input AS (${jsonRecordset([
          'external_id text', 'venue_id text', 'client_name text', 'job_title text', 'notes text',
          'shipping_info text', 'ship_date text', 'arrival_date text', 'britten_cost text',
          'anc_cost text', 'tracking_number text', 'assignee_id text', 'status text',
          'created_at text', 'updated_at text',
        ], rows)})
        INSERT INTO print_requests (
          external_id, venue_id, client_name, job_title, notes, shipping_info, ship_date, arrival_date,
          britten_cost, anc_cost, tracking_number, assignee_id, status, created_at, updated_at
        )
        SELECT
          i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.client_name, ''), i.job_title,
          NULLIF(i.notes, ''), NULLIF(i.shipping_info, ''), NULLIF(i.ship_date, '')::date,
          NULLIF(i.arrival_date, '')::date, NULLIF(i.britten_cost, '')::numeric, NULLIF(i.anc_cost, '')::numeric,
          NULLIF(i.tracking_number, ''), NULLIF(i.assignee_id, '')::uuid, COALESCE(NULLIF(i.status, ''), 'new_request'),
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM print_requests p WHERE p.external_id = i.external_id)
      `,
    },
    {
      target: 'cg_design_requests',
      sql: (rows) => `
        WITH input AS (${jsonRecordset([
          'external_id text', 'venue_id text', 'league text', 'team_name text', 'job_title text',
          'notes text', 'designer_id text', 'due_date text', 'status text', 'created_at text', 'updated_at text',
        ], rows)})
        INSERT INTO cg_design_requests (
          external_id, venue_id, league, team_name, job_title, notes, designer_id, due_date, status, created_at, updated_at
        )
        SELECT
          i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.league, ''), NULLIF(i.team_name, ''), i.job_title,
          NULLIF(i.notes, ''), NULLIF(i.designer_id, '')::uuid, NULLIF(i.due_date, '')::date,
          COALESCE(NULLIF(i.status, ''), 'request_submitted'),
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM cg_design_requests c WHERE c.external_id = i.external_id)
      `,
    },
    {
      target: 'content_schedules',
      sql: (rows) => `
        WITH input AS (${jsonRecordset([
          'external_id text', 'venue_id text', 'company_name text', 'content_name text', 'launch_date text',
          'end_date text', 'operator_id text', 'files_ready text', 'status text', 'notes text', 'created_at text', 'updated_at text',
        ], rows)})
        INSERT INTO content_schedules (
          external_id, venue_id, company_name, content_name, launch_date, end_date,
          operator_id, files_ready, status, notes, created_at, updated_at
        )
        SELECT
          i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.company_name, ''), i.content_name,
          NULLIF(i.launch_date, '')::date, NULLIF(i.end_date, '')::date, NULLIF(i.operator_id, '')::uuid,
          CASE WHEN LOWER(COALESCE(i.files_ready, '')) IN ('true','t','1','yes') THEN true ELSE false END,
          COALESCE(NULLIF(i.status, ''), 'in_queue'),
          NULLIF(i.notes, ''),
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM content_schedules c WHERE c.external_id = i.external_id)
      `,
    },
    {
      target: 'parts_orders',
      sql: (rows) => `
        WITH input AS (${jsonRecordset([
          'external_id text', 'venue_id text', 'part_id text', 'parts_needed text', 'quantity text',
          'requestor_name text', 'requestor_email text', 'shipping_address text', 'notes text',
          'photo_url text', 'status text', 'wrike_task_id text', 'created_at text', 'updated_at text',
        ], rows)})
        INSERT INTO parts_orders (
          external_id, venue_id, part_id, parts_needed, quantity, requestor_name, requestor_email,
          shipping_address, notes, photo_url, status, wrike_task_id, created_at, updated_at
        )
        SELECT
          i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.part_id, '')::uuid, i.parts_needed,
          COALESCE(NULLIF(i.quantity, '')::int, 1), NULLIF(i.requestor_name, ''), NULLIF(i.requestor_email, ''),
          NULLIF(i.shipping_address, ''), NULLIF(i.notes, ''), NULLIF(i.photo_url, ''),
          COALESCE(NULLIF(i.status, ''), 'requested'), NULLIF(i.wrike_task_id, ''),
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM parts_orders p WHERE p.external_id = i.external_id)
      `,
    },
    {
      target: 'checklist_items',
      sql: (rows) => `
        WITH input AS (${jsonRecordset([
          'external_id text', 'venue_id text', 'days_out text', 'league text', 'team_name text',
          'task_description text', 'prompt text', 'assignee_id text', 'due_date text', 'status text',
          'created_at text', 'updated_at text',
        ], rows)})
        INSERT INTO checklist_items (
          external_id, venue_id, days_out, league, team_name, task_description, prompt,
          assignee_id, due_date, status, created_at, updated_at
        )
        SELECT
          i.external_id, NULLIF(i.venue_id, '')::uuid, COALESCE(NULLIF(i.days_out, ''), '30'),
          NULLIF(i.league, ''), NULLIF(i.team_name, ''), i.task_description, NULLIF(i.prompt, ''),
          NULLIF(i.assignee_id, '')::uuid, NULLIF(i.due_date, '')::date, COALESCE(NULLIF(i.status, ''), 'not_started'),
          COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM checklist_items c WHERE c.external_id = i.external_id)
      `,
    },
  ]

  for (const item of simpleWrikeInsertions) {
    const rows = pending[item.target]
    for (const part of chunk(rows, 100)) {
      execSql(item.sql(part))
      bucket('wrike', item.target).new += part.length
      const progress = (wrikeTaskProgress.get(`${item.target}:inserted`) || 0) + part.length
      wrikeTaskProgress.set(`${item.target}:inserted`, progress)
      if (progress % 100 === 0) console.log(`[wrike:${item.target}] inserted ${progress}`)
    }
  }

  for (const [budgetKey, rollup] of budgetRollups) {
    upsertBudget(budgetKey, {
      ...rollup,
      total_hours: rollup.total_hours || 0,
    })
  }

  return designBudgetKeyByExternalId
}

function importWrikeTimelogs(designBudgetKeyByExternalId: Map<string, string>) {
  const timelogs = readJson<{ data: JsonRecord[] }>(path.join(WRIKE_DIR, 'timelogs.json')).data || []
  const existing = queryExternalIds('designer_time_entries')
  const designRows = queryRows<{ external_id: string; id: string; company_name: string | null; venue_id: string | null; due_date: string | null; created_at: string | null }>(
    `SELECT external_id, id, company_name, venue_id, due_date, created_at FROM design_requests WHERE external_id IS NOT NULL`,
  )
  const designByExternal = new Map(designRows.map((row) => [row.external_id, row]))
  const budgetRows = queryRows<{ id: string; external_id: string }>(
    `SELECT id, external_id FROM designer_hours_budgets WHERE external_id IS NOT NULL`,
  )
  const budgetIdByKey = new Map(budgetRows.map((row) => [row.external_id, row.id]))

  let processed = 0
  for (const batch of chunk(timelogs, 100)) {
    const rows: JsonRecord[] = []
    for (const log of batch) {
      if (existing.has(log.id)) {
        bucket('wrike', 'designer_time_entries').skipped += 1
        continue
      }

      const design = designByExternal.get(log.taskId)
      if (!design) {
        bucket('wrike', 'designer_time_entries').skipped += 1
        continue
      }

      const budgetKey =
        designBudgetKeyByExternalId.get(log.taskId) ||
        `wrike-budget:${design.company_name || 'Unknown Client'}:${String(design.due_date || design.created_at || '').slice(0, 4) || 'unknown'}`

      let budgetId = budgetIdByKey.get(budgetKey)
      if (!budgetId) {
        budgetId = upsertBudget(budgetKey, {
          client_name: design.company_name || 'Unknown Client',
          venue_id: design.venue_id || null,
          league: null,
          season: String(design.due_date || design.created_at || '').slice(0, 4) || null,
          total_hours: 0,
          notes: 'Imported from Wrike timelogs',
          contract_start: null,
          contract_end: null,
        })
        budgetIdByKey.set(budgetKey, budgetId)
      }

      const designer = resolveWrikeAssignee([log.userId])
      rows.push({
        external_id: log.id,
        budget_id: budgetId,
        designer_id: designer?.id || null,
        design_request_id: design.id,
        entry_date: toDate(log.trackedDate || log.entryDate || log.createdDate),
        hours: toNumber(log.hours) || 0,
        description: stripHtml(log.comment || ''),
        created_at: toTimestamp(log.createdDate),
      })
    }

    if (rows.length) {
      execSql(`
        WITH input AS (${jsonRecordset([
          'external_id text', 'budget_id text', 'designer_id text', 'design_request_id text',
          'entry_date text', 'hours text', 'description text', 'created_at text',
        ], rows)})
        INSERT INTO designer_time_entries (
          external_id, budget_id, designer_id, design_request_id, entry_date, hours, description, created_at
        )
        SELECT
          i.external_id, NULLIF(i.budget_id, '')::uuid, NULLIF(i.designer_id, '')::uuid, NULLIF(i.design_request_id, '')::uuid,
          COALESCE(NULLIF(i.entry_date, '')::date, CURRENT_DATE), COALESCE(NULLIF(i.hours, '')::numeric, 0),
          NULLIF(i.description, ''), COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW())
        FROM input i
        WHERE NOT EXISTS (SELECT 1 FROM designer_time_entries d WHERE d.external_id = i.external_id)
      `)
      bucket('wrike', 'designer_time_entries').new += rows.length
    }

    processed += batch.length
    if (processed % 100 === 0) console.log(`[wrike:designer_time_entries] processed ${processed}`)
  }
}

function resolveAirtableVenue(record: JsonRecord, fields: JsonRecord) {
  const directCandidates = [
    csv(fields.Venue),
    csv(fields['Venue Name']),
    csv(fields['Venue (from Storage Location)']),
    csv(fields['Venue (from Stations)']),
    csv(fields['Venue (from Affected Displays)']),
  ].filter(Boolean) as string[]

  for (const candidate of directCandidates) {
    const found = resolveVenue(candidate)
    if (found) return found
  }

  for (const relationId of arrayify(fields.Venue)) {
    const linked = airtableRecordIndex.get(String(relationId))
    if (!linked) continue
    const linkedFields = linked.record.fields || {}
    const secondPass = [
      linkedFields.Name,
      linkedFields['Venue Name'],
      linkedFields.Venue,
      linkedFields['Venue (from Storage Location)'],
    ]
    for (const candidate of secondPass) {
      const found = resolveVenue(csv(candidate))
      if (found) return found
    }
  }

  return null
}

function resolveAirtableStaff(fields: JsonRecord) {
  return resolveStaff(fields.Technician || fields.Assignee || fields['Assign to'] || fields.Operator || fields['Techs Scheduled'])
}

function importAirtable() {
  const existing = {
    maintenance_logs: queryExternalIds('maintenance_logs'),
    walkthrough_logs: queryExternalIds('walkthrough_logs'),
    inventory: queryExternalIds('inventory'),
    parts_orders: queryExternalIds('parts_orders'),
    rma_trackers: queryExternalIds('rma_trackers'),
  }

  let inventoryProgress = 0

  for (const file of fs.readdirSync(AIRTABLE_RECORDS_DIR)) {
    if (!file.endsWith('.json')) continue
    const base = readJson<JsonRecord>(path.join(AIRTABLE_RECORDS_DIR, file))
    const baseName = base.name || file

    for (const [tableName, rows] of Object.entries(base.tables || {})) {
      const lowerTable = String(tableName).toLowerCase()
      let target: 'maintenance_logs' | 'walkthrough_logs' | 'inventory' | 'parts_orders' | 'rma_trackers' | null = null

      if (lowerTable.startsWith('maintenance')) target = 'maintenance_logs'
      else if (lowerTable.startsWith('walkthrough')) target = 'walkthrough_logs'
      else if (lowerTable.startsWith('issue')) target = 'maintenance_logs'
      else if (lowerTable.startsWith('inventory')) target = 'inventory'
      else if (lowerTable.startsWith('parts') && lowerTable.includes('request')) target = 'parts_orders'
      else if (lowerTable.startsWith('restock orders')) target = 'parts_orders'
      else if (lowerTable.startsWith('rma')) target = 'rma_trackers'

      if (!target) continue

      const prepared: JsonRecord[] = []

      for (const record of rows as JsonRecord[]) {
        const fields = record.fields || {}
        const stats = bucket('airtable', target)
        if (existing[target].has(record.id)) {
          stats.skipped += 1
          continue
        }

        const venue = resolveAirtableVenue(record, fields)
        const staff = resolveAirtableStaff(fields)
        const baseNotes = stripHtml(
          fields.Notes || fields.Description || fields.Details || fields['Scope of Work'] || fields['ANC Action'] || '',
        )

        if ((target === 'walkthrough_logs' || target === 'maintenance_logs') && !venue) {
          stats.skipped += 1
          stats.unmapped += 1
          continue
        }

        if (target === 'walkthrough_logs') {
          prepared.push({
            external_id: record.id,
            venue_id: venue?.id || null,
            technician_id: staff?.id || null,
            log_date: toDate(fields['Log Date'] || fields['Created Time'] || record.createdTime),
            log_time: csv(fields['Log Time']),
            locations_visited: csv(fields['Locations Visited']),
            issues_found: csv(fields['Problem Detected']),
            result: (() => {
              const raw = String(fields.Result || '').toLowerCase()
              if (raw.includes('problem')) return 'problem'
              if (raw.includes('partial')) return 'partial'
              return 'good'
            })(),
            in_person: /in-person/i.test(String(fields.Type || '')),
            technician_name: csv(fields.Technician),
            three_letter_code: csv(fields['Three Letter Code'] || fields['Three Letter Code (from Affected Displays)']),
            notes: baseNotes || null,
            created_at: toTimestamp(record.createdTime),
            updated_at: toTimestamp(fields['Last Modified']) || toTimestamp(record.createdTime),
          })
        } else if (target === 'maintenance_logs') {
          prepared.push({
            external_id: record.id,
            venue_id: venue?.id || null,
            asset_id: null,
            station_id: null,
            technician_id: staff?.id || null,
            maintenance_type: csv(fields['Maintenance Type']) || (lowerTable.startsWith('issue') ? 'reactive' : null),
            issue: csv(fields['Issue Summary'] || fields['Short Issue Description'] || fields.Name || tableName),
            issue_summary: csv(fields['Observed State']),
            details_to_resolve: baseNotes || null,
            status: mapStatus('maintenance_logs', fields.Status || fields.State, null, null),
            reported_date: toDate(fields['Date Reported'] || fields.Created || record.createdTime),
            scheduled_date: toDate(fields['Scheduled Date']),
            scheduled_end_time: null,
            completed_date: toDate(fields['Closed Date']),
            last_updated: toTimestamp(fields['Last Modified'] || fields['Last Update Time']) || toTimestamp(record.createdTime),
            escort_information: null,
            location_reported: csv(fields.Location || fields.Station),
            techs_scheduled: csv(fields['Techs Scheduled'] || fields['Assign to']),
            created_at: toTimestamp(record.createdTime),
            updated_at: toTimestamp(fields['Last Modified'] || fields['Last Update Time']) || toTimestamp(record.createdTime),
          })
        } else if (target === 'parts_orders') {
          prepared.push({
            external_id: record.id,
            venue_id: venue?.id || null,
            part_id: null,
            parts_needed: csv(fields.Part || fields.Name || fields.Title) || `Airtable ${tableName}`,
            quantity: toNumber(fields.Quantity || fields['Units Arrived']) || 1,
            requestor_name: csv(fields.Requestor || fields.Name),
            requestor_email: null,
            shipping_address: csv(fields['Shipping Address'] || fields['Storage Location (from Part)']),
            notes: baseNotes || null,
            photo_url: null,
            status: String(fields.Status || fields.State || 'requested').toLowerCase().replace(/\s+/g, '_'),
            wrike_task_id: null,
            created_at: toTimestamp(record.createdTime),
            updated_at: toTimestamp(record.createdTime),
          })
        } else if (target === 'rma_trackers') {
          prepared.push({
            external_id: record.id,
            venue_id: venue?.id || null,
            company_name: baseName,
            client_name: null,
            submission_contact: csv(fields.Submitter),
            date_received: toDate(fields['Ship Date'] || record.createdTime),
            project_code: null,
            part_number: csv(fields.ID),
            part_name: csv(fields.Name),
            model_number: null,
            led_manufacturer: csv(fields.Manufacturer),
            description: baseNotes || null,
            quantities: toNumber(fields['#Shipped (LUs)'] || fields.LUs),
            repair_vendor: null,
            shipping_method: null,
            shipment_tracking: null,
            parts_details: null,
            remit_to_stock: null,
            status: String(fields.Status || 'open').toLowerCase().replace(/\s+/g, '_'),
            notes: baseNotes || null,
            created_at: toTimestamp(record.createdTime),
            updated_at: toTimestamp(record.createdTime),
          })
        } else if (target === 'inventory') {
          if (!venue) {
            stats.skipped += 1
            stats.unmapped += 1
            continue
          }

          const itemName = csv(fields['Part Name'] || fields.Name || fields.Title || fields.Product)
          if (!itemName) {
            stats.unmapped += 1
            continue
          }

          const match = queryRows<{ id: string }>(
            `SELECT id FROM inventory
             WHERE ${venue?.id ? `venue_id = ${sqlLiteral(venue.id)} AND` : 'venue_id IS NULL AND'}
                   LOWER(item_name) = LOWER(${sqlLiteral(itemName)})
             LIMIT 1`,
          )[0]

          if (match) {
            execSql(`
              UPDATE inventory
              SET manufacturer = COALESCE(manufacturer, ${quoteNullable(csv(fields.Manufacturer))}),
                  model_name = COALESCE(model_name, ${quoteNullable(csv(fields.Model))}),
                  model_number = COALESCE(model_number, ${quoteNullable(csv(fields['Model Number']))}),
                  part_number = COALESCE(part_number, ${quoteNullable(csv(fields['Product ID'] || fields.ID))}),
                  part_name = COALESCE(part_name, ${quoteNullable(csv(fields['Part Name']))}),
                  location_code = COALESCE(location_code, ${quoteNullable(csv(fields['Storage Location']))}),
                  notes = COALESCE(notes, ${quoteNullable(baseNotes)}),
                  external_id = COALESCE(external_id, ${sqlLiteral(record.id)}),
                  last_updated = NOW()
              WHERE id = ${sqlLiteral(match.id)}
            `)
            stats.updated += 1
          } else {
            execSql(`
              INSERT INTO inventory (
                external_id, venue_id, item_name, sku, quantity, manufacturer, model_name, model_number,
                part_number, part_name, location_code, notes, last_updated
              ) VALUES (
                ${sqlLiteral(record.id)},
                ${venue?.id ? sqlLiteral(venue.id) : 'NULL'},
                ${sqlLiteral(itemName)},
                ${quoteNullable(csv(fields.ID || fields['Product ID']))},
                ${toNumber(fields.Inventory) ?? 0},
                ${quoteNullable(csv(fields.Manufacturer))},
                ${quoteNullable(csv(fields.Model))},
                ${quoteNullable(csv(fields['Model Number']))},
                ${quoteNullable(csv(fields['Product ID']))},
                ${quoteNullable(csv(fields['Part Name']))},
                ${quoteNullable(csv(fields['Storage Location']))},
                ${quoteNullable(baseNotes)},
                NOW()
              )
            `)
            stats.new += 1
          }

          inventoryProgress += 1
          if (inventoryProgress % 100 === 0) console.log(`[airtable:inventory] processed ${inventoryProgress}`)
          continue
        }

        for (const key of Object.keys(fields)) {
          if (![
            'Name', 'Title', 'Status', 'State', 'Venue', 'Venue Name', 'Venue (from Storage Location)',
            'Venue (from Stations)', 'Venue (from Affected Displays)', 'Technician', 'Assignee',
            'Assign to', 'Operator', 'Techs Scheduled', 'Description', 'Details', 'Notes',
            'Scope of Work', 'ANC Action', 'Log Date', 'Created Time', 'Locations Visited',
            'Problem Detected', 'Result', 'Type', 'Three Letter Code', 'Three Letter Code (from Affected Displays)',
            'Log Time', 'Last Modified', 'Issue Summary', 'Short Issue Description', 'Observed State',
            'Date Reported', 'Created', 'Scheduled Date', 'Closed Date', 'Last Update Time', 'Location',
            'Station', 'Maintenance Type', 'Part', 'Quantity', 'Requestor', 'Shipping Address',
            'Storage Location (from Part)', 'Ship Date', 'ID', '#Shipped (LUs)', 'LUs', 'Manufacturer',
            'Product ID', 'Part Name', 'Product', 'Inventory', 'Model', 'Model Number', 'Storage Location',
          ].includes(key)) {
            stats.unmapped += 1
          }
        }
      }

      if (target !== 'inventory' && prepared.length) {
        for (const batch of chunk(prepared, 100)) {
          if (target === 'walkthrough_logs') {
            execSql(`
              WITH input AS (${jsonRecordset([
                'external_id text', 'venue_id text', 'technician_id text', 'log_date text', 'log_time text',
                'locations_visited text', 'issues_found text', 'result text', 'in_person text',
                'technician_name text', 'three_letter_code text', 'notes text', 'created_at text', 'updated_at text',
              ], batch)})
              INSERT INTO walkthrough_logs (
                external_id, venue_id, technician_id, log_date, log_time, locations_visited, issues_found,
                result, in_person, technician_name, three_letter_code, notes, created_at, updated_at
              )
              SELECT
                i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.technician_id, '')::uuid,
                NULLIF(i.log_date, '')::date, NULLIF(i.log_time, ''), NULLIF(i.locations_visited, ''),
                NULLIF(i.issues_found, ''), COALESCE(NULLIF(i.result, ''), 'good'),
                CASE WHEN LOWER(COALESCE(i.in_person, '')) IN ('true','t','1','yes') THEN true ELSE false END,
                NULLIF(i.technician_name, ''), NULLIF(i.three_letter_code, ''), NULLIF(i.notes, ''),
                COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
              FROM input i
              WHERE NOT EXISTS (SELECT 1 FROM walkthrough_logs w WHERE w.external_id = i.external_id)
            `)
          } else if (target === 'maintenance_logs') {
            execSql(`
              WITH input AS (${jsonRecordset([
                'external_id text', 'venue_id text', 'asset_id text', 'station_id text', 'technician_id text',
                'maintenance_type text', 'issue text', 'issue_summary text', 'details_to_resolve text',
                'status text', 'reported_date text', 'scheduled_date text', 'scheduled_end_time text',
                'completed_date text', 'last_updated text', 'escort_information text', 'location_reported text',
                'techs_scheduled text', 'created_at text', 'updated_at text',
              ], batch)})
              INSERT INTO maintenance_logs (
                external_id, venue_id, asset_id, station_id, technician_id, maintenance_type, issue, issue_summary,
                details_to_resolve, status, reported_date, scheduled_date, scheduled_end_time, completed_date,
                last_updated, escort_information, location_reported, techs_scheduled, created_at, updated_at
              )
              SELECT
                i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.asset_id, '')::uuid, NULLIF(i.station_id, '')::uuid,
                NULLIF(i.technician_id, '')::uuid, NULLIF(i.maintenance_type, ''), NULLIF(i.issue, ''),
                NULLIF(i.issue_summary, ''), NULLIF(i.details_to_resolve, ''), COALESCE(NULLIF(i.status, ''), 'open'),
                NULLIF(i.reported_date, '')::date, NULLIF(i.scheduled_date, '')::date, NULLIF(i.scheduled_end_time, '')::time,
                NULLIF(i.completed_date, '')::date, COALESCE(NULLIF(i.last_updated, '')::timestamptz, NOW()),
                NULLIF(i.escort_information, ''), NULLIF(i.location_reported, ''), NULLIF(i.techs_scheduled, ''),
                COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
              FROM input i
              WHERE NOT EXISTS (SELECT 1 FROM maintenance_logs m WHERE m.external_id = i.external_id)
            `)
          } else if (target === 'parts_orders') {
            execSql(`
              WITH input AS (${jsonRecordset([
                'external_id text', 'venue_id text', 'part_id text', 'parts_needed text', 'quantity text',
                'requestor_name text', 'requestor_email text', 'shipping_address text', 'notes text', 'photo_url text',
                'status text', 'wrike_task_id text', 'created_at text', 'updated_at text',
              ], batch)})
              INSERT INTO parts_orders (
                external_id, venue_id, part_id, parts_needed, quantity, requestor_name, requestor_email,
                shipping_address, notes, photo_url, status, wrike_task_id, created_at, updated_at
              )
              SELECT
                i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.part_id, '')::uuid, i.parts_needed,
                COALESCE(NULLIF(i.quantity, '')::int, 1), NULLIF(i.requestor_name, ''), NULLIF(i.requestor_email, ''),
                NULLIF(i.shipping_address, ''), NULLIF(i.notes, ''), NULLIF(i.photo_url, ''),
                COALESCE(NULLIF(i.status, ''), 'requested'), NULLIF(i.wrike_task_id, ''),
                COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
              FROM input i
              WHERE NOT EXISTS (SELECT 1 FROM parts_orders p WHERE p.external_id = i.external_id)
            `)
          } else if (target === 'rma_trackers') {
            execSql(`
              WITH input AS (${jsonRecordset([
                'external_id text', 'venue_id text', 'company_name text', 'client_name text', 'submission_contact text',
                'date_received text', 'project_code text', 'part_number text', 'part_name text', 'model_number text',
                'led_manufacturer text', 'description text', 'quantities text', 'repair_vendor text', 'shipping_method text',
                'shipment_tracking text', 'parts_details text', 'remit_to_stock text', 'status text', 'notes text',
                'created_at text', 'updated_at text',
              ], batch)})
              INSERT INTO rma_trackers (
                external_id, venue_id, company_name, client_name, submission_contact, date_received,
                project_code, part_number, part_name, model_number, led_manufacturer, description,
                quantities, repair_vendor, shipping_method, shipment_tracking, parts_details,
                remit_to_stock, status, notes, created_at, updated_at
              )
              SELECT
                i.external_id, NULLIF(i.venue_id, '')::uuid, NULLIF(i.company_name, ''), NULLIF(i.client_name, ''),
                NULLIF(i.submission_contact, ''), NULLIF(i.date_received, '')::date, NULLIF(i.project_code, ''),
                NULLIF(i.part_number, ''), NULLIF(i.part_name, ''), NULLIF(i.model_number, ''),
                NULLIF(i.led_manufacturer, ''), NULLIF(i.description, ''), NULLIF(i.quantities, '')::int,
                NULLIF(i.repair_vendor, ''), NULLIF(i.shipping_method, ''), NULLIF(i.shipment_tracking, ''),
                NULLIF(i.parts_details, ''),
                CASE
                  WHEN LOWER(COALESCE(i.remit_to_stock, '')) IN ('true', 't', '1', 'yes') THEN true
                  WHEN LOWER(COALESCE(i.remit_to_stock, '')) IN ('false', 'f', '0', 'no') THEN false
                  ELSE NULL
                END,
                COALESCE(NULLIF(i.status, ''), 'open'),
                NULLIF(i.notes, ''), COALESCE(NULLIF(i.created_at, '')::timestamptz, NOW()), COALESCE(NULLIF(i.updated_at, '')::timestamptz, NOW())
              FROM input i
              WHERE NOT EXISTS (SELECT 1 FROM rma_trackers r WHERE r.external_id = i.external_id)
            `)
          }

          bucket('airtable', target).new += batch.length
          if (bucket('airtable', target).new % 100 === 0) console.log(`[airtable:${target}] inserted ${bucket('airtable', target).new}`)
        }
      }
    }
  }
}

function printSummary() {
  console.log('\nSource      Target                  New   Updated  Skipped  Unmapped')
  console.log('-------------------------------------------------------------------')
  const entries = Array.from(summary.entries()).sort(([a], [b]) => a.localeCompare(b))
  for (const [key, stats] of entries) {
    const [source, target] = key.split('::')
    const row = [
      source.padEnd(11),
      target.padEnd(23),
      String(stats.new).padEnd(5),
      String(stats.updated).padEnd(8),
      String(stats.skipped).padEnd(8),
      String(stats.unmapped).padEnd(8),
    ].join(' ')
    console.log(row)
  }

  const topVenueMisses = Array.from(venueMisses.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
  const topStaffMisses = Array.from(staffMisses.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)

  console.log('\nvenue_map misses')
  for (const [name, count] of topVenueMisses) console.log(`- ${name} (${count})`)

  console.log('\nstaff_map misses')
  for (const [name, count] of topStaffMisses) console.log(`- ${name} (${count})`)
}

async function main() {
  if (!fs.existsSync(WRIKE_DIR) || !fs.existsSync(AIRTABLE_DIR)) {
    throw new Error('Wrike or Airtable export directory is missing')
  }

  console.log('Loading DB lookups...')
  loadDbLookups()
  console.log(`Loaded ${allVenues.length} venues and ${staffByEmail.size} staff emails`)

  console.log('Building export indexes...')
  loadWrikeLookups()
  loadAirtableIndex()

  console.log('Ensuring idempotency columns...')
  ensureImportColumns()

  console.log('Importing Wrike tasks...')
  const designBudgetKeyByExternalId = importWrikeTasks()

  console.log('Importing Wrike timelogs...')
  importWrikeTimelogs(designBudgetKeyByExternalId)

  console.log('Importing Airtable records...')
  importAirtable()

  printSummary()
}

main().catch((error) => {
  console.error('Import failed:', error)
  process.exit(1)
})
