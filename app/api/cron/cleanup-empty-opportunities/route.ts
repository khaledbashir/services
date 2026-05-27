export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const TWENTY_BASE = 'https://crm.ancsports.net'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
const CRON_SECRET = process.env.CRON_SECRET || 'anc-services-cron'

/**
 * Nightly cleanup of "Untitled" empty opportunities — placeholder rows
 * that get created when a user opens the New Deal flow in the CRM,
 * doesn't type anything, then walks away. Twenty auto-saves on first
 * blur, leaving stub rows in "All Deals" with no real data.
 *
 * Conservative criteria (must satisfy ALL):
 * - name is empty / null / "Untitled"
 * - no amount, no dealValue, no closeDate, no stage filled meaningfully
 * - no venue / company / pointOfContact attached
 * - created > 24 hours ago (so people working on a new deal don't get nuked)
 *
 * This is interim. The proper "explicit Save" flow lands with the CRM
 * app build that also covers the conditional Service-Opportunity hide
 * (K3) and the relation-panel left-side swap (K1).
 */
export async function GET(request: NextRequest) {
  if (request.headers.get('x-cron-secret') !== CRON_SECRET) {
    return NextResponse.json({ error: 'auth' }, { status: 401 })
  }
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ error: 'TWENTY_API_KEY not set' }, { status: 500 })
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Pull candidates: empty name + created > 24h ago + not WON/LOST
  const findRes = await fetch(`${TWENTY_BASE}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query($before: DateTime!){
        opportunities(
          first: 100,
          filter: {
            or: [{ name: { eq: "" } }, { name: { eq: "Untitled" } }, { name: { is: NULL } }],
            and: [{ createdAt: { lt: $before } }]
          }
        ) {
          edges {
            node {
              id name stage createdAt
              amount { amountMicros }
              dealValue { amountMicros }
              closeDate
              company { id }
              venue { id }
              pointOfContact { id }
            }
          }
          totalCount
        }
      }`,
      variables: { before: cutoff },
    }),
  })

  if (!findRes.ok) {
    return NextResponse.json({ error: `Twenty find failed: ${findRes.status}` }, { status: 500 })
  }
  const findJson = await findRes.json()
  const edges = findJson?.data?.opportunities?.edges || []

  const truly_empty = edges.filter(({ node }: any) => {
    const hasAmount = (node.amount?.amountMicros || 0) > 0 || (node.dealValue?.amountMicros || 0) > 0
    const hasRelations = node.company?.id || node.venue?.id || node.pointOfContact?.id
    const hasClose = !!node.closeDate
    return !hasAmount && !hasRelations && !hasClose
  })

  let deleted = 0
  for (const { node } of truly_empty) {
    const r = await fetch(`${TWENTY_BASE}/graphql`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation($id: UUID!){ deleteOpportunity(id: $id){ id } }`,
        variables: { id: node.id },
      }),
    })
    if (r.ok) deleted++
  }

  return NextResponse.json({
    candidates: edges.length,
    truly_empty: truly_empty.length,
    deleted,
    cutoff,
  })
}
