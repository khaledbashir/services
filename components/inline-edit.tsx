'use client'

import { useState, useRef, useEffect } from 'react'

interface InlineEditProps {
  value: string
  onSave: (value: string) => void
  type?: 'text' | 'select' | 'textarea'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  className?: string
  displayClassName?: string
  emptyText?: string
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  placeholder,
  className = '',
  displayClassName = '',
  emptyText = '—',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = () => {
    setEditing(false)
    if (draft !== value) onSave(draft)
  }

  const cancel = () => {
    setEditing(false)
    setDraft(value)
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer hover:bg-blue-50 hover:text-[#0A52EF] rounded px-1 -mx-1 py-0.5 transition-colors group inline-flex items-center gap-1 ${displayClassName}`}
        title="Click to edit"
      >
        {value || <span className="text-zinc-300 italic">{emptyText}</span>}
        <svg className="w-2.5 h-2.5 text-zinc-300 group-hover:text-[#0A52EF] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      </span>
    )
  }

  if (type === 'select' && options) {
    return (
      <select
        ref={inputRef as any}
        value={draft}
        onChange={e => { setDraft(e.target.value); onSave(e.target.value); setEditing(false) }}
        onBlur={() => setEditing(false)}
        className={`border border-[#0A52EF] rounded px-1.5 py-0.5 text-sm outline-none bg-white ${className}`}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    )
  }

  if (type === 'textarea') {
    return (
      <textarea
        ref={inputRef as any}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => { if (e.key === 'Escape') cancel() }}
        placeholder={placeholder}
        className={`w-full border border-[#0A52EF] rounded px-2 py-1 text-sm outline-none resize-none ${className}`}
        rows={3}
      />
    )
  }

  return (
    <input
      ref={inputRef as any}
      type="text"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
      placeholder={placeholder}
      className={`border border-[#0A52EF] rounded px-1.5 py-0.5 text-sm outline-none w-full ${className}`}
    />
  )
}
