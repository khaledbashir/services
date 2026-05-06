'use client'

// GalleryView — card grid layout. Each row renders as a card showing the
// primary field as title plus a few summary fields (and an attachment
// thumbnail if one exists). Click the card to open the record drawer.
//
// Pairs with <DataGrid>: when the active view's type === 'gallery',
// DataGrid swaps its grid body for this. View tabs and toolbar stay.

import type { ColumnConfig, AttachmentValue } from './types'
import { pillClass } from './types'

interface GalleryProps<TRow extends { id: string }> {
  rows: TRow[]
  columns: ColumnConfig<TRow>[]
  onOpenRecord?: (row: TRow) => void
}

export function GalleryView<TRow extends { id: string }>({
  rows, columns, onOpenRecord,
}: GalleryProps<TRow>) {
  const primary = columns.find(c => c.primary) || columns[0]
  const attachmentCol = columns.find(c => c.type === 'attachment')
  const statusCol = columns.find(c => c.type === 'singleSelect')
  // First 3 non-primary, non-attachment, non-status columns rendered as
  // small label/value pairs at the bottom of each card.
  const summaryCols = columns
    .filter(c => c.id !== primary.id && c.id !== attachmentCol?.id && c.id !== statusCol?.id)
    .slice(0, 3)

  if (rows.length === 0) {
    return <div className="px-5 py-16 text-center text-sm text-zinc-400">No records</div>
  }

  return (
    <div className="p-3 grid gap-3 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      {rows.map(row => {
        const r: any = row
        const title = r[primary.id] || r.id
        const attachments: AttachmentValue[] = Array.isArray(r[attachmentCol?.id || '']) ? r[attachmentCol!.id] : []
        const thumb = attachments[0]
        const status = statusCol ? r[statusCol.id] : null
        const statusOpt = statusCol?.options?.find(o => o.value === status)
        return (
          <button
            key={row.id}
            onClick={() => onOpenRecord?.(row)}
            className="group flex flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden hover:border-[#0A52EF]/40 hover:shadow-sm transition-all text-left"
          >
            <div className="aspect-[4/3] bg-zinc-50 border-b border-zinc-100 flex items-center justify-center overflow-hidden">
              {thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={thumb.thumbnail || thumb.url} alt={String(title)} className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform" />
              ) : (
                <span className="text-[10px] uppercase tracking-wider text-zinc-300">No image</span>
              )}
            </div>
            <div className="p-3 flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] font-medium text-zinc-900 truncate">{String(title)}</span>
                {statusOpt && (
                  <span className={`shrink-0 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${pillClass(statusOpt.color)}`}>
                    {statusOpt.label}
                  </span>
                )}
              </div>
              {summaryCols.length > 0 && (
                <dl className="space-y-0.5 text-[11px]">
                  {summaryCols.map(c => {
                    const raw = r[c.id]
                    if (raw == null || raw === '') return null
                    const display = c.type === 'date' && typeof raw === 'string'
                      ? new Date(raw + 'T00:00:00').toLocaleDateString()
                      : c.type === 'dateTime' && raw
                      ? new Date(raw).toLocaleDateString()
                      : String(raw)
                    return (
                      <div key={c.id} className="flex gap-1.5 items-baseline truncate">
                        <dt className="text-zinc-400 uppercase tracking-wider text-[9px] flex-shrink-0">{c.header}</dt>
                        <dd className="text-zinc-700 truncate">{display}</dd>
                      </div>
                    )
                  })}
                </dl>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
