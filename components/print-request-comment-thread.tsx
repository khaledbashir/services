'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface Comment {
  id: string
  author_name: string | null
  body: string
  attachment_url: string | null
  attachment_filename: string | null
  attachment_mime: string | null
  created_at: string
}

interface Props {
  printRequestId: string
  /** Initial sort. Overridden by the user's saved preference if present. */
  initialOrder?: 'asc' | 'desc'
}

const PREF_KEY = 'print.comments.order'

function fmt(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

async function fileToDataUrl(file: File): Promise<{ data: string; mimeType: string; filename: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ data: String(reader.result), mimeType: file.type || 'application/octet-stream', filename: file.name })
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function PrintRequestCommentThread({ printRequestId, initialOrder = 'asc' }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [order, setOrderState] = useState<'asc' | 'desc'>(initialOrder)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/preferences?key=${encodeURIComponent(PREF_KEY)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.value === 'asc' || d?.value === 'desc') setOrderState(d.value) })
      .catch(() => {})
  }, [])

  const setOrder = (next: 'asc' | 'desc') => {
    setOrderState(next)
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: PREF_KEY, value: next }),
    }).catch(() => {})
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/print-requests/${printRequestId}/comments`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setComments(data.comments || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [printRequestId])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!text.trim() && !file) return
    setSending(true)
    setError(null)
    try {
      const payload: Record<string, unknown> = { body: text }
      if (file) payload.attachment = await fileToDataUrl(file)
      const res = await fetch(`/api/print-requests/${printRequestId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setComments(prev => [...prev, data.comment])
      setText('')
      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to post')
    } finally {
      setSending(false)
    }
  }

  const remove = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return
    try {
      const res = await fetch(`/api/print-requests/${printRequestId}/comments/${commentId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setComments(prev => prev.filter(c => c.id !== commentId))
    } catch (e) {
      console.error(e)
    }
  }

  const ordered = order === 'desc' ? [...comments].reverse() : comments

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Comments &amp; Proofs</h3>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
            className="text-[11px] text-zinc-400 hover:text-zinc-900"
            title="Toggle sort"
          >
            {order === 'asc' ? 'Oldest first ↓' : 'Newest first ↑'}
          </button>
          <span className="text-[11px] text-zinc-400">{comments.length} {comments.length === 1 ? 'entry' : 'entries'}</span>
        </div>
      </div>

      <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-1">
        {loading && <div className="text-xs text-zinc-400">Loading…</div>}
        {!loading && comments.length === 0 && (
          <div className="rounded-lg bg-zinc-50 px-3 py-4 text-center text-xs text-zinc-400">
            No comments yet. Drop a proof PDF or leave a note for the printer below.
          </div>
        )}
        {ordered.map(c => (
          <div key={c.id} className="rounded-lg border border-[#E6ECF5] bg-white px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-700">{c.author_name || 'Unknown'}</span>
              <span className="text-[11px] text-zinc-400">{fmt(c.created_at)}</span>
            </div>
            {c.body && <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-800">{c.body}</p>}
            {c.attachment_url && (
              <a
                href={c.attachment_url}
                download={c.attachment_filename || 'attachment'}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-2 rounded-md border border-[#E6ECF5] bg-[#F4F8FF] px-2.5 py-1.5 text-xs font-medium text-[#0A52EF] hover:bg-[#E8F0FF]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {c.attachment_filename || 'Download attachment'}
              </a>
            )}
            <div className="mt-1 flex justify-end">
              <button
                onClick={() => remove(c.id)}
                className="text-[10.5px] text-zinc-400 hover:text-rose-600"
                title="Delete"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] p-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="Message the printer, log a status update, or note edits…"
          className="w-full resize-none rounded-md bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-1 ring-zinc-200 focus:ring-2 focus:ring-[#0A52EF]/30"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-600 hover:text-zinc-900">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? <span className="truncate max-w-[200px]">{file.name}</span> : <span>Attach proof</span>}
          </label>
          <button
            type="button"
            onClick={submit}
            disabled={sending || (!text.trim() && !file)}
            className="rounded-md bg-[#0A52EF] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#0840C0] disabled:opacity-50"
          >
            {sending ? 'Posting…' : 'Post'}
          </button>
        </div>
        {error && <div className="mt-2 text-[11px] text-rose-600">{error}</div>}
      </div>
    </div>
  )
}
