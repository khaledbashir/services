'use client'

import { useState } from 'react'
import { FtpFolderBrowser } from '@/components/ftp-folder-browser'

/**
 * "Create proof from the proof server" panel for a ticket (Design Request,
 * Content Schedule, CG Design, Print Request). Alexis browses the FTP to the
 * folder that holds this ticket's content, generates a client proof link, and
 * the link ties back to THIS ticket — so when the client approves or requests
 * changes it updates the ticket's status. Opens pre-navigated to the client's
 * folder via the ticket's tri-code when possible.
 */
export function TicketProofFtp({
  objectType,
  recordId,
  triCode,
  clientName,
  clientEmail,
  existingProofUrl,
}: {
  objectType: 'designRequest' | 'contentSchedule' | 'cgDesignRequest' | 'printRequest'
  recordId: string
  triCode?: string | null
  clientName?: string | null
  clientEmail?: string | null
  existingProofUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [folder, setFolder] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [result, setResult] = useState<{ url: string; fileCount: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<string | null>(null)

  const create = async () => {
    if (!folder) return
    setCreating(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/proof-ftp/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderPath: folder,
          twentyObjectType: objectType,
          twentyRecordId: recordId,
          clientName: clientName || undefined,
          clientEmail: clientEmail || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }
      setResult({ url: data.url, fileCount: data.fileCount })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create proof')
    } finally {
      setCreating(false)
    }
  }

  const proofUrl = result?.url || existingProofUrl || null
  const managedToken = proofUrl?.match(/\/proof\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/)?.[1] || null

  const sync = async () => {
    if (!managedToken) return
    setSyncing(true)
    setError(null)
    setSyncStatus(null)
    try {
      const res = await fetch(`/api/proof-ftp/share/${managedToken}/sync`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }
      setSyncStatus(
        `${data.activeFileCount} current · ${data.added} added · ${data.updated} updated · ${data.unpublished} unpublished`
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to refresh files')
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-200 p-4" style={{ ['--anc-brand' as any]: '#0A52EF' }}>
      <div className="flex items-center justify-between gap-3 mb-1">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Client proof</div>
          <div className="text-xs text-zinc-500">Generate a review link from the proof server for this ticket.</div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 text-sm px-3 py-1.5 rounded-lg bg-[color:var(--anc-brand)] text-white font-medium hover:opacity-90"
          >
            {proofUrl ? 'New proof' : 'Create proof'}
          </button>
        )}
      </div>

      {proofUrl && !open && (
        <div className="mt-3 bg-zinc-50 rounded-lg border border-zinc-200 p-2.5 flex items-center gap-2">
          <input
            readOnly
            value={proofUrl}
            className="flex-1 text-xs font-mono text-zinc-700 bg-transparent focus:outline-none"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <button onClick={() => navigator.clipboard.writeText(proofUrl)} className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-[color:var(--anc-brand)] text-white font-medium hover:opacity-90">Copy</button>
          <a href={proofUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700 font-medium hover:border-zinc-300">Open</a>
          {managedToken && (
            <button
              type="button"
              onClick={sync}
              disabled={syncing}
              className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700 font-medium hover:border-zinc-300 disabled:opacity-40"
            >
              {syncing ? 'Refreshing…' : 'Refresh files'}
            </button>
          )}
        </div>
      )}
      {syncStatus && !open && <div className="mt-2 text-xs text-zinc-500">{syncStatus}</div>}
      {error && !open && <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{error}</div>}

      {open && (
        <div className="mt-3 space-y-3">
          <FtpFolderBrowser selected={folder} onSelect={setFolder} triCode={triCode} />
          {error && <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{error}</div>}
          {result && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
              <div className="text-xs font-semibold text-green-900 mb-2">✅ Proof link created · {result.fileCount} file{result.fileCount !== 1 ? 's' : ''} · tied to this ticket</div>
              <div className="bg-white rounded-md border border-green-200 p-2 flex items-center gap-2">
                <input readOnly value={result.url} className="flex-1 text-xs font-mono text-zinc-700 bg-transparent focus:outline-none" onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button onClick={() => navigator.clipboard.writeText(result.url)} className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-[color:var(--anc-brand)] text-white font-medium">Copy</button>
                <a href={result.url} target="_blank" rel="noreferrer" className="shrink-0 text-xs px-2.5 py-1 rounded-md bg-white border border-zinc-200 text-zinc-700 font-medium">Open</a>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={create}
              disabled={!folder || creating}
              className="text-sm px-3 py-1.5 rounded-lg bg-[color:var(--anc-brand)] text-white font-medium hover:opacity-90 disabled:opacity-40"
            >
              {creating ? 'Creating…' : 'Generate proof link'}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setResult(null); setError(null); setFolder(null) }}
              className="text-sm px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-600 font-medium hover:border-zinc-300"
            >
              {result ? 'Done' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
