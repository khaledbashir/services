'use client'

import { useCallback, useEffect, useState } from 'react'

type RosterFile = {
  id: string
  displayNumber: number
  name: string
  kind: string
  response: 'approved' | 'changes_requested' | null
  responseNote: string | null
  responseAt: string | null
}

type RosterData = {
  approved: number
  changesRequested: number
  awaiting: number
  clientResponse: string | null
  clientResponseAt: string | null
  files: RosterFile[]
  previouslyApproved: Array<{
    name: string
    sourceVersion: string
    note?: string | null
    at?: string | null
    archivedAt: string
  }>
  clientUploads: Array<{
    filename: string
    contentType: string
    size: number
    uploadedAt: string | null
    downloadUrl: string | null
    proofFolderPath: string | null
    ftpPath: string | null
  }>
}

function formatFileSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Staff-side roster of the files inside a managed proof link, with each
 * file's client decision — so the Approved step shows exactly what was
 * approved and what was sent back, per file.
 */
export function ProofFileRoster({ proofUrl }: { proofUrl: string | null }) {
  const token = proofUrl?.match(/\/proof\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/)?.[1] || null
  const [data, setData] = useState<RosterData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/proof-ftp/share/${token}`)
      if (!res.ok) {
        // Non-FTP proofs (uploaded files) have no roster — stay quiet.
        if (res.status !== 404) setError('Could not load the proof file list.')
        return
      }
      setData(await res.json())
    } catch {
      setError('Could not load the proof file list.')
    }
  }, [token])

  useEffect(() => {
    load()
  }, [load])

  if (!token || (!data && !error)) return null
  if (error) return <div className="text-xs text-red-600">{error}</div>
  if (!data || (data.files.length === 0 && data.clientUploads.length === 0 && data.previouslyApproved.length === 0)) return null

  return (
    <div className="rounded-lg border border-zinc-200 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-200">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          Files in this proof
        </span>
        <span className="text-[11px] text-zinc-500">
          {data.approved} approved · {data.changesRequested} changes · {data.awaiting} awaiting
        </span>
      </div>
      <div className="divide-y divide-zinc-100 max-h-64 overflow-y-auto">
        {data.files.map((file) => (
          <div key={file.id} className="px-3 py-2 flex items-start gap-2 text-xs">
            <span className="shrink-0 mt-0.5">
              {file.response === 'approved' ? (
                <span className="text-green-600">✓</span>
              ) : file.response === 'changes_requested' ? (
                <span className="text-amber-600">✎</span>
              ) : (
                <span className="text-zinc-300">•</span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-zinc-800">
                {file.displayNumber}. {file.name}
              </div>
              {file.responseNote && (
                <div className="mt-0.5 text-zinc-500 whitespace-pre-wrap">{file.responseNote}</div>
              )}
            </div>
            <span
              className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                file.response === 'approved'
                  ? 'bg-green-100 text-green-700'
                  : file.response === 'changes_requested'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {file.response === 'approved'
                ? 'Approved'
                : file.response === 'changes_requested'
                  ? 'Changes'
                  : 'Awaiting'}
            </span>
          </div>
        ))}
      </div>
      {data.previouslyApproved.length > 0 && (
        <div className="border-t border-emerald-200 bg-emerald-50/70">
          <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
            Previously approved versions
          </div>
          <div className="divide-y divide-emerald-100">
            {data.previouslyApproved.map((item, index) => (
              <div key={`${item.name}-${item.sourceVersion}-${index}`} className="flex items-center gap-2 px-3 py-2 text-xs text-emerald-900">
                <span className="font-semibold">✓</span>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="shrink-0 text-[10px] text-emerald-700">No re-approval needed</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.clientUploads.length > 0 && (
        <div className="border-t border-zinc-200">
          <div className="px-3 py-2 bg-blue-50 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
            Replacement media from client
          </div>
          <div className="divide-y divide-zinc-100">
            {data.clientUploads.map((upload, index) => (
              <div key={`${upload.filename}-${upload.uploadedAt || index}`} className="px-3 py-2 flex items-center gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-zinc-800">{upload.filename}</div>
                  <div className="text-[10px] text-zinc-500">
                    {[formatFileSize(upload.size), upload.uploadedAt ? new Date(upload.uploadedAt).toLocaleString() : '']
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {upload.proofFolderPath && (
                    <div className="mt-0.5 truncate font-mono text-[10px] text-blue-700" title={upload.ftpPath || upload.proofFolderPath}>
                      {upload.proofFolderPath}
                    </div>
                  )}
                </div>
                {upload.downloadUrl && (
                  <a
                    href={upload.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1.5 font-medium text-white hover:bg-blue-700"
                  >
                    Download
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
