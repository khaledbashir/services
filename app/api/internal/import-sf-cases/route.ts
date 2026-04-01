import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'anc-internal-2026'
const CLAW_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

const STATUS_MAP: Record<string, string> = {
  'New': 'new', 'On Hold': 'on_hold', 'In Progress': 'in_progress',
  'in_progress': 'in_progress', 'Escalated': 'escalated',
  'Closed': 'closed', 'Merged': 'closed', 'Done': 'closed',
}

const ORIGIN_MAP: Record<string, string> = {
  'Email': 'email', 'Web': 'web', 'Phone': 'phone',
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('x-api-key') || ''
    if (authHeader !== INTERNAL_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { cases } = await request.json()
    if (!Array.isArray(cases)) {
      return NextResponse.json({ error: 'cases array required' }, { status: 400 })
    }

    // Load venue mapping
    const venuesRes = await query('SELECT id, name FROM venues')
    const venueMap = new Map<string, string>()
    for (const v of venuesRes.rows) {
      venueMap.set(v.name.toLowerCase().trim(), v.id)
    }

    // Load staff mapping
    const staffRes = await query('SELECT id, full_name FROM staff WHERE is_active = true')
    const staffMap = new Map<string, string>()
    for (const s of staffRes.rows) {
      staffMap.set(s.full_name.toLowerCase().trim(), s.id)
    }

    function matchVenue(accountName: string | null): string | null {
      if (!accountName) return null
      const lower = accountName.toLowerCase().trim()
      if (venueMap.has(lower)) return venueMap.get(lower)!
      for (const [vname, vid] of venueMap) {
        if (vname.includes(lower) || lower.includes(vname)) return vid
      }
      const words = new Set(lower.split(/\s+/))
      for (const [vname, vid] of venueMap) {
        const vwords = new Set(vname.split(/\s+/))
        let overlap = 0
        for (const w of words) { if (vwords.has(w)) overlap++ }
        if (overlap >= 2) return vid
      }
      return null
    }

    function matchStaff(ownerName: string | null): string {
      if (!ownerName) return CLAW_ID
      const lower = ownerName.toLowerCase().trim()
      if (staffMap.has(lower)) return staffMap.get(lower)!
      for (const [sname, sid] of staffMap) {
        if (sname.includes(lower) || lower.includes(sname)) return sid
      }
      return CLAW_ID
    }

    let imported = 0, skipped = 0, noVenue = 0, errors = 0, venuesCreated = 0

    for (const c of cases) {
      try {
        const caseNumber = c.CaseNumber
        const subject = c.Subject || `Case ${caseNumber}`
        const description = c.Description || ''
        const status = STATUS_MAP[c.Status] || 'new'
        let priority = (c.Priority || 'Medium').toLowerCase()
        if (!['low', 'medium', 'high', 'critical'].includes(priority)) priority = 'medium'
        const origin = ORIGIN_MAP[c.Origin] || 'web'
        const account = c.Account || {}
        const contact = c.Contact || {}
        const owner = c.Owner || {}

        let venueId = matchVenue(account.Name)
        if (!venueId && account.Name) {
          // Auto-create venue
          const nameLower = account.Name.toLowerCase()
          let vtype = 'sports'
          if (/university|college|school|academy|prep/i.test(nameLower)) vtype = 'facility'
          else if (/media|outdoor|transit|station|airport|metro|mta|led|display|sign/i.test(nameLower)) vtype = 'ooh'

          // Check if already exists first
          const existing = await query('SELECT id FROM venues WHERE LOWER(name) = LOWER($1)', [account.Name])
          if (existing.rows.length > 0) {
            venueId = existing.rows[0].id
            venueMap.set(account.Name.toLowerCase().trim(), venueId as string)
          } else {
            const newVenue = await query(
              `INSERT INTO venues (name, venue_type, requires_assignment, portal_token)
               VALUES ($1, $2, false, encode(gen_random_bytes(16), 'hex'))
               RETURNING id`,
              [account.Name, vtype]
            )
            venueId = newVenue.rows[0].id
            venueMap.set(account.Name.toLowerCase().trim(), venueId as string)
            venuesCreated++
          }
        }
        if (!venueId) { noVenue++; skipped++; continue }

        const assignedTo = matchStaff(owner.Name)

        // Duplicate check
        const dup = await query('SELECT id FROM tickets WHERE sf_case_number = $1', [caseNumber])
        if (dup.rows.length > 0) { skipped++; continue }

        await query(
          `INSERT INTO tickets (venue_id, created_by, assigned_to, title, description, priority, status, category, source, ticket_type, contact_name, contact_email, contact_phone, sf_case_number, created_at, updated_at, resolved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'general', $8, 'support', $9, $10, $11, $12, $13, $14, $15)`,
          [venueId, CLAW_ID, assignedTo, subject, description, priority, status, origin,
           contact.Name || null, contact.Email || null, contact.Phone || null,
           caseNumber, c.CreatedDate, c.LastModifiedDate, c.ClosedDate || null]
        )
        imported++
      } catch (err: any) {
        errors++
      }
    }

    return NextResponse.json({ imported, skipped, noVenue, errors, venuesCreated, total: cases.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
