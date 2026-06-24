'use client'

// ---------------------------------------------------------------------------
// SUBMITTAL OCR AUTO-CREATE
//
// "Have the submittals automatically created based on what we upload."
// Drop drawing PDFs/images → the platform reads each sheet's title block →
// proposes a list of submittal register entries → the PM reviews/edits → one
// click creates them. The created rows merge straight into the live submittal
// board (same shapes, same override + transmittal layers).
//
// Token discipline matches submittal-board.tsx / project-workspace-client.tsx:
// rounded-md, #0A52EF primary, #E8E8E8 hairlines, uppercase tracking eyebrows,
// tabular-nums, light-first with the centralized .dark override.
// ---------------------------------------------------------------------------

import { useRef, useState } from 'react'
import { Loader2, ScanLine, Trash2, UploadCloud, X } from 'lucide-react'
import type { ActiveProject } from '@/lib/project-schedule'

interface Detected {
  sheetNumber: string
  title: string
  revision: string
  packageType: string
  confidence: number
}

const PACKAGE_OPTIONS = [
  'LED specs / drawings',
  'Electrical permit set',
  'Structural permit set',
  'One-lines / rack elevations',
  'General',
]

const inputClass =
  'h-9 w-full rounded-md border border-[#E8E8E8] bg-white px-2.5 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20'

const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

type Phase = 'idle' | 'uploading' | 'review'

export function SubmittalOcrUpload({
  projectId,
  onCreated,
}: {
  projectId: string
  onCreated: (project: ActiveProject) => void
}) {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [method, setMethod] = useState<'llm' | 'fallback' | null>(null)
  const [rows, setRows] = useState<Detected[]>([])
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setPhase('idle')
    setError(null)
    setMethod(null)
    setRows([])
    setDragActive(false)
  }

  function close() {
    setOpen(false)
    reset()
  }

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files)
    if (!list.length) return
    setPhase('uploading')
    setError(null)
    const form = new FormData()
    for (const f of list) form.append('files', f)
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/submittals/ocr`, {
        method: 'POST',
        body: form,
      })
      const payload = await res.json()
      if (!res.ok) {
        throw new Error(payload.detail || payload.error || 'OCR failed. Try again.')
      }
      const detected: Detected[] = payload.detected || []
      setMethod(payload.method ?? null)
      setRows(detected)
      setPhase('review')
      if (!detected.length) {
        setError('No submittals were detected in those drawings. Try a clearer scan or add them manually.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed. Try again.')
      setPhase('idle')
    }
  }

  function updateRow(index: number, patch: Partial<Detected>) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function createAll() {
    const items = rows.filter((r) => r.title.trim())
    if (!items.length) {
      setError('Nothing to create — every row needs a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/project-schedule/${encodeURIComponent(projectId)}/submittals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map((r) => ({
            submittalNo: r.sheetNumber,
            title: r.title,
            revision: r.revision,
            packageType: r.packageType,
            source: 'OCR auto-create',
          })),
        }),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload.error || 'Could not create the submittals.')
      const next = (payload.data.activeProjects as ActiveProject[]).find((p) => p.id === projectId)
      if (next) onCreated(next)
      close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the submittals.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0A52EF] px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90"
      >
        <ScanLine className="h-4 w-4" /> Upload drawings
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/40 p-4 backdrop-blur-sm">
          <div className="mt-12 w-full max-w-3xl rounded-md border border-[#E8E8E8] bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
              <div>
                <div className={labelClass}>Auto-create submittals</div>
                <h2 className="mt-1 text-base font-semibold text-zinc-950">Upload drawings</h2>
              </div>
              <button
                type="button"
                onClick={close}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[#E8E8E8] text-zinc-500 transition hover:bg-zinc-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-5">
              {error ? (
                <div className="mb-4 flex items-center gap-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                  {error}
                </div>
              ) : null}

              {phase === 'idle' ? (
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragActive(true)
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragActive(false)
                    handleFiles(e.dataTransfer.files)
                  }}
                  className={`flex flex-col items-center justify-center rounded-md border-2 border-dashed px-6 py-12 text-center transition ${
                    dragActive ? 'border-[#0A52EF] bg-[#0A52EF]/[0.04]' : 'border-[#E8E8E8] bg-zinc-50'
                  }`}
                >
                  <UploadCloud className="h-8 w-8 text-zinc-400" />
                  <p className="mt-3 text-sm font-semibold text-zinc-900">Drop drawing PDFs or images here</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    The platform reads each sheet&apos;s title block and proposes submittals to create.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[#E8E8E8] bg-white px-4 text-sm font-medium text-zinc-700 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
                  >
                    Choose files
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) handleFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </div>
              ) : null}

              {phase === 'uploading' ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-[#E8E8E8] bg-zinc-50 px-6 py-12 text-center">
                  <Loader2 className="h-7 w-7 animate-spin text-[#0A52EF]" />
                  <p className="mt-3 text-sm font-semibold text-zinc-900">Reading the title blocks…</p>
                  <p className="mt-1 text-xs text-zinc-500">Large drawing sets can take a moment per page.</p>
                </div>
              ) : null}

              {phase === 'review' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-zinc-600">
                      <span className="font-semibold tabular-nums text-[#0A52EF]">{rows.length}</span> detected ·
                      review and edit before creating
                    </p>
                    {method === 'fallback' ? (
                      <span className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-100">
                        Quick read — double-check
                      </span>
                    ) : null}
                  </div>

                  {rows.length ? (
                    <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                      {rows.map((row, i) => (
                        <div key={i} className="rounded-md border border-[#E8E8E8] bg-white p-3 shadow-sm">
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[110px_1fr_90px]">
                            <div>
                              <label className={labelClass}>Sheet no.</label>
                              <input
                                value={row.sheetNumber}
                                onChange={(e) => updateRow(i, { sheetNumber: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Title</label>
                              <input
                                value={row.title}
                                onChange={(e) => updateRow(i, { title: e.target.value })}
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Rev</label>
                              <input
                                value={row.revision}
                                onChange={(e) => updateRow(i, { revision: e.target.value })}
                                className={`${inputClass} tabular-nums`}
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex items-end gap-2">
                            <div className="flex-1">
                              <label className={labelClass}>Package</label>
                              <select
                                value={row.packageType}
                                onChange={(e) => updateRow(i, { packageType: e.target.value })}
                                className={inputClass}
                              >
                                {PACKAGE_OPTIONS.map((p) => (
                                  <option key={p} value={p}>
                                    {p}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeRow(i)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-500 transition hover:border-rose-300 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between gap-2 border-t border-[#E8E8E8] pt-4">
                    <button
                      type="button"
                      onClick={reset}
                      className="inline-flex h-9 items-center rounded-md border border-[#E8E8E8] px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
                    >
                      Upload more
                    </button>
                    <button
                      type="button"
                      onClick={createAll}
                      disabled={saving || !rows.some((r) => r.title.trim())}
                      className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Create {rows.filter((r) => r.title.trim()).length || ''} submittals
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
