import { NextResponse } from 'next/server'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

// Scheduler: every 15 min.
//
// Eliminates Alexis's #1 manual-entry complaint: having to open a content-
// schedule record and type the date every time status changes.
//
// Rules:
//   status = STATUS_SCHEDULED       and startDate NULL  → set startDate = today
//   status = STATUS_CONTENT_LIVE    and startDate NULL  → set startDate = today
//   status = STATUS_CONFIRMED       and endDate   NULL  → set endDate   = today
//   status = STATUS_DONE            and endDate   NULL  → set endDate   = today
//   status = STATUS_VERIFIED_REMOVAL and endDate  NULL  → set endDate   = today
//
// We only set a date when it's empty — never overwrite a human-set value.

const LAUNCH_STATUSES = new Set(['STATUS_SCHEDULED', 'STATUS_CONTENT_LIVE', 'STATUS_LIVE'])
const END_STATUSES = new Set(['STATUS_CONFIRMED', 'STATUS_DONE', 'STATUS_VERIFIED_REMOVAL'])

export async function GET() {
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ ok: false, error: 'TWENTY_API_KEY missing' }, { status: 500 })
  }
  const today = new Date().toISOString().slice(0, 10)
  const updates: Array<{ id: string; patch: Record<string, string> }> = []
  let scanned = 0

  try {
    // Pull recent records — those whose dates likely need backfilling. 500 is
    // enough given we run every 15 min and most records churn through states
    // within days.
    let cursor: string | null = null
    for (let page = 0; page < 10; page++) {
      const url: string =
        `${TWENTY_BASE}/rest/contentSchedules?limit=60&order_by=updatedAt[DescNullsLast]` +
        (cursor ? `&starting_after=${encodeURIComponent(cursor)}` : '')
      const res: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
      })
      if (!res.ok) break
      const json: any = await res.json()
      const batch: any[] = json?.data?.contentSchedules || []
      scanned += batch.length

      for (const rec of batch) {
        const patch: Record<string, string> = {}
        if (LAUNCH_STATUSES.has(rec.status) && !rec.startDate) {
          patch.startDate = today
        }
        if (END_STATUSES.has(rec.status) && !rec.endDate) {
          patch.endDate = today
        }
        if (Object.keys(patch).length > 0) {
          updates.push({ id: rec.id, patch })
        }
      }

      cursor = json?.pageInfo?.endCursor || null
      if (!json?.pageInfo?.hasNextPage || !cursor) break
    }

    // Apply the updates sequentially to stay polite to the API
    let applied = 0
    for (const u of updates) {
      try {
        const r = await fetch(`${TWENTY_BASE}/rest/contentSchedules/${u.id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${TWENTY_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(u.patch),
        })
        if (r.ok) applied++
      } catch {
        // skip individual failures
      }
    }

    return NextResponse.json({
      ok: true,
      scanned,
      candidates: updates.length,
      applied,
      today,
    })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'err' },
      { status: 500 }
    )
  }
}
