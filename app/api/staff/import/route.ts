import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { readFile } from 'fs/promises'

// Dynamic import for xlsx to support both Node.js and edge runtime
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

export async function POST(request: NextRequest) {
  try {
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

    const imported: any[] = []
    const skipped: any[] = []
    const errors: string[] = []

    // Hash for default password
    const defaultPasswordHash = await bcrypt.hash('changeme123', 10)

    for (let i = 0; i < data.length; i++) {
      const row = data[i] as Record<string, any>

      try {
        // Flexible column name matching
        const name =
          row['Name'] ||
          row['Full Name'] ||
          row['full_name'] ||
          row['FullName'] ||
          ''
        const email = row['Email'] || row['email'] || ''
        const phone = row['Phone'] || row['phone'] || row['PhoneNumber'] || ''
        const role = row['Role'] || row['role'] || 'technician'

        if (!name || !email) {
          skipped.push({ row: i + 2, reason: 'Missing name or email' })
          continue
        }

        // Check for duplicate email
        const checkResult = await query(
          'SELECT id FROM staff WHERE email = $1',
          [email]
        )

        if (checkResult.rows.length > 0) {
          skipped.push({ row: i + 2, email, reason: 'Duplicate email' })
          continue
        }

        // Insert new staff member
        const result = await query(
          `INSERT INTO staff (full_name, email, phone, role, password_hash, is_active)
           VALUES ($1, $2, $3, $4, $5, true)
           RETURNING id, full_name, email`,
          [name, email, phone, role, defaultPasswordHash]
        )

        imported.push(result.rows[0])
      } catch (err: any) {
        errors.push(`Row ${i + 2}: ${err.message}`)
      }
    }

    return NextResponse.json({
      imported: imported.length,
      skipped: skipped.length,
      errors: errors.length,
      details: {
        imported,
        skipped,
        errors,
      },
    })
  } catch (err: any) {
    console.error('Error importing staff:', err)
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}
