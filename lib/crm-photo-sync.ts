// Routes swept technician photos onto CRM account records (Jireh 2026-07-17:
// "have photos assigned to each account on our CRM"). For every venue with
// newly filed photos, one note per week lands on the venue's CRM record —
// targeted at the venue's company when one is linked, and at the CRM venue
// record itself either way. Photos embed via public share-token thumbnails.
//
// Join: services venues.id → CRM venue.servicesId (fallback: exact name).
// Fail-soft at the sweep level — a CRM outage must never fail the photo sweep —
// but never silent: a group whose note or targeting fails records the error and
// stays unstamped so the next run retries it. Note creation is idempotent by
// title, so a retry re-targets the existing note instead of duplicating it.

import { randomBytes } from 'crypto'
import { query } from '@/lib/db'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'

type SyncReport = { notes: number; photos: number; errors: string[] }

async function twentyRest(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${TWENTY_BASE}/rest/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`Twenty ${res.status} ${path}: ${JSON.stringify(json).slice(0, 200)}`)
  }
  return json
}

async function resolveCrmVenue(
  servicesVenueId: string,
  venueName: string,
): Promise<{ crmVenueId: string; companyId: string | null } | null> {
  try {
    const byServiceId = await twentyRest(
      `venues?filter=servicesId[eq]:${encodeURIComponent(servicesVenueId)}&limit=1`
    )
    const hit = byServiceId?.data?.venues?.[0]
    if (hit) return { crmVenueId: hit.id, companyId: hit.companyId || null }
  } catch {
    /* fall through to name match */
  }
  try {
    const byName = await twentyRest(
      `venues?filter=name[ilike]:${encodeURIComponent(venueName)}&limit=1`
    )
    const hit = byName?.data?.venues?.[0]
    if (hit) return { crmVenueId: hit.id, companyId: hit.companyId || null }
  } catch {
    /* unresolved */
  }
  return null
}

// The sweep may retry a group whose note landed but whose targeting failed, so
// look for the week's note before creating a second one.
async function findNoteByTitle(title: string): Promise<string | null> {
  const filter = encodeURIComponent(`title[eq]:${title}`)
  const res = await twentyRest(`notes?filter=${filter}&limit=1`)
  return res?.data?.notes?.[0]?.id || null
}

async function existingTargets(noteId: string): Promise<any[]> {
  const filter = encodeURIComponent(`noteId[eq]:${noteId}`)
  const res = await twentyRest(`noteTargets?filter=${filter}&limit=30`)
  return res?.data?.noteTargets || []
}

function weekLabel(postedAt: Date): string {
  const d = new Date(postedAt)
  const day = d.getUTCDay()
  d.setUTCDate(d.getUTCDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

export async function syncPhotosToCrm(): Promise<SyncReport> {
  const report: SyncReport = { notes: 0, photos: 0, errors: [] }
  if (!TWENTY_API_KEY) {
    report.errors.push('TWENTY_API_KEY not configured')
    return report
  }

  // Ensure every synced photo has a share token before it lands in a note.
  await query(
    `UPDATE slack_photo_files SET share_token = encode(gen_random_bytes(24), 'hex')
     WHERE share_token IS NULL AND thumb IS NOT NULL`
  )

  const pending = await query(
    `SELECT id, slack_file_id, venue_id, venue_name, poster, posted_at,
            ai_title, ai_category, share_token, web_url, slack_permalink
     FROM slack_photo_files
     WHERE crm_synced_at IS NULL AND thumb IS NOT NULL AND venue_id IS NOT NULL
     ORDER BY venue_name, posted_at
     LIMIT 200`
  )
  if (pending.rows.length === 0) return report

  // Group venue+week → one note per group
  const groups = new Map<string, any[]>()
  for (const row of pending.rows) {
    const key = `${row.venue_id}|${weekLabel(row.posted_at)}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(row)
  }

  for (const [key, photos] of groups) {
    const [venueId, week] = key.split('|')
    const venueName = photos[0].venue_name
    try {
      const crm = await resolveCrmVenue(venueId, venueName)
      if (!crm) {
        report.errors.push(`${venueName}: no CRM venue match`)
        continue
      }

      const lines: string[] = [
        `Field photos captured by the on-site team during the week of ${week}. Auto-filed from the venue channel and organized by the platform.`,
        '',
      ]
      for (const p of photos) {
        const caption = [p.ai_title || p.slack_file_id, p.ai_category].filter(Boolean).join(' — ')
        // Raw Slack IDs (bot posters / unresolved users) read as noise — drop them.
        const poster = p.poster && !/^U[A-Z0-9]{8,}$/.test(p.poster) ? p.poster : ''
        lines.push(`- [${caption}](${PUBLIC_BASE}/api/photos/shared/${p.share_token})${poster ? ` · ${poster}` : ''}`)
      }
      lines.push('')
      lines.push(`[Open this account's visual story](${PUBLIC_BASE}/photo-story/${venueId}) · [Browse the full photo gallery](${PUBLIC_BASE}/gallery)`)

      const title = `Field Photos — ${venueName} — Week of ${week}`
      let noteId = await findNoteByTitle(title)
      if (!noteId) {
        const note = await twentyRest('notes', {
          method: 'POST',
          body: JSON.stringify({
            title,
            bodyV2: { markdown: lines.join('\n') },
          }),
        })
        noteId = note?.data?.createNote?.id
        if (!noteId) throw new Error('note create returned no id')
      }

      // Target the company when linked; always target the CRM venue record.
      // noteTargets keys are target*Id — a plain companyId/venueId is accepted
      // by the request and bound to nothing, which orphaned every note until
      // 2026-07-17. Errors here must surface: a note attached to no record is
      // invisible on the account, so the group stays unstamped and retries.
      const targets = await existingTargets(noteId)
      if (crm.companyId && !targets.some(t => t.targetCompanyId === crm.companyId)) {
        await twentyRest('noteTargets', {
          method: 'POST',
          body: JSON.stringify({ noteId, targetCompanyId: crm.companyId }),
        })
      }
      if (!targets.some(t => t.targetVenueId === crm.crmVenueId)) {
        await twentyRest('noteTargets', {
          method: 'POST',
          body: JSON.stringify({ noteId, targetVenueId: crm.crmVenueId }),
        })
      }

      await query(
        `UPDATE slack_photo_files SET crm_synced_at = NOW() WHERE id = ANY($1::int[])`,
        [photos.map(p => p.id)]
      )
      report.notes += 1
      report.photos += photos.length
    } catch (error) {
      report.errors.push(
        `${venueName}/${week}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return report
}
