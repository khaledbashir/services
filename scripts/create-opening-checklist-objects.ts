export {}

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_METADATA_URL = `${TWENTY_BASE}/metadata`
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODQ3NjQwLCJleHAiOjQ5Mjg0NDc2MzUsImp0aSI6IjdjZWEzNjVkLWI5ODEtNDViZC04MTY1LWRiZjgwOWJjYjQ4YiJ9.rW3KyyKgCVJrQX5WvbYHw62UNX_VkgO5ehLybXTd4bY'

const VENUE_OBJECT_ID = '136fe14f-02d3-4a6f-bf4a-81abaf6f77f1'
const TECHNICIAN_OBJECT_ID = '2b49694c-f341-4992-9675-a1f3b8e1e898'

type MetadataObject = {
  id: string
  nameSingular: string
  namePlural: string
}

type MetadataField = {
  id: string
  name: string
  type: string
}

const LEAGUE_OPTIONS = [
  { value: 'MLB', label: 'MLB', position: 0, color: 'blue' },
  { value: 'NBA', label: 'NBA', position: 1, color: 'orange' },
  { value: 'NHL', label: 'NHL', position: 2, color: 'sky' },
  { value: 'NFL', label: 'NFL', position: 3, color: 'green' },
  { value: 'NCAA', label: 'NCAA', position: 4, color: 'violet' },
  { value: 'OTHER', label: 'Other', position: 5, color: 'gray' },
] as const

const PHASE_OPTIONS = [
  { value: '90_day', label: '90 Day', position: 0, color: 'violet' },
  { value: '60_day', label: '60 Day', position: 1, color: 'blue' },
  { value: '30_day', label: '30 Day', position: 2, color: 'amber' },
  { value: 'opening_week', label: 'Opening Week', position: 3, color: 'orange' },
  { value: 'opening_day', label: 'Opening Day', position: 4, color: 'green' },
] as const

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', position: 0, color: 'gray' },
  { value: 'in_progress', label: 'In Progress', position: 1, color: 'blue' },
  { value: 'blocked', label: 'Blocked', position: 2, color: 'red' },
  { value: 'complete', label: 'Complete', position: 3, color: 'green' },
  { value: 'skipped', label: 'Skipped', position: 4, color: 'yellow' },
] as const

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(TWENTY_METADATA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const payload = await response.json()
  if (!response.ok || payload.errors?.length) {
    throw new Error(payload.errors?.[0]?.message || `Metadata request failed: ${response.status}`)
  }
  return payload.data as T
}

async function listObjects(): Promise<MetadataObject[]> {
  const data = await gql<{ objects: { edges: Array<{ node: MetadataObject }> } }>(`
    query {
      objects(paging: { first: 200 }) {
        edges {
          node {
            id
            nameSingular
            namePlural
          }
        }
      }
    }
  `)

  return data.objects.edges.map((edge) => edge.node)
}

async function getObjectFields(objectId: string) {
  const data = await gql<{
    object: {
      id: string
      fields: { edges: Array<{ node: MetadataField }> }
    }
  }>(`
    query GetObject($id: UUID!) {
      object(id: $id) {
        id
        fields(paging: { first: 200 }) {
          edges {
            node {
              id
              name
              type
            }
          }
        }
      }
    }
  `, { id: objectId })

  return data.object.fields.edges.map((edge) => edge.node)
}

async function createObject(input: Record<string, unknown>): Promise<string> {
  const data = await gql<{ createOneObject: { id: string } }>(`
    mutation CreateObject($input: CreateObjectInput!) {
      createOneObject(input: { object: $input }) {
        id
      }
    }
  `, { input })
  return data.createOneObject.id
}

async function createField(input: Record<string, unknown>) {
  return gql<{ createOneField: { id: string; name: string; type: string } }>(`
    mutation CreateField($input: CreateFieldInput!) {
      createOneField(input: { field: $input }) {
        id
        name
        type
      }
    }
  `, { input })
}

async function ensureObject(
  objects: MetadataObject[],
  nameSingular: string,
  namePlural: string,
  labelSingular: string,
  labelPlural: string,
  icon: string,
  description: string,
) {
  let object = objects.find((entry) => entry.nameSingular === nameSingular)
  if (object) {
    console.log(`${nameSingular} object already exists: ${object.id}`)
    return object
  }

  const createdId = await createObject({
    nameSingular,
    namePlural,
    labelSingular,
    labelPlural,
    icon,
    description,
  })

  object = { id: createdId, nameSingular, namePlural }
  objects.push(object)
  console.log(`Created ${nameSingular} object: ${createdId}`)
  return object
}

async function ensureField(objectId: string, fields: MetadataField[], name: string, input: Record<string, unknown>) {
  const existing = fields.find((field) => field.name === name)
  if (existing) {
    console.log(`Skip ${name} (${existing.type})`)
    return
  }

  let created
  try {
    created = await createField({
      objectMetadataId: objectId,
      isNullable: true,
      ...input,
    })
  } catch (error) {
    throw new Error(`Failed on field "${name}": ${error instanceof Error ? error.message : String(error)}`)
  }

  fields.push({
    id: created.createOneField.id,
    name: created.createOneField.name,
    type: created.createOneField.type,
  })
  console.log(`Created ${created.createOneField.name} (${created.createOneField.type})`)
}

async function main() {
  const objects = await listObjects()

  const itemObject = await ensureObject(
    objects,
    'openingChecklistItem',
    'openingChecklistItems',
    'Opening Checklist Item',
    'Opening Checklist Items',
    'IconChecklist',
    '30/60/90 stadium opening prep tasks by venue, phase, assignee, and due date',
  )

  const templateObject = await ensureObject(
    objects,
    'openingChecklistTemplate',
    'openingChecklistTemplates',
    'Opening Checklist Template',
    'Opening Checklist Templates',
    'IconTemplate',
    'Pre-baked league templates for Gianni to clone into live stadium-opening prep plans',
  )

  const itemFields = await getObjectFields(itemObject.id)
  const templateFields = await getObjectFields(templateObject.id)

  console.log('\nOpening checklist item fields:')
  await ensureField(itemObject.id, itemFields, 'venue', {
    type: 'RELATION',
    name: 'venue',
    label: 'Venue',
    icon: 'IconBuildingStadium',
    relationCreationPayload: {
      type: 'MANY_TO_ONE',
      targetObjectMetadataId: VENUE_OBJECT_ID,
      targetFieldLabel: 'Opening Checklist Items',
      targetFieldIcon: 'IconChecklist',
      targetFieldName: 'openingChecklistItems',
    },
  })
  await ensureField(itemObject.id, itemFields, 'league', {
    type: 'SELECT',
    name: 'league',
    label: 'League',
    icon: 'IconTrophy',
    options: LEAGUE_OPTIONS,
  })
  await ensureField(itemObject.id, itemFields, 'phase', {
    type: 'SELECT',
    name: 'phase',
    label: 'Phase',
    icon: 'IconCalendarStats',
    options: PHASE_OPTIONS,
  })
  await ensureField(itemObject.id, itemFields, 'openingDate', {
    type: 'DATE',
    name: 'openingDate',
    label: 'Opening Date',
    icon: 'IconCalendarEvent',
  })
  await ensureField(itemObject.id, itemFields, 'dueDate', {
    type: 'DATE',
    name: 'dueDate',
    label: 'Due Date',
    icon: 'IconCalendarDue',
  })
  await ensureField(itemObject.id, itemFields, 'itemDescription', {
    type: 'RICH_TEXT',
    name: 'itemDescription',
    label: 'Item Description',
    icon: 'IconNotes',
  })
  await ensureField(itemObject.id, itemFields, 'checklistAssignee', {
    type: 'RELATION',
    name: 'checklistAssignee',
    label: 'Assignee',
    icon: 'IconUser',
    relationCreationPayload: {
      type: 'MANY_TO_ONE',
      targetObjectMetadataId: TECHNICIAN_OBJECT_ID,
      targetFieldLabel: 'Assigned Opening Checklist Items',
      targetFieldIcon: 'IconChecklist',
      targetFieldName: 'assignedOpeningChecklistItems',
    },
  })
  await ensureField(itemObject.id, itemFields, 'status', {
    type: 'SELECT',
    name: 'status',
    label: 'Status',
    icon: 'IconProgressCheck',
    defaultValue: "'pending'",
    options: STATUS_OPTIONS,
  })
  await ensureField(itemObject.id, itemFields, 'completedAt', {
    type: 'DATE_TIME',
    name: 'completedAt',
    label: 'Completed At',
    icon: 'IconCircleCheck',
  })
  await ensureField(itemObject.id, itemFields, 'notes', {
    type: 'RICH_TEXT',
    name: 'notes',
    label: 'Notes',
    icon: 'IconNotes',
  })

  console.log('\nOpening checklist template fields:')
  await ensureField(templateObject.id, templateFields, 'league', {
    type: 'SELECT',
    name: 'league',
    label: 'League',
    icon: 'IconTrophy',
    options: LEAGUE_OPTIONS,
  })
  await ensureField(templateObject.id, templateFields, 'items', {
    type: 'RAW_JSON',
    name: 'items',
    label: 'Items',
    icon: 'IconBraces',
  })

  const finalItemFieldNames = (await getObjectFields(itemObject.id)).map((field) => field.name).sort()
  const finalTemplateFieldNames = (await getObjectFields(templateObject.id)).map((field) => field.name).sort()
  console.log(`\nopeningChecklistItem fields ready: ${finalItemFieldNames.join(', ')}`)
  console.log(`openingChecklistTemplate fields ready: ${finalTemplateFieldNames.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
