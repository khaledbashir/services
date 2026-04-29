'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Field {
  id: string
  title: string
  type: string
  options?: { choices?: Array<{ title: string; color?: string }> } | null
}

interface TableMeta {
  id: string
  title: string
  fields: Field[]
}

interface NocoRecord {
  id: string | number
  fields: Record<string, any>
}

const SYSTEM_FIELDS = new Set(['Id', 'CreatedAt', 'UpdatedAt', 'CreatedBy', 'UpdatedBy', 'nc_created_at', 'nc_updated_at'])
const READONLY_TYPES = new Set(['Formula', 'LinkToAnotherRecord', 'Lookup', 'Rollup', 'Links', 'CreatedTime', 'LastModifiedTime', 'CreatedBy', 'LastModifiedBy', 'AutoNumber', 'Barcode', 'QrCode'])

function isEditable(field: Field): boolean {
  if (SYSTEM_FIELDS.has(field.title)) return false
  if (READONLY_TYPES.has(field.type)) return false
  return true
}

function inputTypeFor(field: Field): 'text' | 'number' | 'email' | 'tel' | 'url' | 'date' | 'datetime-local' | 'checkbox' | 'select' | 'textarea' {
  switch (field.type) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
    case 'Rating':
    case 'Duration':
      return 'number'
    case 'Email': return 'email'
    case 'PhoneNumber': return 'tel'
    case 'URL': return 'url'
    case 'Date': return 'date'
    case 'DateTime': return 'datetime-local'
    case 'Checkbox': return 'checkbox'
    case 'SingleSelect': return 'select'
    case 'LongText': return 'textarea'
    default: return 'text'
  }
}

export default function OperationsTablePage({ params }: { params: { base: string; table: string } }) {
  const [meta, setMeta] = useState<TableMeta | null>(null)
  const [rows, setRows] = useState<NocoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<NocoRecord | null>(null)
  const [formValues, setFormValues] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)

  const fetchAll = async () => {
    setError(null)
    try {
      const [metaRes, rowsRes] = await Promise.all([
        fetch(`/api/operations/${params.base}/${params.table}`),
        fetch(`/api/operations/${params.base}/${params.table}/rows?pageSize=100`),
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
    () => (meta?.fields || []).filter((f) => !SYSTEM_FIELDS.has(f.title) || f.title === 'Id'),
    [meta],
  )

  const filteredRows = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter((row) => {
      const fields = row.fields || row
      return Object.values(fields).some((v) =>
        String(v ?? '').toLowerCase().includes(q),
      )
    })
  }, [rows, search])

  const startCreate = () => {
    setEditing(null)
    const init: Record<string, any> = {}
    editableFields.forEach((f) => { init[f.title] = f.type === 'Checkbox' ? false : '' })
    setFormValues(init)
    setShowForm(true)
  }

  const startEdit = (row: NocoRecord) => {
    const fields = row.fields || row
    setEditing(row)
    setFormValues({ ...fields })
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
        if (v === '' || v === undefined) continue
        if (f.type === 'Number' || f.type === 'Decimal' || f.type === 'Currency' || f.type === 'Percent' || f.type === 'Rating') {
          cleaned[f.title] = Number(v)
        } else if (f.type === 'Checkbox') {
          cleaned[f.title] = !!v
        } else {
          cleaned[f.title] = v
        }
      }
      const url = editing
        ? `/api/operations/${params.base}/${params.table}/rows/${(editing.fields as any)?.Id || (editing as any).Id || editing.id}`
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

  const deleteRow = async (row: NocoRecord) => {
    const id = (row.fields as any)?.Id || (row as any).Id || row.id
    if (!confirm('Delete this row? This can\'t be undone.')) return
    const res = await fetch(`/api/operations/${params.base}/${params.table}/rows/${id}`, { method: 'DELETE' })
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
                    {visibleFields.map((f) => (
                      <th key={f.id} className="text-left py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">
                        {f.title}
                      </th>
                    ))}
                    <th className="w-24 text-right py-2.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => {
                    const fields = (row.fields || row) as Record<string, any>
                    const id = fields.Id || (row as any).Id || row.id
                    return (
                      <tr key={String(id)} className="border-b border-zinc-100 hover:bg-zinc-50 last:border-0">
                        {visibleFields.map((f) => {
                          const v = fields[f.title]
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
                    )
                  })}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={visibleFields.length + 1} className="text-center text-sm text-zinc-500 py-12">
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
                {editing ? `Edit row` : `New row in ${meta.title}`}
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
  if (field.type === 'Checkbox') return value ? '✓' : '—'
  if (field.type === 'Date' || field.type === 'DateTime') {
    try { return new Date(value).toLocaleDateString() } catch { return String(value) }
  }
  if (field.type === 'SingleSelect' || field.type === 'MultiSelect') {
    const options = field.options?.choices || []
    const arr = Array.isArray(value) ? value : [value]
    return (
      <span className="inline-flex flex-wrap gap-1">
        {arr.map((v, i) => {
          const choice = options.find((c) => c.title === v)
          return (
            <span
              key={i}
              className="inline-flex text-[10.5px] font-medium px-1.5 py-0.5 rounded ring-1"
              style={{
                background: choice?.color ? `${choice.color}20` : '#f4f4f5',
                color: choice?.color || '#3f3f46',
                borderColor: choice?.color ? `${choice.color}40` : '#e4e4e7',
              }}
            >
              {String(v)}
            </span>
          )
        })}
      </span>
    )
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
