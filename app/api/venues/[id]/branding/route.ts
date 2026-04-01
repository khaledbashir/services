import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const formData = await request.formData()
    const type = formData.get('type') as string // 'logo' or 'cover'
    const file = formData.get('file') as File | null
    const autoDetect = formData.get('auto_detect') as string | null

    if (!type || !['logo', 'cover'].includes(type)) {
      return NextResponse.json({ error: 'type must be "logo" or "cover"' }, { status: 400 })
    }

    // Auto-detect logo from venue name
    if (autoDetect === 'true' && type === 'logo') {
      const venueRes = await query('SELECT name FROM venues WHERE id = $1', [params.id])
      if (venueRes.rows.length === 0) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
      }

      // Try to generate a logo URL from known sports venue domains
      const venueName = venueRes.rows[0].name.toLowerCase()
      // Use Google favicon as a universal fallback
      const searchName = encodeURIComponent(venueRes.rows[0].name)
      const logoUrl = `https://www.google.com/s2/favicons?domain=${searchName}.com&sz=128`

      await query('UPDATE venues SET logo_url = $1 WHERE id = $2', [logoUrl, params.id])
      return NextResponse.json({ url: logoUrl, type: 'logo' })
    }

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Use JPG, PNG, WebP, or SVG.' }, { status: 400 })
    }

    // Max 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = file.name.split('.').pop() || 'png'
    const filename = `${params.id}-${type}-${Date.now()}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'venues')

    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, filename), buffer)

    const url = `/uploads/venues/${filename}`
    const column = type === 'logo' ? 'logo_url' : 'cover_image_url'
    await query(`UPDATE venues SET ${column} = $1 WHERE id = $2`, [url, params.id])

    return NextResponse.json({ url, type })
  } catch (err) {
    console.error('Error uploading venue branding:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove logo or cover
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { type } = await request.json()
    if (!type || !['logo', 'cover'].includes(type)) {
      return NextResponse.json({ error: 'type must be "logo" or "cover"' }, { status: 400 })
    }

    const column = type === 'logo' ? 'logo_url' : 'cover_image_url'
    await query(`UPDATE venues SET ${column} = NULL WHERE id = $1`, [params.id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error removing venue branding:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
