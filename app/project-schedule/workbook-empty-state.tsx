'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'

export default function WorkbookEmptyState() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(file: File) {
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await fetch('/api/project-schedule/workbook', { method: 'POST', body })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Import failed')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">No project schedule loaded</h1>
        <p className="mt-2 text-sm text-slate-600">
          The command center builds itself from the PM project schedule workbook. Import the latest
          one to populate active projects, submittals and the on-site calendar.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) upload(file)
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-6 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? 'Importing…' : 'Import schedule (.xlsx)'}
        </button>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <p className="mt-4 text-xs text-slate-500">
          Needs an “Active Projects” sheet. Overrides, tasks and submittals already recorded in the
          dashboard are preserved.
        </p>
      </div>
    </div>
  )
}
