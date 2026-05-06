'use client'

// Airtable-faithful cell renderers. Each cell handles its own edit affordance:
// - Text/Number: click → input; Enter saves, Esc cancels.
// - Select: click → menu of options as colored pills; pick saves.
// - Date: click → native date input.
// - Checkbox: click → toggles.
// - Attachment / LinkedRecord: read-only inline render in v1 (full edit lives in the drawer).
//
// All cells use the same compact 32px row height so the grid feels like a
// spreadsheet, not a card list.

import { useEffect, useRef, useState } from 'react'
import type { ColumnConfig, AttachmentValue, LinkedRef } from './types'
import { pillClass } from './types'

interface CellProps {
  col: ColumnConfig
  value: any
  row: any
  onSave: (value: any) => Promise<void>
}

const CELL_CLASS =
  'h-full w-full px-2 py-1 text-[13px] leading-tight text-zinc-800 outline-none ' +
  'focus:bg-white focus:ring-2 focus:ring-[#0A52EF]/40 focus:ring-inset bg-transparent'

function TextCell({ col, value, onSave }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value ?? '')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = async () => {
    setEditing(false)
    if ((draft || '') !== (value || '')) {
      try { await onSave(draft || null) } catch { setDraft(value ?? '') }
    }
  }
  const cancel = () => { setDraft(value ?? ''); setEditing(false) }

  if (!editing) {
    const empty = !value
    return (
      <div
        onDoubleClick={() => col.editable !== false && setEditing(true)}
        onKeyDown={e => { if (e.key === 'Enter') setEditing(true) }}
        tabIndex={0}
        className={CELL_CLASS + ' truncate cursor-text ' + (empty ? 'text-zinc-300' : '')}
        title={value ?? ''}
      >
        {value ?? ''}
      </div>
    )
  }

  if (col.type === 'longText') {
    return (
      <textarea
        ref={inputRef as any}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit() }
          if (e.key === 'Escape') cancel()
        }}
        className={CELL_CLASS + ' resize-none'}
        rows={2}
      />
    )
  }
  return (
    <input
      ref={inputRef as any}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') cancel()
      }}
      className={CELL_CLASS}
    />
  )
}

function NumberCell({ col, value, onSave }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value == null ? '' : String(value))
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = async () => {
    setEditing(false)
    const num = draft.trim() === '' ? null : Number(draft)
    if (Number.isNaN(num)) { setDraft(value == null ? '' : String(value)); return }
    if (num !== value) {
      try { await onSave(num) } catch { setDraft(value == null ? '' : String(value)) }
    }
  }
  const cancel = () => { setDraft(value == null ? '' : String(value)); setEditing(false) }

  if (!editing) {
    return (
      <div
        onDoubleClick={() => col.editable !== false && setEditing(true)}
        onKeyDown={e => { if (e.key === 'Enter') setEditing(true) }}
        tabIndex={0}
        className={CELL_CLASS + ' truncate cursor-text text-right tabular-nums'}
      >
        {value == null ? '' : value}
      </div>
    )
  }
  return (
    <input
      ref={inputRef}
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') cancel()
      }}
      className={CELL_CLASS + ' text-right tabular-nums'}
    />
  )
}

function SelectCell({ col, value, onSave }: CellProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const opt = col.options?.find(o => o.value === value)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const pick = async (v: string | null) => {
    setOpen(false)
    if (v === value) return
    try { await onSave(v) } catch {}
  }

  return (
    <div ref={wrapRef} className="relative h-full w-full flex items-center px-2">
      <button
        type="button"
        onClick={() => col.editable !== false && setOpen(o => !o)}
        className="text-left max-w-full truncate"
      >
        {opt ? (
          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${pillClass(opt.color)}`}>
            {opt.label}
          </span>
        ) : (
          <span className="text-zinc-300 text-[12.5px]">—</span>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto">
          {col.options?.map(o => (
            <button
              key={o.value}
              onClick={() => pick(o.value)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 flex items-center"
            >
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${pillClass(o.color)}`}>
                {o.label}
              </span>
            </button>
          ))}
          {value != null && (
            <button
              onClick={() => pick(null)}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 border-t border-zinc-100 mt-1"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function MultiSelectCell({ col, value, onSave }: CellProps) {
  // Multi-select: value is array of option values. Click → dropdown with
  // checkboxes; saves the new array on toggle.
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const selected: string[] = Array.isArray(value)
    ? value
    : (typeof value === 'string' && value ? value.split(',').map(s => s.trim()).filter(Boolean) : [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const toggle = async (v: string) => {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]
    try { await onSave(next) } catch {}
  }

  const pills = selected
    .map(s => col.options?.find(o => o.value === s) || ({ value: s, label: s, color: 'zinc' } as any))
  const visible = pills.slice(0, 3)
  const overflow = pills.length - visible.length

  return (
    <div ref={wrapRef} className="relative h-full w-full flex items-center px-1.5 gap-1 overflow-hidden">
      <button
        type="button"
        onClick={() => col.editable !== false && setOpen(o => !o)}
        className="flex items-center gap-1 max-w-full overflow-hidden"
      >
        {visible.length === 0 ? (
          <span className="text-zinc-300 text-[12.5px]">—</span>
        ) : visible.map(opt => (
          <span key={opt.value} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${pillClass(opt.color)}`}>
            {opt.label}
          </span>
        ))}
        {overflow > 0 && <span className="text-[10px] text-zinc-500 tabular-nums">+{overflow}</span>}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-zinc-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto">
          {col.options?.map(o => {
            const checked = selected.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                className="w-full text-left px-2 py-1.5 text-sm hover:bg-zinc-50 flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={checked}
                  className="h-3.5 w-3.5 rounded border-zinc-300 pointer-events-none"
                />
                <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${pillClass(o.color)}`}>
                  {o.label}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function DateCell({ col, value, onSave }: CellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(value ?? '')
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = async () => {
    setEditing(false)
    const next = draft || null
    if (next !== value) { try { await onSave(next) } catch { setDraft(value ?? '') } }
  }

  const display = value
    ? (col.type === 'dateTime' ? new Date(value).toLocaleString() : new Date(value + 'T00:00:00').toLocaleDateString())
    : ''

  if (!editing) {
    return (
      <div
        onDoubleClick={() => col.editable !== false && setEditing(true)}
        onKeyDown={e => { if (e.key === 'Enter') setEditing(true) }}
        tabIndex={0}
        className={CELL_CLASS + ' truncate cursor-text whitespace-nowrap'}
      >
        {display || <span className="text-zinc-300">—</span>}
      </div>
    )
  }
  return (
    <input
      ref={inputRef}
      type={col.type === 'dateTime' ? 'datetime-local' : 'date'}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') { e.preventDefault(); commit() }
        if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
      }}
      className={CELL_CLASS}
    />
  )
}

function CheckboxCell({ col, value, onSave }: CellProps) {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <input
        type="checkbox"
        checked={!!value}
        onChange={async e => { try { await onSave(e.target.checked) } catch {} }}
        disabled={col.editable === false}
        className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]/30"
      />
    </div>
  )
}

function AttachmentCell({ value }: CellProps) {
  const arr: AttachmentValue[] = Array.isArray(value) ? value : []
  if (!arr.length) return <div className={CELL_CLASS + ' text-zinc-300'}>—</div>
  return (
    <div className="h-full w-full px-1 flex items-center gap-1 overflow-hidden">
      {arr.slice(0, 4).map((a, i) => (
        <a
          key={i}
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="h-6 w-6 rounded border border-zinc-200 bg-zinc-50 overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[#0A52EF]/40"
          title={a.name}
        >
          {a.thumbnail || /image\//.test(a.contentType || '') || /\.(png|jpe?g|gif|webp)$/i.test(a.url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.thumbnail || a.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="block h-full w-full text-[8px] text-zinc-500 flex items-center justify-center font-mono">DOC</span>
          )}
        </a>
      ))}
      {arr.length > 4 && <span className="text-[10px] text-zinc-500">+{arr.length - 4}</span>}
    </div>
  )
}

function LinkedRecordCell({ col, value }: CellProps) {
  const arr: LinkedRef[] = Array.isArray(value) ? value : value ? [value] : []
  if (!arr.length) return <div className={CELL_CLASS + ' text-zinc-300'}>—</div>
  // When the column knows its target table, bubbles become anchors that
  // navigate to that table's grid. Stops the row-click from also opening
  // the host record's drawer.
  const renderBubble = (r: LinkedRef) => {
    const cls = `inline-flex items-center gap-1 max-w-[140px] truncate rounded-md border px-1.5 py-0.5 text-[11.5px] ${pillClass(r.hue)}`
    const inner = (
      <>
        {r.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.thumbnail} alt="" className="h-3.5 w-3.5 rounded object-cover flex-shrink-0" />
        )}
        <span className="truncate">{r.label}</span>
      </>
    )
    if (col.linkedTableId) {
      return (
        <a
          key={r.id}
          href={`/noco/${col.linkedTableId}?record=${encodeURIComponent(r.id)}`}
          onClick={e => e.stopPropagation()}
          className={cls + ' hover:ring-2 hover:ring-[#0A52EF]/40'}
          title={`Open ${r.label} in linked table`}
        >
          {inner}
        </a>
      )
    }
    return <span key={r.id} className={cls} title={r.label}>{inner}</span>
  }
  return (
    <div className="h-full w-full px-1.5 flex items-center gap-1 overflow-hidden">
      {arr.slice(0, 3).map(renderBubble)}
      {arr.length > 3 && <span className="text-[10px] text-zinc-500">+{arr.length - 3}</span>}
    </div>
  )
}

export function GridCell(props: CellProps) {
  switch (props.col.type) {
    case 'longText':
    case 'text':
      return <TextCell {...props} />
    case 'number':
      return <NumberCell {...props} />
    case 'singleSelect':
      return <SelectCell {...props} />
    case 'multiSelect':
      return <MultiSelectCell {...props} />
    case 'date':
    case 'dateTime':
      return <DateCell {...props} />
    case 'checkbox':
      return <CheckboxCell {...props} />
    case 'attachment':
      return <AttachmentCell {...props} />
    case 'linkedRecord':
      return <LinkedRecordCell {...props} />
    case 'lookup':
      // Render lookup as text (read-only). The format() in column config can
      // shape it.
      return <TextCell {...props} col={{ ...props.col, editable: false }} />
    default:
      return <TextCell {...props} />
  }
}
