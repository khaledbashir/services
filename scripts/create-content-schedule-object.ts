/**
 * Idempotent Twenty CRM custom-object creator for `contentSchedule`.
 *
 * Run once (or re-run safely — it checks before creating):
 *   npx tsx scripts/create-content-schedule-object.ts
 *
 * Creates:
 *   - Custom object: contentSchedule (plural: contentSchedules)
 *   - Fields: name, venue (relation), client (relation to company),
 *             runStartDate, runEndDate, status (select), notes
 */

export {}

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

if (!TWENTY_API_KEY) {
  console.error('❌  TWENTY_API_KEY env var is required')
  process.exit(1)
}

async function twentyFetch(path: string, init: RequestInit = {}) {
  const url = path.startsWith('http') ? path : `${TWENTY_BASE}${path.startsWith('/') ? '/rest' : '/rest/'}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  return res
}

async function findObjectBySingular(slug: string) {
  const res = await twentyFetch('objects', { method: 'GET' })
  if (!res.ok) return null
  const body = await res.json()
  const objects = body?.data?.objects || []
  return objects.find((o: any) => o.nameSingular === slug || o.slug === slug)
}

async function createObject() {
  const res = await twentyFetch('objects', {
    method: 'POST',
    body: JSON.stringify({
      nameSingular: 'contentSchedule',
      namePlural: 'contentSchedules',
      labelSingular: 'Content Schedule',
      labelPlural: 'Content Schedules',
      icon: 'IconCalendar',
      description: 'In-venue content run tracking — replaces Wrike content-schedule workflow',
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Create object failed: ${res.status} ${text}`)
  }
  const body = await res.json()
  return body?.data?.createObject || body?.data?.object
}

async function findField(objectId: string, fieldSlug: string) {
  const res = await twentyFetch(`objects/${objectId}/fields`, { method: 'GET' })
  if (!res.ok) return null
  const body = await res.json()
  const fields = body?.data?.fields || []
  return fields.find((f: any) => f.slug === fieldSlug || f.name === fieldSlug)
}

async function createField(objectId: string, payload: Record<string, unknown>) {
  const res = await twentyFetch(`objects/${objectId}/fields`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    console.warn(`  ⚠ Field "${payload.name}" may already exist: ${res.status} ${text.slice(0, 120)}`)
    return null
  }
  const body = await res.json()
  return body?.data?.createField || body?.data?.field
}

async function main() {
  console.log('🔍  Looking for existing contentSchedule object…')
  let obj = await findObjectBySingular('contentSchedule')

  if (obj) {
    console.log(`✅  Object already exists (id: ${obj.id})`)
  } else {
    console.log('📝  Creating contentSchedule object…')
    obj = await createObject()
    console.log(`✅  Created object (id: ${obj.id})`)
  }

  const objectId = obj.id

  const fields: Array<Record<string, unknown>> = [
    {
      name: 'name',
      label: 'Name',
      type: 'TEXT',
      description: 'Content run name (e.g. "Bulgari test at Moynihan")',
      isRequired: true,
    },
    {
      name: 'runStartDate',
      label: 'Run Start Date',
      type: 'DATE',
      description: 'When the content run begins',
    },
    {
      name: 'runEndDate',
      label: 'Run End Date',
      type: 'DATE',
      description: 'When the content run ends — auto-stale logic uses this',
    },
    {
      name: 'status',
      label: 'Status',
      type: 'SELECT',
      description: 'Content run status pipeline',
      options: JSON.stringify([
        { value: 'ready', label: 'Ready', color: 'green' },
        { value: 'in_queue', label: 'In Queue', color: 'violet' },
        { value: 'scheduled_to_launch', label: 'Scheduled to Launch', color: 'amber' },
        { value: 'content_live', label: 'Content Live', color: 'blue' },
        { value: 'confirmed_live', label: 'Confirmed Live with Client', color: 'emerald' },
      ]),
    },
    {
      name: 'notes',
      label: 'Notes',
      type: 'TEXT',
      description: 'Additional notes about the content run',
    },
  ]

  // Relation fields — these reference other objects
  const relationFields: Array<Record<string, unknown>> = [
    {
      name: 'contentScheduleVenue',
      label: 'Venue',
      type: 'RELATION',
      relationType: 'MANY_TO_ONE',
      relationObject: 'venues',
      relationTargetField: 'venueContentSchedules',
      description: 'The venue where this content run takes place',
    },
    {
      name: 'contentScheduleClient',
      label: 'Client',
      type: 'RELATION',
      relationType: 'MANY_TO_ONE',
      relationObject: 'companies',
      relationTargetField: 'companyContentSchedules',
      description: 'The client/company for this content run',
    },
  ]

  console.log(`\n📝  Creating scalar fields on ${objectId}…`)
  for (const f of fields) {
    const existing = await findField(objectId, f.name as string)
    if (existing) {
      console.log(`  ⏭  ${f.name} already exists`)
    } else {
      const created = await createField(objectId, { ...f, objectId })
      console.log(created ? `  ✅  ${f.name}` : `  ⚠  ${f.name} (skipped)`)
    }
  }

  console.log(`\n📝  Creating relation fields on ${objectId}…`)
  for (const f of relationFields) {
    const existing = await findField(objectId, f.name as string)
    if (existing) {
      console.log(`  ⏭  ${f.name} already exists`)
    } else {
      const created = await createField(objectId, { ...f, objectId })
      console.log(created ? `  ✅  ${f.name}` : `  ⚠  ${f.name} (skipped)`)
    }
  }

  console.log('\n🎉  contentSchedule object + fields ready in Twenty.')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
