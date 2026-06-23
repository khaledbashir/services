'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Field {
  id: number
  title: string
  type: string
  read_only?: boolean
  primary?: boolean
  options?: { choices?: Array<{ title: string; color?: string }> } | null
}

interface TableMeta {
  id: number
  title: string
  fields: Field[]
}

// Baserow returns rows flat when user_field_names=true: { id, order, "Name": ..., "Status": ... }
type Row = Record<string, any> & { id: number | string; order?: string }

const SYSTEM_FIELDS = new Set(['id', 'order'])
const READONLY_TYPES = new Set([
  'formula', 'lookup', 'link_row', 'count', 'rollup',
  'last_modified', 'last_modified_by', 'created_on', 'created_by',
  'autonumber',
])

function isEditable(field: Field): boolean {
  if (field.read_only) return false
  if (READONLY_TYPES.has(field.type)) return false
  return true
}

function inputTypeFor(field: Field): 'text' | 'number' | 'email' | 'tel' | 'url' | 'date' | 'datetime-local' | 'checkbox' | 'select' | 'multiselect' | 'textarea' {
  switch (field.type) {
    case 'number':
    case 'rating':
      return 'number'
    case 'email': return 'email'
    case 'phone_number': return 'tel'
    case 'url': return 'url'
    case 'date': return 'date'
    case 'datetime': return 'datetime-local'
    case 'boolean': return 'checkbox'
    case 'single_select': return 'select'
    case 'multiple_select': return 'multiselect'
    case 'long_text': return 'textarea'
    default: return 'text'
  }
}

export default function OperationsTablePage({ params }: { params: { base: string; table: string } }) {
  const [meta, setMeta] = useState<TableMeta | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Row | null>(null)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)

  const fetchAll = async () => {
    setError(null)
    try {
      const [metaRes, rowsRes] = await Promise.all([
        fetch(`/api/operations/${params.base}/${params.table}`),
        fetch(`/api/operations/${params.base}/${params.table}/rows?size=200`),
      ])
      if (!metaRes.ok) throw new Error((await metaRes.json()).error || 'Failed to load table')
      if (!rowsRes.ok) throw new Error((await rowsRes.json()).error || 'Failed to load rows')
      const m = await metaRes.json()
      const r = await rowsRes.json()
      setMeta(m.table)
      setRows(r.records || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.base, params.table])

  const editableFields = useMemo(
    () => (meta?.fields || []).filter(isEditable),
    [meta],
  )

  const visibleFields = useMemo(
    () => (meta?.fields || []),
    [meta],
  )

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter((row) =>
      Object.entries(row)
        .filter(([k]) => !SYSTEM_FIELDS.has(k))
        .some(([_, v]) => String(v ?? '').toLowerCase().includes(q)),
    )
  }, [rows, search])

  const startCreate = () => {
    setEditing(null)
    const init: Record<string, any> = {}
    editableFields.forEach((f) => {
      init[f.title] = f.type === 'boolean' ? false : f.type === 'multiple_select' ? [] : ''
    })
    setFormValues(init)
    setShowForm(true)
  }

  const startEdit = (row: Row) => {
    setEditing(row)
    setFormValues({ ...row })
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditing(null)
    setFormValues({})
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const cleaned: Record<string, any> = {}
      for (const f of editableFields) {
        const v = formValues[f.title]
        if (v === '' || v === undefined || v === null) continue
        if (f.type === 'number' || f.type === 'rating') {
          cleaned[f.title] = Number(v)
        } else if (f.type === 'boolean') {
          cleaned[f.title] = !!v
        } else if (f.type === 'multiple_select') {
          cleaned[f.title] = Array.isArray(v) ? v : [v]
        } else {
          cleaned[f.title] = v
        }
      }
      const url = editing
        ? `/api/operations/${params.base}/${params.table}/rows/${editing.id}`
        : `/api/operations/${params.base}/${params.table}/rows`
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: cleaned }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Save failed')
        return
      }
      await fetchAll()
      closeForm()
    } finally {
      setSubmitting(false)
    }
  }

  const deleteRow = async (row: Row) => {
    if (!confirm('Delete this row? This can\'t be undone.')) return
    const res = await fetch(`/api/operations/${params.base}/${params.table}/rows/${row.id}`, { method: 'DELETE' })
    if (res.ok) await fetchAll()
    else {
      const err = await res.json().catch(() => ({}))
      alert(err?.error || 'Delete failed (admin role required)')
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="space-y-2">
          <Link href="/operations" className="text-xs text-zinc-400 hover:text-zinc-700 inline-flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Operations Tables
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{meta?.title || 'Table'}</h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                {loading ? 'Loading…' : `${filteredRows.length} of ${rows.length} rows`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-9 w-56 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              />
              <button
                onClick={startCreate}
                disabled={loading || !meta}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New row
              </button>
            </div>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-6 text-sm text-amber-900">{error}</div>
        ) : loading || !meta ? (
          <Skeleton className="h-96 rounded-xl" />
        ) : (
          <div className="rounded-xl ring-1 ring-zinc-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 whitespace-nowrap">#</th>
                    {visibleFields.map((f) => (
                      <th key={f.id} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                        {f.title}
                        {f.primary && <span className="ml-1 text-[9px] text-amber-600">★</span>}
                      </th>
                    ))}
                    <th className="w-24 text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={String(row.id)} className="border-b border-zinc-100 hover:bg-zinc-50 last:border-0">
                      <td className="py-2.5 px-3 text-zinc-400 font-mono text-xs">{row.id}</td>
                      {visibleFields.map((f) => {
                        const v = row[f.title]
                        return (
                          <td key={f.id} className="py-2.5 px-3 text-zinc-700 whitespace-nowrap max-w-xs truncate" title={typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')}>
                            {renderCell(f, v)}
                          </td>
                        )
                      })}
                      <td className="py-2.5 px-3 text-right whitespace-nowrap">
                        <button onClick={() => startEdit(row)} className="text-xs text-[#0A52EF] hover:underline mr-3">Edit</button>
                        <button onClick={() => deleteRow(row)} className="text-xs text-zinc-400 hover:text-red-600">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={visibleFields.length + 2} className="text-center text-sm text-zinc-500 py-12">
                        {rows.length === 0 ? 'No rows yet — click "New row" to add one.' : 'No rows match the search.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && meta && (
        <div className="fixed inset-0 z-50 bg-zinc-900/30 backdrop-blur-sm flex items-start justify-center pt-20 px-4" onClick={closeForm}>
          <form
            onSubmit={submitForm}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-xl bg-white ring-1 ring-zinc-200 shadow-xl p-6 space-y-4 max-h-[80vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900">
                {editing ? `Edit row #${editing.id}` : `New row in ${meta.title}`}
              </h2>
              <button type="button" onClick={closeForm} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none">×</button>
            </div>

            <div className="space-y-3">
              {editableFields.map((f) => (
                <FieldInput
                  key={f.id}
                  field={f}
                  value={formValues[f.title]}
                  onChange={(v) => setFormValues((prev) => ({ ...prev, [f.title]: v }))}
                />
              ))}
              {editableFields.length === 0 && (
                <p className="text-sm text-zinc-500">No editable fields on this table.</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-60"
              >
                {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create row'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </DashboardLayout>
  )
}

function renderCell(field: Field, value: any): React.ReactNode {
  if (value == null || value === '') return <span className="text-zinc-300">—</span>
  if (field.type === 'boolean') return value ? '✓' : '—'
  if (field.type === 'date' || field.type === 'datetime') {
    try { return new Date(value).toLocaleDateString() } catch { return String(value) }
  }
  if (field.type === 'single_select' || field.type === 'multiple_select') {
    const arr = Array.isArray(value) ? value : [value]
    return (
      <span className="inline-flex flex-wrap gap-1">
        {arr.map((v, i) => {
          const label = typeof v === 'object' ? v.value : v
          const color = typeof v === 'object' ? v.color : undefined
          return (
            <span
              key={i}
              className="inline-flex text-[10.5px] font-medium px-1.5 py-0.5 rounded ring-1"
              style={{
                background: color ? `${color}20` : '#f4f4f5',
                color: color || '#3f3f46',
                borderColor: color ? `${color}40` : '#e4e4e7',
              }}
            >
              {String(label)}
            </span>
          )
        })}
      </span>
    )
  }
  if (field.type === 'link_row' && Array.isArray(value)) {
    return <span className="text-zinc-500 text-xs">{value.length} linked</span>
  }
  if (typeof value === 'object') return <code className="text-[11px] text-zinc-500">{JSON.stringify(value).slice(0, 60)}</code>
  return String(value)
}

function FieldInput({ field, value, onChange }: { field: Field; value: any; onChange: (v: any) => void }) {
  const baseClass = 'w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white'
  const inputType = inputTypeFor(field)

  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
        {field.title}
        <span className="ml-2 text-[10px] font-normal text-zinc-400 normal-case tracking-normal">{field.type}</span>
      </label>
      {inputType === 'textarea' ? (
        <textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          className={`${baseClass} resize-none`}
        />
      ) : inputType === 'checkbox' ? (
        <div>
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded"
          />
        </div>
      ) : inputType === 'select' ? (
        <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={baseClass}>
          <option value="">—</option>
          {(field.options?.choices || []).map((c) => (
            <option key={c.title} value={c.title}>{c.title}</option>
          ))}
        </select>
      ) : inputType === 'multiselect' ? (
        <select
          multiple
          value={Array.isArray(value) ? value.map((v) => typeof v === 'object' ? v.value : v) : []}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
          className={`${baseClass} min-h-[80px]`}
        >
          {(field.options?.choices || []).map((c) => (
            <option key={c.title} value={c.title}>{c.title}</option>
          ))}
        </select>
      ) : (
        <input
          type={inputType}
          value={value ?? ''}
          onChange={(e) => onChange(inputType === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
          className={baseClass}
        />
      )}
    </div>
  )
}
