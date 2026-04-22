export {}

export {}

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_METADATA_URL = `${TWENTY_BASE}/metadata`
const TWENTY_API_KEY =
  process.env.TWENTY_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODQ3NjQwLCJleHAiOjQ5Mjg0NDc2MzUsImp0aSI6IjdjZWEzNjVkLWI5ODEtNDViZC04MTY1LWRiZjgwOWJjYjQ4YiJ9.rW3KyyKgCVJrQX5WvbYHw62UNX_VkgO5ehLybXTd4bY'

type MetadataObject = {
  id: string
  nameSingular: string
  namePlural: string
  labelSingular: string
  labelPlural: string
}

type MetadataField = {
  id: string
  name: string
  label: string
  type: string
}

const STATUS_OPTIONS = [
  { value: 'new_job', label: 'New Job', position: 0, color: 'gray' },
  { value: 'awaiting_layout', label: 'Awaiting Layout', position: 1, color: 'blue' },
  { value: 'awaiting_approval', label: 'Awaiting Approval', position: 2, color: 'orange' },
  { value: 'approved', label: 'Approved', position: 3, color: 'green' },
  { value: 'in_production', label: 'In Production', position: 4, color: 'purple' },
  { value: 'shipped', label: 'Shipped', position: 5, color: 'blue' },
  { value: 'invoiced', label: 'Invoiced', position: 6, color: 'green' },
]

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
            labelSingular
            labelPlural
          }
        }
      }
    }
  `)

  return data.objects.edges.map((edge) => edge.node)
}

async function getObjectWithFields(objectId: string) {
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
              label
              type
            }
          }
        }
      }
    }
  `, { id: objectId })

  return data.object
}

async function createObject(): Promise<string> {
  const data = await gql<{ createOneObject: { id: string } }>(`
    mutation CreatePrintRequestObject($input: CreateObjectInput!) {
      createOneObject(input: { object: $input }) {
        id
      }
    }
  `, {
    input: {
      nameSingular: 'printRequest',
      namePlural: 'printRequests',
      labelSingular: 'Print Request',
      labelPlural: 'Print Requests',
      icon: 'IconPrinter',
      description: 'Third-party print signage workflow — quotes, production, shipping, and invoicing',
      isLabelIdentifier: false,
    },
  })

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

async function main() {
  const objects = await listObjects()
  const company = objects.find((object) => object.nameSingular === 'company')
  if (!company) throw new Error('Company object not found in Twenty metadata')

  let printRequest = objects.find((object) => object.nameSingular === 'printRequest')
  if (!printRequest) {
    const createdId = await createObject()
    printRequest = {
      id: createdId,
      nameSingular: 'printRequest',
      namePlural: 'printRequests',
      labelSingular: 'Print Request',
      labelPlural: 'Print Requests',
    }
    console.log(`Created printRequest object: ${createdId}`)
  } else {
    console.log(`printRequest object already exists: ${printRequest.id}`)
  }

  const objectWithFields = await getObjectWithFields(printRequest.id)
  const fields = new Map(objectWithFields.fields.edges.map((edge) => [edge.node.name, edge.node]))

  const ensureField = async (name: string, input: Record<string, unknown>) => {
    const existing = fields.get(name)
    if (existing) {
      console.log(`Skip ${name} (${existing.type})`)
      return
    }
    const created = await createField({
      objectMetadataId: printRequest!.id,
      isNullable: true,
      ...input,
    })
    console.log(`Created ${created.createOneField.name} (${created.createOneField.type})`)
  }

  await ensureField('status', {
    type: 'SELECT',
    name: 'status',
    label: 'Status',
    icon: 'IconProgressCheck',
    defaultValue: "'new_job'",
    options: STATUS_OPTIONS,
  })

  await ensureField('printClient', {
    type: 'RELATION',
    name: 'printClient',
    label: 'Client',
    icon: 'IconBuilding',
    relationCreationPayload: {
      type: 'MANY_TO_ONE',
      targetObjectMetadataId: company.id,
      targetFieldLabel: 'Print Requests',
      targetFieldIcon: 'IconPrinter',
      targetFieldName: 'printRequests',
    },
  })

  await ensureField('shippingAddress', {
    type: 'TEXT',
    name: 'shippingAddress',
    label: 'Shipping Address',
    icon: 'IconMapPin',
  })

  await ensureField('shipDate', {
    type: 'DATE',
    name: 'shipDate',
    label: 'Ship Date',
    icon: 'IconCalendarDue',
  })

  await ensureField('arrivalDate', {
    type: 'DATE',
    name: 'arrivalDate',
    label: 'Arrival Date',
    icon: 'IconCalendarCheck',
  })

  await ensureField('invoiceAmount', {
    type: 'NUMBER',
    name: 'invoiceAmount',
    label: 'Invoice Amount',
    icon: 'IconReceipt2',
  })

  await ensureField('britainNotes', {
    type: 'TEXT',
    name: 'britainNotes',
    label: 'Britain Notes',
    icon: 'IconNotes',
  })

  await ensureField('proofLinks', {
    type: 'TEXT',
    name: 'proofLinks',
    label: 'Proof Links',
    icon: 'IconLink',
  })

  const refreshed = await getObjectWithFields(printRequest.id)
  const fieldNames = refreshed.fields.edges.map((edge) => edge.node.name).sort()
  console.log(`printRequest fields ready: ${fieldNames.join(', ')}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
