import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, description FROM service_types ORDER BY name`
    )
    return NextResponse.json({ serviceTypes: result.rows })
  } catch (err) {
    console.error('Error fetching service types:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, description } = await request.json()

    await query(
      `INSERT INTO service_types (name, description) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
      [name, description || null]
    )

    const result = await query(
      `SELECT id, name, description FROM service_types ORDER BY name`
    )
    return NextResponse.json({ serviceTypes: result.rows })
  } catch (err) {
    console.error('Error creating service type:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id } = await request.json()
    await query(`DELETE FROM service_types WHERE id = $1`, [id])

    const result = await query(
      `SELECT id, name, description FROM service_types ORDER BY name`
    )
    return NextResponse.json({ serviceTypes: result.rows })
  } catch (err) {
    console.error('Error deleting service type:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
