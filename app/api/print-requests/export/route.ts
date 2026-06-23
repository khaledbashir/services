export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { PrintRequests, TwentyPrintRequest } from '@/lib/twenty-ops'
import * as xlsx from 'xlsx'

function moneyToNumber(value: any): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'object' && 'amountMicros' in value) {
    const micros = value.amountMicros
    if (micros === null || micros === undefined) return null
    const n = Number(micros)
    return Number.isFinite(n) ? n / 1_000_000 : null
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function emailToString(value: any): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  return value.primaryEmail || ''
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
    const raw = req as any
    return {
      status: raw.status || '',
      assignee: raw.printAssignee?.name || '',
      date: raw.dueDate ? new Date(raw.dueDate).toISOString().slice(0, 10) : '',
      author: raw.createdBy?.name || '',
      'submitted by': raw.submittedBy || '',
      email: emailToString(raw.requesterEmail),
      client: req.printClient?.name || '',
      HP: raw.homePlate ?? '',
      BL: raw.baselines ?? '',
      SHP: raw.smallHomePlate ?? '',
      'other qty': raw.otherQty ?? '',
      'job title': req.name || '',
      'shipping address': req.shippingAddress || '',
      'date shipped': req.shipDate ? new Date(req.shipDate).toISOString().slice(0, 10) : '',
      'arrival date': req.arrivalDate ? new Date(req.arrivalDate).toISOString().slice(0, 10) : '',
      'tracking #': raw.trackingNumber || '',
      'SF Number': raw.sfNumber || '',
      reprint: raw.reprint ? 'Yes' : 'No',
      'rush request': raw.rushRequest ? 'Yes' : 'No',
      'ANC Price': moneyToNumber(raw.ancPrice) ?? '',
      'Install Fee': moneyToNumber(raw.installFee) ?? '',
      'Rush Fee': moneyToNumber(raw.rushFee) ?? '',
      'Shipping Fee': moneyToNumber(raw.shippingFee) ?? '',
      'Britten Price': moneyToNumber(raw.brittenPrice) ?? '',
      'Britten Rush Fee': moneyToNumber(raw.brittenRushFee) ?? '',
      'Britten Shipping': moneyToNumber(raw.brittenShipping) ?? '',
      'Order Total': moneyToNumber(raw.invoiceAmount) ?? '',
      'invoice number': raw.invoiceNumber || '',
      'invoice date': raw.invoiceDate ? new Date(raw.invoiceDate).toISOString().slice(0, 10) : '',
      'bill to': raw.billTo || '',
      'billing notes': raw.billingNotes || '',
      'ANC Class': raw.ancClass || '',
      'created at': req.createdAt ? new Date(req.createdAt).toISOString() : '',
      notes: req.britainNotes || ''
    }
  })

  // Basic CSV conversion
  const headers = [
    'status', 'assignee', 'date', 'author', 'submitted by', 'email', 'client',
    'HP', 'BL', 'SHP', 'other qty', 'job title', 'shipping address', 'date shipped',
    'arrival date', 'tracking #', 'SF Number', 'reprint', 'rush request',
    'ANC Price', 'Install Fee', 'Rush Fee', 'Shipping Fee', 'Britten Price',
    'Britten Rush Fee', 'Britten Shipping', 'Order Total', 'invoice number',
    'invoice date', 'bill to', 'billing notes', 'ANC Class', 'created at', 'notes',
  ]
  
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
