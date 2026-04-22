export {}

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODQ3NjQwLCJleHAiOjQ5Mjg0NDc2MzUsImp0aSI6IjdjZWEzNjVkLWI5ODEtNDViZC04MTY1LWRiZjgwOWJjYjQ4YiJ9.rW3KyyKgCVJrQX5WvbYHw62UNX_VkgO5ehLybXTd4bY'

if (!TWENTY_API_KEY) {
  console.error('TWENTY_API_KEY is required')
  process.exit(1)
}

type TemplateRecord = {
  id: string
  name: string | null
  league: string | null
  items: unknown
}

const TEMPLATES = [
  {
    name: 'MLB Season Prep',
    league: 'MLB',
    items: [
      {
        phase: '90_day',
        name: 'Structural inspection and winter damage review',
        itemDescription: 'Inspect all ANC-serviced structural mounting points, exposed cabling, rack rooms, and environmental seals for off-season wear before baseball load-in starts.',
        defaultAssigneeRole: 'tech_support',
      },
      {
        phase: '60_day',
        name: 'LED drift calibration and color balance pass',
        itemDescription: 'Run a full calibration sweep across ribbon boards, scoreboards, and concourse displays to catch drift, mismatched modules, and brightness inconsistencies before creative testing.',
        defaultAssigneeRole: 'technician',
      },
      {
        phase: '30_day',
        name: 'Content schedule lock with enterprise solutions',
        itemDescription: 'Confirm opening homestand sponsor rotations, control-room playlists, and any special opening-series graphics with Alexis and the venue operations lead.',
        defaultAssigneeRole: 'manager',
      },
      {
        phase: 'opening_week',
        name: 'Dry run and soft launch of game-day workflows',
        itemDescription: 'Execute a simulated game-day sequence including control-room playback, escalation paths, operator handoff, and emergency contact verification.',
        defaultAssigneeRole: 'tech_support',
      },
      {
        phase: 'opening_day',
        name: 'On-site team deployed and escalation channel active',
        itemDescription: 'Confirm on-site coverage, verify radios and contact trees, and keep the dedicated escalation channel open from gates through final out.',
        defaultAssigneeRole: 'manager',
      },
    ],
  },
  {
    name: 'NHL Season Prep',
    league: 'NHL',
    items: [
      {
        phase: '90_day',
        name: 'Ice-season infrastructure and bowl audit',
        itemDescription: 'Review bowl infrastructure, catwalk access, DAS touchpoints, and any arena changes that affect LED access or operator sightlines before preseason production ramps up.',
        defaultAssigneeRole: 'tech_support',
      },
      {
        phase: '60_day',
        name: 'Center-hung and ribbon calibration for hockey mode',
        itemDescription: 'Validate hockey-specific color profiles, stanchion camera-safe brightness, and center-hung integrations used during puck drop and in-game sponsor rotations.',
        defaultAssigneeRole: 'technician',
      },
      {
        phase: '30_day',
        name: 'Preseason content package and rotation lock',
        itemDescription: 'Finalize anthem, player-intro, and sponsor content sequencing with the arena presentation team so preseason and regular-season playlists are aligned.',
        defaultAssigneeRole: 'manager',
      },
      {
        phase: 'opening_week',
        name: 'Arena dry run with control-room and presentation crew',
        itemDescription: 'Run a full presentation rehearsal with control-room operators, audio, lighting, and ANC support so intermission and goal-event triggers are validated end to end.',
        defaultAssigneeRole: 'tech_support',
      },
      {
        phase: 'opening_day',
        name: 'Puck-drop support coverage and escalation readiness',
        itemDescription: 'Ensure ANC support is on-site for puck drop, confirm escalation contacts are live, and keep real-time communication open through post-game shutdown.',
        defaultAssigneeRole: 'manager',
      },
    ],
  },
] as const

async function twentyFetch(path: string, init: RequestInit = {}) {
  const response = await fetch(`${TWENTY_BASE}/rest/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  return response
}

async function fetchAllTemplates() {
  const templates: TemplateRecord[] = []
  let cursor: string | null = null

  for (let page = 0; page < 50; page++) {
    const params = new URLSearchParams({ limit: '60', depth: '1' })
    if (cursor) params.set('starting_after', cursor)

    const response = await twentyFetch(`openingChecklistTemplates?${params.toString()}`)
    if (!response.ok) {
      throw new Error(`Failed to list opening checklist templates: ${response.status} ${await response.text()}`)
    }

    const body = await response.json()
    const items = body?.data?.openingChecklistTemplates || []
    templates.push(...items)

    const pageInfo = body?.pageInfo || body?.data?.pageInfo
    if (!pageInfo?.hasNextPage || !pageInfo?.endCursor) break
    cursor = pageInfo.endCursor
  }

  return templates
}

async function createTemplate(template: (typeof TEMPLATES)[number]) {
  const response = await twentyFetch('openingChecklistTemplates', {
    method: 'POST',
    body: JSON.stringify(template),
  })
  if (!response.ok) {
    throw new Error(`Failed to create template ${template.name}: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const key = Object.keys(body?.data || {})[0]
  return body.data[key] as TemplateRecord
}

async function updateTemplate(id: string, template: (typeof TEMPLATES)[number]) {
  const response = await twentyFetch(`openingChecklistTemplates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(template),
  })
  if (!response.ok) {
    throw new Error(`Failed to update template ${template.name}: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const key = Object.keys(body?.data || {})[0]
  return body.data[key] as TemplateRecord
}

async function main() {
  const existing = await fetchAllTemplates()
  const byName = new Map(existing.map((template) => [template.name || '', template]))

  for (const template of TEMPLATES) {
    const existingTemplate = byName.get(template.name)
    if (existingTemplate) {
      const updated = await updateTemplate(existingTemplate.id, template)
      console.log(`Updated ${template.name}: ${updated.id}`)
    } else {
      const created = await createTemplate(template)
      console.log(`Created ${template.name}: ${created.id}`)
    }
  }

  const finalTemplates = await fetchAllTemplates()
  for (const template of TEMPLATES) {
    const record = finalTemplates.find((entry) => entry.name === template.name)
    if (record) console.log(`${template.name} template id: ${record.id}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
