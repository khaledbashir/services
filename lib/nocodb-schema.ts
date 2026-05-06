// Convert NocoDB table metadata + records into the shape <DataGrid> consumes.
// One source of truth for the generic /noco/[tableId] viewer so every base and
// every table renders without hand-authored pages.

import type { ColumnConfig, FieldType, SelectOption } from '@/components/data-grid'

// NocoDB UIDT → our FieldType. Anything not mapped falls back to 'text'.
const TYPE_MAP: Record<string, FieldType> = {
  SingleLineText: 'text',
  Email: 'text',
  URL: 'text',
  PhoneNumber: 'text',
  Barcode: 'text',
  QrCode: 'text',
  LongText: 'longText',
  RichText: 'longText',
  JSON: 'longText',
  Number: 'number',
  Decimal: 'number',
  Currency: 'number',
  Percent: 'number',
  Rating: 'number',
  Year: 'number',
  Duration: 'number',
  Date: 'date',
  DateTime: 'dateTime',
  CreatedTime: 'dateTime',
  LastModifiedTime: 'dateTime',
  Checkbox: 'checkbox',
  SingleSelect: 'singleSelect',
  MultiSelect: 'multiSelect',
  Attachment: 'attachment',
  Links: 'linkedRecord',
  LinkToAnotherRecord: 'linkedRecord',
  // Read-only computed fields — render same way as their result type.
  Lookup: 'lookup',
  Rollup: 'lookup',
  Formula: 'lookup',
  AutoNumber: 'lookup',
  ID: 'lookup',
  CreatedBy: 'lookup',
  LastModifiedBy: 'lookup',
}

// Hue rotation for select options without an explicit color. Keeps the grid
// visually varied even if the source schema didn't pick distinct colors.
const HUE_FALLBACK = ['sky', 'amber', 'emerald', 'violet', 'cyan', 'rose', 'teal', 'fuchsia', 'lime']

// NocoDB stores option color as `#RRGGBB`. Map the most common defaults to
// our Tailwind hue palette; everything else lands on a rotating fallback.
const HEX_TO_HUE: Record<string, string> = {
  '#cfdffe': 'sky', '#0a52ef': 'sky',
  '#ffe6b3': 'amber',
  '#c2f1c8': 'emerald',
  '#e0d4ff': 'violet',
  '#cbf3f0': 'cyan',
  '#ffd4d4': 'rose',
  '#cce8e6': 'teal',
  '#ffd6f5': 'fuchsia',
  '#dff2c4': 'lime',
}

function hueFor(hex: string | undefined, idx: number): string {
  if (!hex) return HUE_FALLBACK[idx % HUE_FALLBACK.length]
  const lower = hex.toLowerCase()
  return HEX_TO_HUE[lower] || HUE_FALLBACK[idx % HUE_FALLBACK.length]
}

// Skip these columns from the rendered grid — they're system-private or noisy.
const HIDDEN_COL_NAMES = new Set<string>([
  'CreatedAt',  // we surface as a column anyway, but Updated is more useful
  'CreatedBy',
  'LastModifiedBy',
  'nc_created_at',
  'nc_updated_at',
])

const HIDDEN_PREFIXES = ['_nc_'] // nocodb m2m bridge fields

export interface NocoColumn {
  id: string
  title: string
  uidt: string
  pv?: boolean // primary value
  rqd?: boolean
  ai?: boolean
  system?: boolean
  colOptions?: any
}

export interface NocoTableMeta {
  id: string
  title: string
  columns: NocoColumn[]
}

export function buildColumnConfig(meta: NocoTableMeta): ColumnConfig<any>[] {
  // Order: primary first, then visible non-system columns by source order.
  const cols = meta.columns.filter(c => {
    if (HIDDEN_COL_NAMES.has(c.title)) return false
    if (HIDDEN_PREFIXES.some(p => c.title.startsWith(p))) return false
    if (c.system) return false
    return true
  })

  cols.sort((a, b) => {
    if (a.pv && !b.pv) return -1
    if (!a.pv && b.pv) return 1
    return 0
  })

  return cols.map((c, idx) => {
    const fieldType = TYPE_MAP[c.uidt] || 'text'
    const editable = ['Lookup', 'Rollup', 'Formula', 'AutoNumber', 'ID', 'CreatedTime', 'LastModifiedTime', 'Links', 'LinkToAnotherRecord', 'Attachment', 'CreatedBy', 'LastModifiedBy'].indexOf(c.uidt) === -1
    const config: ColumnConfig<any> = {
      id: c.title,           // Use the human-readable title as the row key — reshape produces records keyed this way
      header: c.title,
      type: fieldType,
      width: defaultWidthFor(fieldType, c.title),
      primary: !!c.pv,
      editable,
    }
    if ((c.uidt === 'SingleSelect' || c.uidt === 'MultiSelect') && c.colOptions?.options) {
      config.options = c.colOptions.options.map((o: any, i: number): SelectOption => ({
        value: o.title,
        label: o.title,
        color: hueFor(o.color, i),
      }))
    }
    return config
  })
}

function defaultWidthFor(type: FieldType, title: string): number {
  if (type === 'longText') return 320
  if (type === 'attachment') return 130
  if (type === 'linkedRecord') return 200
  if (type === 'singleSelect') return 160
  if (type === 'date') return 130
  if (type === 'dateTime') return 160
  if (type === 'number') return 110
  if (type === 'checkbox') return 100
  // Heuristic: longer title → wider column.
  if (title.length > 22) return 240
  if (title.length > 14) return 200
  return 160
}

// Reshape a raw NocoDB record into a flat row that DataGrid renders. Linked
// records become a join-string of display labels; attachments become an array
// of {url, name, thumbnail, contentType}; multiselect arrays joined to text.
export function reshapeRecord(raw: Record<string, any>, columns: NocoColumn[]): Record<string, any> {
  const out: Record<string, any> = { id: String(raw.Id ?? raw.id ?? '') }
  for (const c of columns) {
    const v = raw[c.title]
    if (v == null) { out[c.title] = null; continue }
    if (c.uidt === 'Attachment' && Array.isArray(v)) {
      out[c.title] = v.map((a: any) => ({
        url: a.signedUrl || a.url || a.path,
        name: a.title || a.path,
        thumbnail: a.signedUrl || a.url || a.path,
        contentType: a.mimetype,
      }))
      continue
    }
    if ((c.uidt === 'Links' || c.uidt === 'LinkToAnotherRecord') && Array.isArray(v)) {
      // Render as an array of {id, label} — the LinkedRecordCell already
      // accepts this shape via the `linkedRecord` cell type.
      out[c.title] = v.map((link: any) => {
        // Linked records arrive with a few shapes depending on the field
        // type. Try common label keys, fall back to id.
        const label = link['Display Name'] || link['Venue Name'] || link['Name'] ||
                      link['Issue ID'] || link['Log ID'] || link['Device Name'] ||
                      link['Display Location'] || link['title'] || `#${link.Id}`
        return { id: String(link.Id), label: String(label) }
      })
      continue
    }
    if (c.uidt === 'MultiSelect') {
      // NocoDB returns multiselect as either an array of strings OR a
      // comma-joined string depending on field config. Normalize to an array
      // for the MultiSelectCell.
      out[c.title] = Array.isArray(v)
        ? v
        : (typeof v === 'string' ? v.split(',').map(s => s.trim()).filter(Boolean) : [])
      continue
    }
    if (c.uidt === 'Date' && typeof v === 'string') {
      out[c.title] = v.slice(0, 10)
      continue
    }
    out[c.title] = v
  }
  return out
}
