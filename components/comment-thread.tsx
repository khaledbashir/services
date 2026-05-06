'use client'

// Comment thread for design / CG requests (Alexis 5/6 spec).
// - Distinct from the existing Notes field (Notes = static spec, Comments =
//   ongoing conversation).
// - Reverse-chronological (newest at top).
// - @-mentions: type "@" to surface a staff dropdown; pick to insert
//   "@<full_name>" into the body and tag them on the record.
// - Author can delete own comment; admin can delete any.
//
// Wire by passing baseUrl="/api/<entity>/<id>/comments" + the staff list.

import { useEffect, useMemo, useRef, useState } from 'react'

interface Comment {
  id: string
  author_id: string | null
  author_name: string | null
  body: string
  mentions: string[]
  created_at: string
}

interface Staff { id: string; full_name: string }

interface Props {
  baseUrl: string                   // e.g. /api/design-requests/abc/comments
  staff: Staff[]
  currentUserId?: string | null
  isAdmin?: boolean
}

export function CommentThread({ baseUrl, staff, currentUserId, isAdmin }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [mentionState, setMentionState] = useState<{ open: boolean; query: string; start: number }>({ open: false, query: '', start: 0 })
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(baseUrl, { cache: 'no-store' })
      if (r.ok) setComments((await r.json()).comments || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [baseUrl])

  // Parse @-mentions on submit. Match "@First Last" against the staff list;
  // unmatched @-tokens are kept in the body as-is but NOT added to the
  // mentions array (so notifications don't fire on garbage).
  const extractMentions = (body: string): string[] => {
    const found = new Set<string>()
    for (const s of staff) {
      const re = new RegExp('@' + s.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      if (re.test(body)) found.add(s.id)
    }
    return Array.from(found)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || posting) return
    setPosting(true)
    try {
      const r = await fetch(baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text, mentions: extractMentions(text) }),
      })
      if (r.ok) {
        setDraft('')
        await load()
      }
    } finally { setPosting(false) }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Delete this comment?')) return
    const r = await fetch(`${baseUrl}/${id}`, { method: 'DELETE' })
    if (r.ok) setComments(prev => prev.filter(c => c.id !== id))
  }

  // Render body with @-mentions highlighted in blue.
  const renderBody = (body: string) => {
    const parts: React.ReactNode[] = []
    const re = new RegExp('@(' + staff.map(s => s.full_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi')
    let last = 0; let m: RegExpExecArray | null
    while (staff.length > 0 && (m = re.exec(body)) !== null) {
      if (m.index > last) parts.push(<span key={last}>{body.slice(last, m.index)}</span>)
      parts.push(
        <span key={m.index} className="inline-block bg-[#0A52EF]/10 text-[#0A52EF] font-medium px-1 rounded">
          @{m[1]}
        </span>
      )
      last = m.index + m[0].length
    }
    if (last < body.length) parts.push(<span key={last}>{body.slice(last)}</span>)
    return parts.length ? parts : body
  }

  // @-mention dropdown trigger: when the user types "@" we open a small
  // staff picker. Filtered by what they typed after the @.
  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value
    setDraft(v)
    const cursor = e.target.selectionStart || 0
    const before = v.slice(0, cursor)
    const lastAt = before.lastIndexOf('@')
    if (lastAt === -1) { setMentionState(m => ({ ...m, open: false })); return }
    const between = before.slice(lastAt + 1)
    if (/\s/.test(between) || between.length > 24) {
      setMentionState(m => ({ ...m, open: false }))
    } else {
      setMentionState({ open: true, query: between.toLowerCase(), start: lastAt })
    }
  }

  const filteredStaff = useMemo(() => {
    if (!mentionState.open) return [] as Staff[]
    const q = mentionState.query.trim().toLowerCase()
    return staff
      .filter(s => !q || s.full_name.toLowerCase().includes(q))
      .slice(0, 6)
  }, [mentionState, staff])

  const insertMention = (s: Staff) => {
    const before = draft.slice(0, mentionState.start)
    const after = draft.slice((textareaRef.current?.selectionStart || 0))
    const next = `${before}@${s.full_name} ${after}`
    setDraft(next)
    setMentionState(m => ({ ...m, open: false }))
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const fmtAge = (iso: string) => {
    const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`
    if (diff < 604800) return `${Math.floor(diff / 86400)}d`
    return d.toLocaleDateString()
  }

  return (
    <div className="border border-zinc-200 bg-white p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Comments</h2>
        <span className="text-[11px] text-zinc-400 tabular-nums">{comments.length}</span>
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="space-y-2 relative">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={onChange}
          rows={3}
          placeholder="Write a comment. Type @ to mention someone."
          className="w-full border border-zinc-200 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-none bg-white"
        />
        {mentionState.open && filteredStaff.length > 0 && (
          <div className="absolute left-0 right-auto z-30 mt-1 bg-white border border-zinc-200 rounded-md shadow-lg py-1 min-w-[220px] max-h-64 overflow-y-auto">
            {filteredStaff.map(s => (
              <button
                key={s.id}
                type="button"
                onClick={() => insertMention(s)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50"
              >
                {s.full_name}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!draft.trim() || posting}
            className="px-3 py-1.5 bg-[#0A52EF] text-white rounded text-xs font-medium hover:bg-[#0840C0] disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </div>
      </form>

      {/* List — newest first per Alexis */}
      <div className="space-y-3">
        {loading ? (
          <div className="px-2 py-4 text-center text-xs text-zinc-400">Loading…</div>
        ) : comments.length === 0 ? (
          <div className="px-2 py-6 text-center text-xs text-zinc-400">No comments yet. Start a conversation about this request above.</div>
        ) : comments.map(c => (
          <div key={c.id} className="border border-zinc-100 rounded p-3 group">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-700">{c.author_name || 'Unknown'}</span>
              <div className="flex items-center gap-2 text-zinc-400">
                <span className="tabular-nums">{fmtAge(c.created_at)}</span>
                {(isAdmin || (c.author_id && c.author_id === currentUserId)) && (
                  <button
                    onClick={() => remove(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-rose-600"
                    aria-label="Delete comment"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <div className="mt-1.5 text-[13px] text-zinc-800 whitespace-pre-wrap">{renderBody(c.body)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
