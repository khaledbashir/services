export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { writeFile, mkdir, unlink } from 'fs/promises'
import path from 'path'

const VALID_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
  'application/octet-stream',
]

const FILE_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel',
  'application/vnd.ms-excel': 'Excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word',
  'application/msword': 'Word',
  'text/plain': 'Text',
  'text/csv': 'CSV',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
  'image/jpeg': 'Image',
  'image/png': 'Image',
  'image/webp': 'Image',
  'image/svg+xml': 'SVG',
}

function getFileCategory(mime: string): string {
  if (mime.startsWith('image/')) return 'image'
  if (mime.includes('pdf')) return 'pdf'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'spreadsheet'
  if (mime.includes('word') || mime.includes('document')) return 'document'
  if (mime.includes('zip')) return 'archive'
  return 'other'
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Two sources, one list: documents uploaded to this venue, plus manuals
    // and guides attached to equipment models installed here. The second kind
    // is Steve's "update the manual once" — it appears on every venue running
    // that gear without anyone re-uploading it, and is marked shared so nobody
    // deletes it from here thinking it is a local copy.
    const result = await query(
      `SELECT vd.*, s.full_name as uploaded_by_name,
              false AS is_shared, NULL::text AS shared_from
         FROM venue_documents vd
         LEFT JOIN staff s ON vd.uploaded_by = s.id
        WHERE vd.venue_id = $1 AND vd.is_archived = false
       UNION ALL
       SELECT DISTINCT vd.*, s.full_name as uploaded_by_name,
              true AS is_shared,
              (e.manufacturer || ' ' || e.model) AS shared_from
         FROM venue_documents vd
         JOIN equipment e ON e.id = vd.equipment_id
         JOIN venue_equipment ve ON ve.equipment_id = e.id AND ve.venue_id = $1
         LEFT JOIN staff s ON vd.uploaded_by = s.id
        WHERE vd.is_archived = false
          AND (vd.venue_id IS NULL OR vd.venue_id <> $1)
       ORDER BY file_type, created_at DESC`,
      [params.id]
    )
    return NextResponse.json({ documents: result.rows })
  } catch (err) {
    console.error('Error fetching venue documents:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fileType = (formData.get('file_type') as string) || 'document'
    const description = (formData.get('description') as string) || null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Max 50MB for documents
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 50MB.' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const ext = file.name.split('.').pop() || 'bin'
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${params.id}-doc-${Date.now()}-${safeName}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'venues', 'documents')

    await mkdir(uploadDir, { recursive: true })
    await writeFile(path.join(uploadDir, filename), buffer)

    const url = `/uploads/venues/documents/${filename}`
    const category = getFileCategory(file.type || '')

    // A document can be pinned to an equipment MODEL (the manual, shown at
    // every venue running it) or to one installed UNIT (that rack's as-built).
    // Both null is a plain venue document, exactly as before.
    const equipmentId = (formData.get('equipment_id') as string) || null
    const venueEquipmentId = (formData.get('venue_equipment_id') as string) || null

    const result = await query(
      `INSERT INTO venue_documents (venue_id, filename, original_name, file_type, file_size, description, uploaded_by, equipment_id, venue_equipment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [params.id, url, file.name, fileType || category, file.size, description, auth.userId,
       equipmentId || null, venueEquipmentId || null]
    )

    return NextResponse.json({ document: result.rows[0] })
  } catch (err) {
    console.error('Error uploading venue document:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { document_id } = await request.json()
    if (!document_id) {
      return NextResponse.json({ error: 'document_id required' }, { status: 400 })
    }

    // Get filename to delete from disk
    const doc = await query(`SELECT filename FROM venue_documents WHERE id = $1 AND venue_id = $2`, [document_id, params.id])
    if (doc.rows.length === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    const filePath = path.join(process.cwd(), 'public', doc.rows[0].filename)
    try { await unlink(filePath) } catch { /* file may not exist on disk */ }

    await query(`DELETE FROM venue_documents WHERE id = $1`, [document_id])

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting venue document:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
