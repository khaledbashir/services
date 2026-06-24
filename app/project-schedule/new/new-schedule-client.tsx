'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Loader2, Monitor, Plus, Sparkles, X } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ProjectOption {
  id: string
  name: string
  pm: string
  installOnsite: string
}

// Mirror of lib/project-schedule.ts slugify() so a typed project name resolves
// to the same id the live list uses.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const inputClass =
  'h-10 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/20'

const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

export function NewScheduleClient({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<'existing' | 'named'>(projects.length ? 'existing' : 'named')
  const [existingId, setExistingId] = useState(projects[0]?.id ?? '')
  const [projectName, setProjectName] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [displays, setDisplays] = useState<string[]>(['Main Display'])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedExisting = useMemo(
    () => projects.find((project) => project.id === existingId) ?? null,
    [projects, existingId],
  )

  const resolvedName = mode === 'existing' ? selectedExisting?.name ?? '' : projectName.trim()
  const resolvedId = mode === 'existing' ? existingId : slugify(projectName)

  const cleanDisplays = displays.map((d) => d.trim()).filter(Boolean)
  const canSubmit = Boolean(resolvedId) && Boolean(startDate) && cleanDisplays.length > 0 && !submitting

  function updateDisplay(index: number, value: string) {
    setDisplays((prev) => prev.map((item, i) => (i === index ? value : item)))
  }
  function addDisplay() {
    setDisplays((prev) => [...prev, ''])
  }
  function removeDisplay(index: number) {
    setDisplays((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  async function handleGenerate() {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/project-schedule/${encodeURIComponent(resolvedId)}/tasks/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: resolvedName,
          startDate,
          displays: cleanDisplays,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Could not generate the schedule.')
      router.push(`/project-schedule/${encodeURIComponent(resolvedId)}?tab=schedule`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the schedule.')
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link
            href="/project-schedule"
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition hover:text-[#0A52EF]"
          >
            <ArrowLeft className="h-4 w-4" />
            Project Deployment Workspace
          </Link>
          <div className="mt-4 inline-flex items-center gap-2 rounded bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            New Schedule
          </div>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Build a project schedule</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-zinc-500">
            Generates the ANC LED-install timeline — engineering, submittals, manufacturing, shipping, and a
            full install block per display — dated from your start date.
          </p>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-md border-l-2 border-rose-400 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="space-y-5 rounded-md border border-[#E8E8E8] bg-zinc-50 p-5">
          {/* Target project */}
          <div className="space-y-2">
            <span className={labelClass}>Project</span>
            <div className="inline-flex w-full rounded-md border border-[#E8E8E8] bg-white p-1">
              <button
                type="button"
                onClick={() => setMode('existing')}
                disabled={!projects.length}
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition disabled:opacity-40 ${mode === 'existing' ? 'bg-[#0A52EF] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                Existing project
              </button>
              <button
                type="button"
                onClick={() => setMode('named')}
                className={`flex-1 rounded px-3 py-1.5 text-xs font-medium transition ${mode === 'named' ? 'bg-[#0A52EF] text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                New name
              </button>
            </div>

            {mode === 'existing' ? (
              <select value={existingId} onChange={(e) => setExistingId(e.target.value)} className={inputClass}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.pm ? ` — ${project.pm}` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. TD Garden — Center-Hung Replacement"
                  className={inputClass}
                />
                {projectName.trim() ? (
                  <p className="text-xs text-zinc-400 tabular-nums">Workspace id: {slugify(projectName) || '—'}</p>
                ) : null}
              </>
            )}
          </div>

          {/* Start date */}
          <div className="space-y-2">
            <span className={labelClass}>Start date</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${inputClass} pl-9 tabular-nums`}
              />
            </div>
            <p className="text-xs text-zinc-500">Notice to Proceed anchors here; every phase is dated forward from it.</p>
          </div>

          {/* Displays */}
          <div className="space-y-2">
            <span className={labelClass}>Displays</span>
            <p className="text-xs text-zinc-500">
              Each display gets its own install block — barricade, demo, steel, infrastructure, LED, commissioning,
              finishes, and punch.
            </p>
            <div className="space-y-2">
              {displays.map((display, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Monitor className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
                    <input
                      value={display}
                      onChange={(e) => updateDisplay(index, e.target.value)}
                      placeholder={`Display ${index + 1}`}
                      className={`${inputClass} pl-9`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeDisplay(index)}
                    disabled={displays.length <= 1}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E8E8E8] bg-white text-zinc-400 transition hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Remove display"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addDisplay}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[#E8E8E8] bg-white px-3 text-xs font-semibold text-zinc-600 transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
            >
              <Plus className="h-3.5 w-3.5" /> Add display
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {mode === 'existing'
              ? 'Generating replaces any existing tasks for this project.'
              : 'A new workspace will be created under this name.'}
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0A52EF] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0A52EF]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {submitting ? 'Generating' : 'Generate schedule'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
