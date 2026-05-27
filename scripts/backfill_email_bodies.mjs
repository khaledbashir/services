#!/usr/bin/env node
// One-shot backfill: replace "Email received from X. Subject: Y" descriptions
// with the real body from Twenty CRM. Operates on the last 50 email-source
// tickets that still have the empty-body fallback string.

import pg from 'pg'

const TWENTY_API_URL = process.env.TWENTY_API_URL || 'https://crm.ancsports.net'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY
const DB_HOST = process.env.DB_HOST || 'localhost'
const DB_PORT = parseInt(process.env.DB_PORT || '5432')
const DB_USER = process.env.DB_USER
const DB_PASS = process.env.DB_PASS
const DB_NAME = process.env.DB_NAME || 'anc_services'

if (!TWENTY_API_KEY) throw new Error('TWENTY_API_KEY required')
if (!DB_USER || !DB_PASS) throw new Error('DB_USER + DB_PASS required')

const client = new pg.Client({ host: DB_HOST, port: DB_PORT, user: DB_USER, password: DB_PASS, database: DB_NAME })
await client.connect()

const { rows } = await client.query(`
  SELECT id, ticket_number, contact_email, contact_name, title, description
  FROM tickets
  WHERE source = 'email'
    AND description LIKE 'Email received from %'
  ORDER BY created_at DESC
  LIMIT 50
`)

console.log(`Found ${rows.length} tickets with empty bodies to backfill.`)

let fixed = 0
let skipped = 0

for (const t of rows) {
  const subject = t.title || ''
  const sender = (t.contact_email || '').toLowerCase()
  if (!subject || !sender) { skipped++; continue }

  const normalizedSubject = subject.replace(/^(Re|Fwd|Fw)\s*:\s*/gi, '').trim()
  const res = await fetch(`${TWENTY_API_URL}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($subject: String!){
        messages(first: 10,
                 filter: { subject: { ilike: $subject }, direction: { eq: "INCOMING" } },
                 orderBy: { receivedAt: DescNullsLast }) {
          edges { node { text receivedAt messageParticipants { edges { node { role handle } } } } }
        }
      }`,
      variables: { subject: `%${normalizedSubject}%` },
    }),
  })
  if (!res.ok) { console.warn(`#${t.ticket_number}: Twenty ${res.status}`); skipped++; continue }
  const json = await res.json()
  const edges = json?.data?.messages?.edges || []

  let body = ''
  for (const { node } of edges) {
    const parts = node?.messageParticipants?.edges || []
    const from = parts.find(p => p?.node?.role === 'FROM')?.node?.handle?.toLowerCase() || ''
    if (from === sender && node?.text?.trim()) { body = node.text.trim(); break }
  }
  if (!body && edges[0]?.node?.text) body = String(edges[0].node.text).trim()

  if (!body) {
    console.log(`#${t.ticket_number} (${sender}): no Twenty match for "${normalizedSubject}"`)
    skipped++
    continue
  }

  const newDescription = `Email from ${t.contact_name || sender} (${sender}):\n\n${body.substring(0, 5000)}`

  await client.query(
    `UPDATE tickets SET description = $1, original_message = $2, updated_at = NOW() WHERE id = $3`,
    [newDescription, body, t.id]
  )

  console.log(`#${t.ticket_number}: backfilled (${body.length} chars)`)
  fixed++
}

console.log(`\nDone. Backfilled: ${fixed}, Skipped: ${skipped}`)
await client.end()
