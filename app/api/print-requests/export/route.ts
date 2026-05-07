export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { PrintRequests, TwentyPrintRequest } from '@/lib/twenty-ops'
import * as xlsx from 'xlsx'

function parseProofLinks(raw: any): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch (e) {}
  return [String(raw)]
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const searchParams = request.nextUrl.searchParams
  const format = searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv'
  const fromDate = searchParams.get('from')
  const toDate = searchParams.get('to')

  const filterParts: string[] = []
  if (fromDate) filterParts.push(`createdAt[gte]:"${fromDate}T00:00:00.000Z"`)
  if (toDate) filterParts.push(`createdAt[lte]:"${toDate}T23:59:59.999Z"`)
  const filterStr = filterParts.join(',')

  const items: TwentyPrintRequest[] = []
  let cursor: string | null | undefined = undefined

  try {
    do {
      const res = await PrintRequests.list({ 
        startingAfter: cursor || undefined, 
        limit: 100,
        filter: filterStr || undefined 
      })
      items.push(...res.items)
      if (res.hasNextPage && res.nextCursor) {
        cursor = res.nextCursor
      } else {
        cursor = undefined
      }
    } while (cursor)
  } catch (error) {
    console.error('Error fetching twenty print requests for export:', error)
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 })
  }

  const rows = items.map(req => {
    const proofs = parseProofLinks(req.proofLinks).join('; ')
    return {
      client: req.printClient?.name || '',
      'job title': req.name || '',
      'shipping address': req.shippingAddress || '',
      'ship date': req.shipDate ? new Date(req.shipDate).toISOString().slice(0, 10) : '',
      status: req.status || '',
      'invoice amount': req.invoiceAmount == null ? '' : String(req.invoiceAmount),
      'created at': req.createdAt ? new Date(req.createdAt).toISOString() : '',
      notes: req.britainNotes || '',
      'proof URLs': proofs
    }
  })

  // Basic CSV conversion
  const headers = ['client', 'job title', 'shipping address', 'ship date', 'status', 'invoice amount', 'created at', 'notes', 'proof URLs']
  
  const todayStr = new Date().toISOString().slice(0, 10)
  
  if (format === 'xlsx') {
    const worksheet = xlsx.utils.json_to_sheet(rows, { header: headers })
    const workbook = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Print Requests')
    
    // Using write for xlsx without fs is simple
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="print-requests-${todayStr}.xlsx"`
      }
    })
  } else {
    // CSV
    const escapeCsv = (str: any) => {
      const escaped = String(str).replace(/"/g, '""')
      return `"${escaped}"`
    }
    
    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => 
        headers.map(h => escapeCsv((row as any)[h])).join(',')
      )
    ].join('\n')
    
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="print-requests-${todayStr}.csv"`
      }
    })
  }
}
