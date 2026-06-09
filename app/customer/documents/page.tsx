'use client'

import { useEffect, useState } from 'react'
import PortalShell from '../PortalShell'

interface Doc {
  id: string
  name: string
  type: string
  size: number
  description: string | null
  venue_name: string
  created_at: string
  url: string
}

function fmtSize(bytes: number) {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function typeLabel(mime: string) {
  if (!mime) return 'File'
  if (mime.includes('pdf')) return 'PDF'
  if (mime.includes('sheet') || mime.includes('excel') || mime.includes('csv')) return 'Excel'
  if (mime.includes('word') || mime.includes('msword')) return 'Word'
  if (mime.startsWith('image/')) return 'Image'
  if (mime.includes('zip')) return 'ZIP'
  if (mime.includes('text')) return 'Text'
  return 'File'
}

function DocumentsContent() {
  const [docs, setDocs] = useState<Doc[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/customer/documents')
      .then(res => res.ok ? res.json() : null)
      .then(data => setDocs(data?.documents || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = search
    ? docs.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        d.venue_name.toLowerCase().includes(search.toLowerCase()) ||
        (d.description || '').toLowerCase().includes(search.toLowerCase()))
    : docs

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="cp-page-title">Documents</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--anc-muted)' }}>
            Files the ANC team has shared for your venues — manuals, reports, schedules.
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search documents…"
          className="cp-input"
          style={{ width: 240, padding: '9px 14px' }}
        />
      </div>

      <div className="cp-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>
            {docs.length === 0 ? 'No documents shared yet.' : 'Nothing matches that search.'}
          </div>
        ) : (
          <div className="cp-stagger">
            {filtered.map(d => (
              <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer" className="cp-row">
                <div className="flex items-center gap-4">
                  <span className="cp-doc-type">{typeLabel(d.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate text-sm">{d.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--anc-muted)' }}>
                      {d.venue_name} · {fmtDate(d.created_at)} · {fmtSize(d.size)}
                      {d.description && ` — ${d.description}`}
                    </div>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--anc-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
                  </svg>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function CustomerDocumentsPage() {
  return (
    <PortalShell active="Documents">
      <DocumentsContent />
    </PortalShell>
  )
}
