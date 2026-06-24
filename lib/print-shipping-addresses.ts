import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { normalizeVenueTriCode, resolveVenueIdFromTriCode } from '@/lib/venue-tricodes'
import { query } from '@/lib/db'

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

// ── Tri-code → shipping address ───────────────────────────────────────────────
// Alexis 2026-06-24: address auto-populate should key off the tri-code, not just
// the typed client name. The xlsx only has client→address, so the chain is
// tri-code → venue → client name → fuzzy address match. A small explicit
// override map handles the dual-venue Red Sox case (Fenway vs Spring Training),
// where one client maps to two distinct addresses by tri-code.
//
// NOTE: the override tri-code strings below are best-guess and MUST be confirmed
// with Alexis (Open Question Q2). They are matched after normalization, so case
// and separators don't matter.
const TRICODE_CLIENT_OVERRIDES: Record<string, string> = {
  // Boston Red Sox — Fenway Park (regular season ship-to)
  BOS: 'Boston Red Sox',
  RS: 'Boston Red Sox',
  FEN: 'Boston Red Sox',
  // Boston Red Sox — JetBlue Park / Spring Training ship-to
  BST: 'Boston Red Sox Spring Training',
  JBP: 'Boston Red Sox Spring Training',
  SPT: 'Boston Red Sox Spring Training',
}

function overrideClientForTriCode(tricode: string | null | undefined): string | null {
  const normalized = normalizeVenueTriCode(tricode)
  if (!normalized) return null
  return TRICODE_CLIENT_OVERRIDES[normalized] || null
}

async function clientNameFromVenueTriCode(tricode: string | null | undefined): Promise<string | null> {
  const venueId = await resolveVenueIdFromTriCode(tricode)
  if (!venueId) return null
  try {
    const res = await query('SELECT name FROM venues WHERE id = $1 LIMIT 1', [venueId])
    return res.rows[0]?.name || null
  } catch {
    return null
  }
}

// Resolve a shipping address by tri-code. Order:
//   1. explicit override map (dual-venue clients)
//   2. tri-code → venue name → fuzzy address match
export async function findAddressByTriCode(
  tricode: string | null | undefined,
): Promise<PrintShippingAddress | null> {
  const override = overrideClientForTriCode(tricode)
  if (override) {
    const hit = findPrintShippingAddress(override)
    if (hit) return hit
  }

  const venueClientName = await clientNameFromVenueTriCode(tricode)
  if (venueClientName) {
    const hit = findPrintShippingAddress(venueClientName)
    if (hit) return hit
  }

  return null
}
