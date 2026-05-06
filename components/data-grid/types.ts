// DataGrid — schema-driven column config (Airtable-faithful field types).
// Every list page consumes this same engine; the difference between pages is
// the column config + the data fetcher. NocoDB-feel without NocoDB lock-in.

export type FieldType =
  | 'text'
  | 'longText'
  | 'number'
  | 'date'
  | 'dateTime'
  | 'checkbox'
  | 'singleSelect'
  | 'multiSelect'
  | 'attachment'
  | 'linkedRecord'
  | 'lookup' // read-only derived (rendered like the source field)

export interface SelectOption {
  value: string
  label: string
  color?: string // tailwind hue: 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'zinc' | 'cyan' | 'teal' | 'lime' | 'fuchsia'
}

export interface AttachmentValue {
  url: string
  name?: string
  thumbnail?: string
  contentType?: string
}

export interface LinkedRef {
  id: string
  label: string
  thumbnail?: string
  hue?: string
}

export interface ColumnConfig<TRow = any> {
  id: string                // field key in row object (e.g. 'venue_name')
  header: string            // visible label
  type: FieldType
  width?: number            // px; default 160
  minWidth?: number
  primary?: boolean         // frozen first column (Airtable's bold left col)
  editable?: boolean        // cell-level edit; default true except for lookup/computed
  options?: SelectOption[]  // single/multi select
  format?: (v: any, row: TRow) => any   // override raw value before render (e.g. derive)
  // For linkedRecord: how to fetch link options (search-as-you-type)
  resolveLink?: (q: string) => Promise<LinkedRef[]>
  // Coerce cell value for PATCH body. Default: { [id]: value }.
  toPatch?: (value: any) => Record<string, any>
}

export interface DataGridProps<TRow extends { id: string }> {
  columns: ColumnConfig<TRow>[]
  rows: TRow[]
  loading?: boolean
  // Update one cell. Should perform optimistic update + persist; throws on failure → grid rolls back.
  onUpdateCell?: (rowId: string, columnId: string, value: any, patch: Record<string, any>) => Promise<void>
  // Add empty row → return the created row (with id). Grid scrolls to + opens drawer.
  onAddRow?: () => Promise<TRow>
  // Open record in drawer (for full edit / linked records / attachments)
  onOpenRecord?: (row: TRow) => void
  // Custom title above grid; if omitted, no title bar
  title?: string
  // Empty-state copy
  emptyText?: string
}

// Tailwind-mapped pill colors for select options. Mirrors Airtable's option
// palette: light tinted bg, darker tinted text, subtle border.
export const PILL_COLORS: Record<string, string> = {
  rose:    'bg-rose-50 text-rose-700 border-rose-200',
  amber:   'bg-amber-50 text-amber-700 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sky:     'bg-sky-50 text-sky-700 border-sky-200',
  violet:  'bg-violet-50 text-violet-700 border-violet-200',
  cyan:    'bg-cyan-50 text-cyan-700 border-cyan-200',
  teal:    'bg-teal-50 text-teal-700 border-teal-200',
  lime:    'bg-lime-50 text-lime-700 border-lime-200',
  fuchsia: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  zinc:    'bg-zinc-100 text-zinc-700 border-zinc-200',
}

export function pillClass(hue?: string): string {
  return PILL_COLORS[hue || 'zinc'] || PILL_COLORS.zinc
}
