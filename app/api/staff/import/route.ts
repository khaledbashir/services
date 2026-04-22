import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import bcrypt from 'bcryptjs'

let xlsx: any

async function loadXlsx() {
  if (!xlsx) {
    try {
      xlsx = await import('xlsx')
    } catch (e) {
      console.error('xlsx not available')
    }
  }
  return xlsx
}

// POST with ?preview=true returns parsed rows without committing
// POST without preview commits the import
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const isPreview = request.nextUrl.searchParams.get('preview') === 'true'

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const xlsxModule = await loadXlsx()

    if (!xlsxModule) {
      return NextResponse.json({ error: 'xlsx library not available' }, { status: 500 })
    }

    const buffer = Buffer.from(bytes)
    const workbook = xlsxModule.read(buffer, { type: 'buffer' })
    const worksheet = workbook.Sheets[workbook.SheetNames[0]]
    const data = xlsxModule.utils.sheet_to_json(worksheet)

    // Load all venues for matching
    const venuesResult = await query('SELECT id, name FROM venues ORDER BY name')
    const venueMap = new Map<string, { id: string; name: string }>()
    for (const v of venuesResult.rows) {
      venueMap.set(v.name.toLowerCase().trim(), { id: v.id, name: v.name })
    }

    // Load existing staff by email
    const staffResult = await query('SELECT id, full_name, email FROM staff WHERE is_active = true')
    const staffByEmail = new Map<string, { id: string; full_name: string }>()
    for (const s of staffResult.rows) {
      if (s.email) staffByEmail.set(s.email.toLowerCase().trim(), { id: s.id, full_name: s.full_name })
    }

    const rows: Array<{
      row: number
      venue: string
      venue_id: string | null
      venue_matched: string | null
      name: string
      email: string
      phone: string
      role: string
      is_manager: boolean
      is_lead_rep: boolean
      status: 'new' | 'exists' | 'error'
      error?: string
    }> = []

    for (let i = 0; i < data.length; i++) {
      const raw = data[i] as Record<string, any>

      const venueName = (raw['Venue'] || raw['VENUE'] || raw['venue'] || '').toString().trim()
      const name = (raw['Name'] || raw['Full Name'] || raw['STAFF_NAME'] || raw['Staff Name'] || raw['full_name'] || raw['FullName'] || '').toString().trim()
      const email = (raw['Email'] || raw['email'] || raw['STAFF_EMAIL'] || raw['Staff Email'] || '').toString().trim().toLowerCase()
      const phone = (raw['Phone'] || raw['phone'] || raw['STAFF_PHONE'] || raw['Staff Phone'] || raw['PhoneNumber'] || '').toString().trim()
      const rawRole = (raw['Role'] || raw['role'] || raw['ROLE'] || 'technician').toString().trim().toLowerCase()

      // Detect manager/lead rep from role column or dedicated columns
      const managerCol = (raw['Manager'] || raw['MANAGER'] || raw['Venue Manager'] || '').toString().trim()
      const leadRepCol = (raw['Lead Field Rep'] || raw['LEAD_FIELD_REP'] || raw['Lead Rep'] || raw['Lead Field Representative'] || '').toString().trim()

      const isManager = rawRole === 'manager' || rawRole === 'venue manager' ||
        (managerCol && managerCol.toLowerCase() === name.toLowerCase()) ||
        (managerCol && managerCol.toLowerCase() === 'yes')
      const isLeadRep = rawRole === 'lead field rep' || rawRole === 'lead field representative' || rawRole === 'lead rep' ||
        (leadRepCol && leadRepCol.toLowerCase() === name.toLowerCase()) ||
        (leadRepCol && leadRepCol.toLowerCase() === 'yes')

      // Normalize role for DB
      let role = 'technician'
      if (rawRole === 'admin') role = 'admin'
      else if (rawRole === 'manager' || rawRole === 'venue manager' || isManager) role = 'manager'

      if (!name) {
        rows.push({ row: i + 2, venue: venueName, venue_id: null, venue_matched: null, name: '', email, phone, role, is_manager: isManager, is_lead_rep: isLeadRep, status: 'error', error: 'Missing name' })
        continue
      }

      // Match venue
      let venueId: string | null = null
      let venueMatched: string | null = null
      if (venueName) {
        const exact = venueMap.get(venueName.toLowerCase())
        if (exact) {
          venueId = exact.id
          venueMatched = exact.name
        } else {
          // Fuzzy match: check if venue name contains the input or vice versa
          for (const [key, val] of venueMap) {
            if (key.includes(venueName.toLowerCase()) || venueName.toLowerCase().includes(key)) {
              venueId = val.id
              venueMatched = val.name
              break
            }
          }
        }
      }

      const existing = email ? staffByEmail.get(email) : null

      if (!venueName) {
        rows.push({ row: i + 2, venue: '', venue_id: null, venue_matched: null, name, email, phone, role, is_manager: isManager, is_lead_rep: isLeadRep, status: existing ? 'exists' : 'new' })
      } else if (!venueId) {
        rows.push({ row: i + 2, venue: venueName, venue_id: null, venue_matched: null, name, email, phone, role, is_manager: isManager, is_lead_rep: isLeadRep, status: 'error', error: `Venue "${venueName}" not found` })
      } else {
        rows.push({ row: i + 2, venue: venueName, venue_id: venueId, venue_matched: venueMatched, name, email, phone, role, is_manager: isManager, is_lead_rep: isLeadRep, status: existing ? 'exists' : 'new' })
      }
    }

    // Preview mode — return parsed rows without committing
    if (isPreview) {
      return NextResponse.json({
        preview: true,
        rows,
        summary: {
          total: rows.length,
          new: rows.filter(r => r.status === 'new').length,
          existing: rows.filter(r => r.status === 'exists').length,
          errors: rows.filter(r => r.status === 'error').length,
        },
      })
    }

    // Commit mode — actually import
    // Joe's 2026-04-23 call: default to `anc123` so he can mass-upload and
    // tell everyone "use your email + anc123, change it after login."
    // Previously `changeme123` which nobody knew.
    const defaultPasswordHash = await bcrypt.hash('anc123', 10)
    const imported: any[] = []
    const updated: any[] = []
    const skipped: any[] = []
    const errors: string[] = []

    for (const row of rows) {
      if (row.status === 'error') {
        errors.push(`Row ${row.row}: ${row.error}`)
        continue
      }

      try {
        let staffId: string

        if (row.email && staffByEmail.has(row.email)) {
          // Existing staff — use their ID
          staffId = staffByEmail.get(row.email)!.id
          updated.push({ row: row.row, name: row.name, email: row.email })
        } else if (row.email) {
          // New staff — create
          const result = await query(
            `INSERT INTO staff (full_name, email, phone, role, password_hash, is_active)
             VALUES ($1, $2, $3, $4, $5, true)
             ON CONFLICT (email) DO UPDATE SET full_name = $1, phone = $3, role = $4
             RETURNING id`,
            [row.name, row.email, row.phone, row.role, defaultPasswordHash]
          )
          staffId = result.rows[0].id
          staffByEmail.set(row.email, { id: staffId, full_name: row.name })
          imported.push({ row: row.row, name: row.name, email: row.email })
        } else {
          // No email — create without email
          const result = await query(
            `INSERT INTO staff (full_name, phone, role, password_hash, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [row.name, row.phone, row.role, defaultPasswordHash]
          )
          staffId = result.rows[0].id
          imported.push({ row: row.row, name: row.name })
        }

        // Link to venue
        if (row.venue_id) {
          await query(
            `INSERT INTO staff_venues (staff_id, venue_id)
             VALUES ($1, $2)
             ON CONFLICT (staff_id, venue_id) DO NOTHING`,
            [staffId, row.venue_id]
          )

          // Set venue manager
          if (row.is_manager) {
            await query('UPDATE venues SET venue_manager_id = $1 WHERE id = $2', [staffId, row.venue_id])
          }

          // Set lead field rep
          if (row.is_lead_rep) {
            await query('UPDATE venues SET lead_field_rep_id = $1 WHERE id = $2', [staffId, row.venue_id])
          }
        }
      } catch (err: any) {
        errors.push(`Row ${row.row}: ${err.message}`)
      }
    }

    return NextResponse.json({
      imported: imported.length,
      updated: updated.length,
      skipped: skipped.length,
      errors: errors.length,
      details: { imported, updated, skipped, errors },
    })
  } catch (err: any) {
    console.error('Error importing staff:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
