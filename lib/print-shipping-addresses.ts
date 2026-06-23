import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'

const WORKBOOK_NAME = 'Print Shipping Addresses.xlsx'

export interface PrintShippingAddress {
  client: string
  address: string
}

let cache: { mtimeMs: number; addresses: PrintShippingAddress[] } | null = null

export function normalizePrintClientName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function getPrintShippingAddresses(): PrintShippingAddress[] {
  const filePath = path.join(process.cwd(), WORKBOOK_NAME)
  if (!fs.existsSync(filePath)) return []

  const stat = fs.statSync(filePath)
  if (cache && cache.mtimeMs === stat.mtimeMs) return cache.addresses

  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const addresses = rows
    .map((row) => ({
      client: String(row.Client || row.client || '').trim(),
      address: String(row.Address || row.address || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((row) => row.client && row.address)
    .sort((a, b) => a.client.localeCompare(b.client))

  cache = { mtimeMs: stat.mtimeMs, addresses }
  return addresses
}

export function findPrintShippingAddress(clientName: string | null | undefined) {
  const needle = normalizePrintClientName(clientName)
  if (!needle) return null

  const addresses = getPrintShippingAddresses()
  const exact = addresses.find((row) => normalizePrintClientName(row.client) === needle)
  if (exact) return exact

  return addresses.find((row) => {
    const candidate = normalizePrintClientName(row.client)
    return candidate.includes(needle) || needle.includes(candidate)
  }) || null
}
