'use client'

// Upload + manage proof files for a design request.
//
// Replaces the legacy FTP workflow (designer drops into T:\ → workspace.anc.com
// generates a link) with native storage in the dashboard backed by MinIO.
//
// Designer drags a file onto the drop zone (or clicks to pick), file lands in
// MinIO, a new row in design_request_files is created, and the latest proof
// drives the public client-review page at /proof/[token].

import { useCallback, useEffect, useRef, useState } from 'react'

interface Proof {
  id: string
  filename: string
  mime_type: string | null
  size_bytes: number
  backend: 's3' | 'postgres_bytea'
  has_storage_key: boolean
  uploaded_at: string
  version: number
  last_viewed_at: string | null
  view_count: number
}

function formatBytes(n: number): string {
  if (!n) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const e = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / Math.pow(1024, e)).toFixed(e === 0 ? 0 : 1)} ${units[e]}`
}

function formatDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return iso }
}

function formatRelativeView(value: string | null): string {
  if (!value) return 'Not viewed yet'
  const diffMs = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(diffMs / 60000))
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function DesignProofUpload({ designRequestId }: { designRequestId: string }) {
  const [proofs, setProofs] = useState<Proof[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/design-requests/${designRequestId}/proofs`)
      if (!res.ok) throw new Error('Failed to load proofs')
      const data = await res.json()
      setProofs(data.proofs || [])
    } catch (err: any) {
      setError(err?.message || 'Failed to load proofs')
    } finally {
      setLoading(false)
    }
  }, [designRequestId])

  useEffect(() => { reload() }, [reload])

  const doUpload = useCallback(async (file: File) => {
    setError(null)
    setUploading(true)
    setUploadProgress(`Uploading ${file.name} (${formatBytes(file.size)})...`)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/design-requests/${designRequestId}/proofs`, {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
      setUploadProgress(null)
      await reload()
    } catch (err: any) {
      setError(err?.message || 'Upload failed')
      setUploadProgress(null)
    } finally {
      setUploading(false)
    }
  }, [designRequestId, reload])

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) doUpload(file)
  }, [doUpload])

  const handlePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) doUpload(file)
    if (fileRef.current) fileRef.current.value = ''
  }, [doUpload])

  const handleDelete = useCallback(async (fileId: string) => {
    if (!confirm('Delete this proof file? It will also be removed from client proof links.')) return
    try {
      const res = await fetch(`/api/design-requests/${designRequestId}/proofs/${fileId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      await reload()
    } catch (err: any) {
      setError(err?.message || 'Delete failed')
    }
  }, [designRequestId, reload])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">Proof files</h3>
        <span className="text-[11px] text-zinc-500">{proofs.length} uploaded</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg px-5 py-7 text-center cursor-pointer transition-colors ${
          dragging ? 'border-[#0A52EF] bg-[#0A52EF]/5' : 'border-zinc-300 bg-zinc-50 hover:bg-zinc-100'
        } ${uploading ? 'opacity-60 cursor-wait' : ''}`}
      >
        <input ref={fileRef} type="file" className="hidden" onChange={handlePick}
          accept=".psd,.ai,.pdf,.png,.jpg,.jpeg,.gif,.webp,.mp4,.mov,.webm,.zip" />
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <div className="mt-3 text-sm text-zinc-700 font-medium">
          {uploading ? uploadProgress || 'Uploading…' : 'Drop a file here, or click to browse'}
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">PSD · AI · PDF · PNG · JPG · MP4 · MOV · up to 500MB</div>
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{error}</div>
      )}

      {loading ? (
        <div className="text-xs text-zinc-400 py-3 text-center">Loading…</div>
      ) : proofs.length === 0 ? (
        <div className="text-xs text-zinc-400 py-3 text-center">No proofs uploaded yet.</div>
      ) : (
        <div className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
          {proofs.map((p) => (
            <div key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 transition-colors">
              <div className="w-7 h-7 flex-shrink-0 rounded bg-[#0A52EF]/10 text-[#0A52EF] flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-zinc-900 truncate font-medium">{p.filename}</div>
                <div className="text-[11px] text-zinc-500 truncate">
                  <span className="inline-block rounded-full bg-[#0A52EF]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#0A52EF]">v{p.version}</span>
                  <span className="ml-2">{formatBytes(p.size_bytes)} · {formatDate(p.uploaded_at)}</span>
                  {p.backend === 's3' && <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-medium">MinIO</span>}
                  {p.backend === 'postgres_bytea' && <span className="ml-2 inline-block px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 text-[10px] font-medium">Legacy</span>}
                </div>
                <div className="text-[11px] text-zinc-400 truncate">
                  Last viewed: {formatRelativeView(p.last_viewed_at)}{` · ${p.view_count} view${p.view_count === 1 ? '' : 's'}`}
                </div>
              </div>
              <a href={`/api/design-requests/${designRequestId}/proofs/${p.id}/download`}
                 target="_blank" rel="noopener noreferrer"
                 className="text-[11px] text-[#0A52EF] hover:underline flex-shrink-0">Open</a>
              <button onClick={() => handleDelete(p.id)}
                className="text-[11px] text-rose-500 hover:text-rose-700 flex-shrink-0">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
