'use client'

import { useCallback, useEffect, useState } from 'react'

const OBJECT_TYPES = [
  { value: 'printRequest', label: 'Print Request (Britten)' },
  { value: 'designRequest', label: 'Design Request' },
  { value: 'cgDesignRequest', label: 'CG Design Request' },
  { value: 'contentSchedule', label: 'Content Schedule' },
]

type ShareResult = {
  url: string
  expiresAt: string | null
  attachmentCount?: number
  fileCount?: number
  recordName?: string
  folderPath?: string
}

type FtpEntry = { name: string; path: string; type: 'dir' | 'file'; size: number; kind?: string }
type FtpListing = {
  path: string
  parent: string | null
  entries: FtpEntry[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}

export default function ProofAdminPage() {
  const [mode, setMode] = useState<'crm' | 'ftp'>('crm')

  // Shared fields
  const [message, setMessage] = useState('')
  const [createdByName, setCreatedByName] = useState('')
  const [createdByEmail, setCreatedByEmail] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(14)

  // CRM mode
  const [objectType, setObjectType] = useState('printRequest')
  const [recordId, setRecordId] = useState('')

  // FTP mode
  const [clientName, setClientName] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ShareResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const createCrm = async () => {
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/proof-share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twentyObjectType: objectType,
          twentyRecordId: recordId.trim(),
          expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
          message: message || undefined,
          createdByName: createdByName || undefined,
          createdByEmail: createdByEmail || undefined,
          clientEmail: clientEmail || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || `Error ${res.status}`); return }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally { setLoading(false) }
  }

  const createFtp = async () => {
    if (!selectedFolder) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await fetch('/api/proof-ftp/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: selectedFolder,
          clientName: clientName || undefined,
          clientEmail: clientEmail || undefined,
          message: message || undefined,
          createdByName: createdByName || undefined,
          createdByEmail: createdByEmail || undefined,
          expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || `Error ${res.status}`); return }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally { setLoading(false) }
  }

  const copy = (text: string) => navigator.clipboard.writeText(text)

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" style={{ ['--anc-brand' as any]: '#0A52EF' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[color:var(--anc-brand)] flex items-center justify-center">
            <span className="text-white font-bold text-xs tracking-tight">ANC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">ANC Sports</div>
            <div className="text-xs text-gray-500">Generate proof share link</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Share a proof with a client</h1>
            <p className="text-sm text-gray-600">
              Turn a CRM record or a folder on the proof server into a polished public URL for client review.
            </p>
          </div>

          {/* Source toggle */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-lg">
            <button
              type="button"
              onClick={() => { setMode('crm'); setResult(null); setError(null) }}
              className={`py-2 text-sm font-medium rounded-md transition ${mode === 'crm' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              From CRM record
            </button>
            <button
              type="button"
              onClick={() => { setMode('ftp'); setResult(null); setError(null) }}
              className={`py-2 text-sm font-medium rounded-md transition ${mode === 'ftp' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              From proof server folder
            </button>
          </div>

          {mode === 'crm' && (
            <>
              <Field label="Object type" required>
                <select
                  value={objectType}
                  onChange={(e) => setObjectType(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
                >
                  {OBJECT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Record ID" required hint="Copy the UUID from the record's URL — the long string after /view/">
                <input
                  type="text"
                  value={recordId}
                  onChange={(e) => setRecordId(e.target.value)}
                  placeholder="e.g. 189ae25b-096d-43b8-9fda-fb862a1352dc"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
                />
              </Field>
            </>
          )}

          {mode === 'ftp' && (
            <>
              <Field label="Proof folder" required hint="Browse to the folder that holds this client's proofs, then select it.">
                <FolderBrowser selected={selectedFolder} onSelect={setSelectedFolder} />
              </Field>

              <Field label="Client name (optional)" hint="Shown at the top of the proof page">
                <input
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Tin Building NYC"
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
                />
              </Field>
            </>
          )}

          <Field label="Message to client (optional)" hint="Shows at the top of the proof page">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Hi team — here's the proof for review. Let us know if you have any changes!"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Your name" hint="Shown to the client">
              <input
                type="text"
                value={createdByName}
                onChange={(e) => setCreatedByName(e.target.value)}
                placeholder="Alexis Ventarola"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
              />
            </Field>
            <Field label="Your email" hint="For client to reply to">
              <input
                type="email"
                value={createdByEmail}
                onChange={(e) => setCreatedByEmail(e.target.value)}
                placeholder="alexis@anc.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
              />
            </Field>
          </div>

          <Field label="Client email (optional)" hint="Auto-sends the proof link with Approve/Request Changes buttons">
            <input
              type="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="client@company.com"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
            />
          </Field>

          <Field label="Expires in (days)" hint="Leave blank for no expiration">
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
              min={1}
              placeholder="14"
              className="w-32 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}

          <button
            onClick={mode === 'crm' ? createCrm : createFtp}
            disabled={loading || (mode === 'crm' ? !recordId.trim() : !selectedFolder)}
            className="w-full py-3 bg-[color:var(--anc-brand)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating…' : 'Generate share link'}
          </button>

          {result && (
            <div className="rounded-xl bg-green-50 border-2 border-green-200 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Share link created</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {result.recordName || result.folderPath} · {(result.fileCount ?? result.attachmentCount) ?? 0} file{((result.fileCount ?? result.attachmentCount) ?? 0) !== 1 ? 's' : ''} · {result.expiresAt ? `expires ${new Date(result.expiresAt).toLocaleDateString()}` : 'no expiration'}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-3 flex items-center gap-2">
                <input
                  readOnly
                  value={result.url}
                  className="flex-1 text-xs font-mono text-gray-800 bg-transparent focus:outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={() => copy(result.url)} className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-[color:var(--anc-brand)] text-white font-medium hover:opacity-90">Copy</button>
                <a href={result.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 font-medium hover:border-gray-300">Open</a>
              </div>
              <div className="text-xs text-gray-600 mt-3">
                Paste this link in an email to your client. They&apos;ll see the proof, review it, and can approve or request changes.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function FolderBrowser({ selected, onSelect }: { selected: string | null; onSelect: (p: string | null) => void }) {
  const [path, setPath] = useState('/')
  const [listing, setListing] = useState<FtpListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  const load = useCallback(async (p: string, pg: number) => {
    setLoading(true); setErr(null)
    try {
      const res = await fetch(`/api/proof-ftp/browse?path=${encodeURIComponent(p)}&page=${pg}&pageSize=100`)
      const data = await res.json()
      if (!res.ok) { setErr(data.error || `Error ${res.status}`); setListing(null); return }
      setListing(data)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to browse')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(path, page) }, [path, page, load])

  const go = (p: string) => { setPage(1); setPath(p) }

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Breadcrumb / current path */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-xs">
        <button
          type="button"
          disabled={!listing?.parent && path === '/'}
          onClick={() => listing?.parent !== null && go(listing?.parent ?? '/')}
          className="px-2 py-1 rounded bg-white border border-gray-200 text-gray-600 disabled:opacity-40 hover:border-gray-300"
        >
          ↑ Up
        </button>
        <span className="font-mono text-gray-700 truncate">{path}</span>
      </div>

      {/* Entries */}
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
        {loading && <div className="px-3 py-6 text-center text-xs text-gray-400">Loading…</div>}
        {err && <div className="px-3 py-3 text-xs text-red-600">{err}</div>}
        {!loading && !err && listing && listing.entries.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-400">Empty folder</div>
        )}
        {!loading && !err && listing?.entries.map((e) => (
          <div key={e.path} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50">
            {e.type === 'dir' ? (
              <button type="button" onClick={() => go(e.path)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                <span className="text-gray-400">📁</span>
                <span className="truncate text-gray-800">{e.name}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-gray-300">{e.kind === 'video' ? '🎬' : e.kind === 'image' ? '🖼️' : '📄'}</span>
                <span className="truncate text-gray-500">{e.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination + select-this-folder */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs">
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40">‹</button>
          <span className="text-gray-500">{listing ? `${listing.entries.length ? (page - 1) * 100 + 1 : 0}–${(page - 1) * 100 + (listing.entries.length)} of ${listing.total}` : ''}</span>
          <button type="button" disabled={!listing?.hasMore} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 rounded bg-white border border-gray-200 disabled:opacity-40">›</button>
        </div>
        <button
          type="button"
          onClick={() => onSelect(path)}
          disabled={path === '/'}
          className={`px-3 py-1.5 rounded-md font-medium ${selected === path ? 'bg-green-600 text-white' : 'bg-[color:var(--anc-brand)] text-white hover:opacity-90'} disabled:opacity-40`}
        >
          {selected === path ? '✓ Selected this folder' : 'Use this folder'}
        </button>
      </div>

      {selected && (
        <div className="px-3 py-2 bg-green-50 border-t border-green-200 text-xs text-green-800 font-mono truncate">
          Selected: {selected}
        </div>
      )}
    </div>
  )
}

function Field({
  label, hint, required, children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
