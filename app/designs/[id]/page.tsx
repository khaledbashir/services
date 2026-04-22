'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { DesignProofUpload } from '@/components/design-proof-upload'

interface DesignRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  company_name: string | null
  job_title: string
  tricode: string | null
  ftp_proof_link: string | null
  ftp_final_link: string | null
  final_file_name: string | null
  final_duration: string | null
  notes: string | null
  boards_requested: string | null
  sizes_requested: string | null
  designer_id: string | null
  designer_name: string | null
  enterprise_contact_id: string | null
  enterprise_contact_name: string | null
  status: string
  hours_estimated: number | null
  hours_spent: number | null
  due_date: string | null
  created_at: string
  updated_at: string
  proof_sent_at?: string | null
  proof_view_count?: number | null
  proof_last_viewed_at?: string | null
}

interface Staff { id: string; full_name: string }

// Pipeline order drives the stage timeline: earlier index = earlier stage.
// Each stage can advance with a single "move forward" button OR via the status
// dropdown at the top. Upload at the Client Review stage auto-advances + fires
// the client email via the cascade in app/api/design-requests/[id]/proofs.
const STAGES = [
  { key: 'request_submitted', label: 'Submitted',     desc: 'New request intake' },
  { key: 'in_queue',          label: 'In Queue',      desc: 'Awaiting designer' },
  { key: 'in_progress',       label: 'In Progress',   desc: 'Designer actively working' },
  { key: 'in_qc',             label: 'In QC',         desc: 'Internal review' },
  { key: 'client_review',     label: 'Client Review', desc: 'Proof out to client' },
  { key: 'approved',          label: 'Approved',      desc: 'Client signed off' },
  { key: 'done',              label: 'Done',          desc: 'Delivered + closed' },
] as const

type StageKey = typeof STAGES[number]['key']

const STATUS_OPTIONS = STAGES.map((s) => ({ value: s.key, label: s.label }))

function formatDate(s: string | null | undefined): string {
  if (!s) return '—'
  try { return new Date(s).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) }
  catch { return s }
}

function formatRelative(s: string | null | undefined): string {
  if (!s) return 'never'
  try {
    const d = Date.now() - new Date(s).getTime()
    const mins = Math.round(d / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.round(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.round(hrs / 24)}d ago`
  } catch { return s }
}

export default function DesignRequestDetailPage({ params }: { params: { id: string } }) {
  const [dr, setDr] = useState<DesignRequestDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [hoursEstimatedDraft, setHoursEstimatedDraft] = useState('')
  const [hoursSpentDraft, setHoursSpentDraft] = useState('')
  const [boardsDraft, setBoardsDraft] = useState('')
  const [sizesDraft, setSizesDraft] = useState('')
  const [finalFileDraft, setFinalFileDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [drRes, staffRes] = await Promise.all([
        fetch(`/api/design-requests/${params.id}`),
        fetch('/api/staff'),
      ])
      if (!drRes.ok) { setLoading(false); return }
      const drData = await drRes.json()
      const staffData = await staffRes.json()
      const d = drData.design_request
      setDr(d)
      setStaffList(staffData.staff || [])
      setNotesDraft(d?.notes || '')
      setHoursEstimatedDraft(d?.hours_estimated?.toString() || '')
      setHoursSpentDraft(d?.hours_spent?.toString() || '')
      setBoardsDraft(d?.boards_requested || '')
      setSizesDraft(d?.sizes_requested || '')
      setFinalFileDraft(d?.final_file_name || '')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [params.id])

  const updateField = async (payload: Record<string, any>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/design-requests/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const currentIdx = useMemo(() => {
    if (!dr) return 0
    const i = STAGES.findIndex((s) => s.key === dr.status)
    return i === -1 ? 0 : i
  }, [dr])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto space-y-6 py-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </DashboardLayout>
    )
  }

  if (!dr) {
    return (
      <DashboardLayout>
        <div className="max-w-5xl mx-auto py-20 text-center text-sm text-zinc-400">
          Design request not found
        </div>
      </DashboardLayout>
    )
  }

  const progressPct =
    dr.hours_estimated && Number(dr.hours_estimated) > 0
      ? Math.min(100, Math.round((Number(dr.hours_spent || 0) / Number(dr.hours_estimated)) * 100))
      : 0
  const progressTone = progressPct >= 75 ? 'bg-red-500' : progressPct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 py-2">
        {/* Header */}
        <div className="space-y-3">
          <button
            onClick={() => router.push('/designs')}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Design Requests
          </button>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-zinc-900 truncate">{dr.job_title}</h1>
              <div className="flex items-center gap-2 mt-1 text-sm text-zinc-500 flex-wrap">
                <span className="font-medium text-zinc-700">{dr.company_name || dr.venue_name || 'No client'}</span>
                {dr.tricode && <><span className="text-zinc-300">·</span><span className="text-xs font-mono bg-zinc-100 px-1.5 py-0.5 rounded">{dr.tricode}</span></>}
                {dr.due_date && <><span className="text-zinc-300">·</span><span>Due {formatDate(dr.due_date)}</span></>}
              </div>
            </div>
            <select
              value={dr.status}
              onChange={(e) => updateField({ status: e.target.value })}
              disabled={saving}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#0A52EF]/30 disabled:opacity-60"
            >
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Timeline strip */}
        <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-4 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {STAGES.map((s, i) => {
              const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'upcoming'
              return (
                <div key={s.key} className="flex items-center gap-1">
                  <button
                    onClick={() => updateField({ status: s.key })}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      state === 'active'
                        ? 'bg-[#0A52EF] text-white'
                        : state === 'done'
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          : 'bg-zinc-50 text-zinc-400 hover:bg-zinc-100'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                      state === 'active' ? 'bg-white/20' : state === 'done' ? 'bg-emerald-500 text-white' : 'bg-zinc-300 text-white'
                    }`}>
                      {state === 'done' ? '✓' : i + 1}
                    </span>
                    {s.label}
                  </button>
                  {i < STAGES.length - 1 && <span className="text-zinc-300">→</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] gap-6">
          {/* Main: active stage card + submitted summary */}
          <div className="space-y-5">

            {/* STAGE 1: SUBMITTED — always visible (summary of core fields) */}
            <StageCard n={1} label="Submitted" desc={STAGES[0].desc} state={currentIdx >= 0 ? (currentIdx === 0 ? 'active' : 'done') : 'upcoming'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Boards requested">
                  <textarea
                    value={boardsDraft}
                    onChange={(e) => setBoardsDraft(e.target.value)}
                    onBlur={() => boardsDraft !== (dr.boards_requested || '') && updateField({ boards_requested: boardsDraft })}
                    rows={2}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                    placeholder="e.g. 2× main scoreboards, 1× ribbon"
                  />
                </Field>
                <Field label="Sizes">
                  <textarea
                    value={sizesDraft}
                    onChange={(e) => setSizesDraft(e.target.value)}
                    onBlur={() => sizesDraft !== (dr.sizes_requested || '') && updateField({ sizes_requested: sizesDraft })}
                    rows={2}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                    placeholder="e.g. 1920x1080, 960x540"
                  />
                </Field>
              </div>
              <Field label="Notes / Brief">
                <textarea
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => notesDraft !== (dr.notes || '') && updateField({ notes: notesDraft })}
                  rows={4}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                  placeholder="What the client wants + any specific callouts"
                />
              </Field>
            </StageCard>

            {/* STAGE 2: IN QUEUE — assigning designer */}
            <StageCard n={2} label="In Queue" desc={STAGES[1].desc} state={currentIdx < 1 ? 'upcoming' : currentIdx === 1 ? 'active' : 'done'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Assigned Designer">
                  <select
                    value={dr.designer_id || ''}
                    onChange={(e) => updateField({ designer_id: e.target.value || null })}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                  </select>
                </Field>
                <Field label="Hours Estimated">
                  <input
                    type="number"
                    step="0.25"
                    value={hoursEstimatedDraft}
                    onChange={(e) => setHoursEstimatedDraft(e.target.value)}
                    onBlur={() => hoursEstimatedDraft !== String(dr.hours_estimated || '') && updateField({ hours_estimated: hoursEstimatedDraft === '' ? null : Number(hoursEstimatedDraft) })}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                    placeholder="e.g. 4"
                  />
                </Field>
              </div>
              {currentIdx === 1 && dr.designer_id && (
                <button
                  onClick={() => updateField({ status: 'in_progress' })}
                  className="mt-3 text-xs font-medium text-[#0A52EF] hover:underline"
                >
                  → Designer ready? Advance to In Progress
                </button>
              )}
            </StageCard>

            {/* STAGE 3: IN PROGRESS — hours + notes */}
            <StageCard n={3} label="In Progress" desc={STAGES[2].desc} state={currentIdx < 2 ? 'upcoming' : currentIdx === 2 ? 'active' : 'done'}>
              <div className="grid grid-cols-1 md:grid-cols-[2fr,1fr] gap-4">
                <Field label="Hours Progress">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-600">{dr.hours_spent ?? 0}h / {dr.hours_estimated ?? '—'}h</span>
                      <span className={`text-xs ${progressPct >= 75 ? 'text-red-600 font-medium' : 'text-zinc-500'}`}>
                        {progressPct}% used {progressPct >= 75 && '· over 75%'}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                      <div className={`h-full ${progressTone} transition-all`} style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                </Field>
                <Field label="Hours Spent">
                  <input
                    type="number"
                    step="0.25"
                    value={hoursSpentDraft}
                    onChange={(e) => setHoursSpentDraft(e.target.value)}
                    onBlur={() => hoursSpentDraft !== String(dr.hours_spent || '') && updateField({ hours_spent: hoursSpentDraft === '' ? null : Number(hoursSpentDraft) })}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </Field>
              </div>
            </StageCard>

            {/* STAGE 4: IN QC */}
            <StageCard n={4} label="In QC" desc={STAGES[3].desc} state={currentIdx < 3 ? 'upcoming' : currentIdx === 3 ? 'active' : 'done'}>
              <p className="text-sm text-zinc-500">
                Internal quality check. When passed, upload the proof below to auto-advance this request to Client Review and fire the approval email.
              </p>
            </StageCard>

            {/* STAGE 5: CLIENT REVIEW — THE MONEY STAGE */}
            <StageCard n={5} label="Client Review" desc={STAGES[4].desc} state={currentIdx < 4 ? 'upcoming' : currentIdx === 4 ? 'active' : 'done'} highlight={currentIdx === 4}>
              <div className="space-y-4">
                {dr.ftp_proof_link && (
                  <div className="rounded-lg bg-blue-50 ring-1 ring-blue-200 p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wider text-blue-700 mb-1">Live client link</div>
                    <a href={dr.ftp_proof_link} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all font-mono text-xs">{dr.ftp_proof_link}</a>
                    {(dr.proof_view_count ?? 0) > 0 && (
                      <div className="mt-2 text-xs text-blue-600/80">
                        Viewed {dr.proof_view_count} {dr.proof_view_count === 1 ? 'time' : 'times'} · last opened {formatRelative(dr.proof_last_viewed_at)}
                      </div>
                    )}
                    {dr.proof_sent_at && (
                      <div className="mt-1 text-xs text-blue-600/80">Email sent {formatRelative(dr.proof_sent_at)}</div>
                    )}
                  </div>
                )}
                <Field label="Upload Proof (auto-fires client email)">
                  <DesignProofUpload designRequestId={dr.id} />
                </Field>
                <p className="text-xs text-zinc-500">
                  Uploading a proof from any pre-review stage auto-advances this request to Client Review, creates a public share link, and emails the client.
                </p>
              </div>
            </StageCard>

            {/* STAGE 6: APPROVED — final file */}
            <StageCard n={6} label="Approved" desc={STAGES[5].desc} state={currentIdx < 5 ? 'upcoming' : currentIdx === 5 ? 'active' : 'done'}>
              <Field label="Final File Name">
                <input
                  type="text"
                  value={finalFileDraft}
                  onChange={(e) => setFinalFileDraft(e.target.value)}
                  onBlur={() => finalFileDraft !== (dr.final_file_name || '') && updateField({ final_file_name: finalFileDraft })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  placeholder="e.g. louisville-playoff-v3.psd"
                />
              </Field>
              {currentIdx === 5 && dr.final_file_name && (
                <button
                  onClick={() => updateField({ status: 'done' })}
                  className="mt-3 text-xs font-medium text-[#0A52EF] hover:underline"
                >
                  → Final delivered? Mark as Done
                </button>
              )}
            </StageCard>

            {/* STAGE 7: DONE */}
            <StageCard n={7} label="Done" desc={STAGES[6].desc} state={currentIdx < 6 ? 'upcoming' : 'done'}>
              <p className="text-sm text-zinc-500">
                Request closed. All fields are still visible above for reference.
              </p>
            </StageCard>

          </div>

          {/* Sidebar: quick facts */}
          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="rounded-xl bg-zinc-50 ring-1 ring-zinc-200 p-4 space-y-3 text-sm">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">Client</div>
                <div className="text-zinc-900">{dr.company_name || '—'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">Designer</div>
                <div className="text-zinc-900">{dr.designer_name || 'Unassigned'}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">Due</div>
                <div className="text-zinc-900">{formatDate(dr.due_date)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">Created</div>
                <div className="text-zinc-900">{formatDate(dr.created_at)}</div>
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-1">Last Updated</div>
                <div className="text-zinc-900">{formatRelative(dr.updated_at)}</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage card — expands when active, collapses to one-liner with green check
// when done. Upcoming stages appear greyed out but still readable.
// ─────────────────────────────────────────────────────────────────────────────
function StageCard({
  n, label, desc, state, highlight = false, children,
}: {
  n: number
  label: string
  desc: string
  state: 'upcoming' | 'active' | 'done'
  highlight?: boolean
  children: React.ReactNode
}) {
  const border =
    state === 'active' ? (highlight ? 'ring-2 ring-[#0A52EF]/40 bg-gradient-to-b from-blue-50/40 to-white' : 'ring-1 ring-zinc-200 bg-white')
    : state === 'done' ? 'ring-1 ring-zinc-200 bg-white'
    : 'ring-1 ring-zinc-100 bg-zinc-50/60'

  const number =
    state === 'done'
      ? <span className="w-7 h-7 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-semibold">✓</span>
      : state === 'active'
        ? <span className="w-7 h-7 rounded-full bg-[#0A52EF] text-white text-sm flex items-center justify-center font-semibold">{n}</span>
        : <span className="w-7 h-7 rounded-full bg-zinc-200 text-zinc-500 text-sm flex items-center justify-center font-semibold">{n}</span>

  return (
    <section className={`rounded-xl p-5 ${border} ${state === 'upcoming' ? 'opacity-60' : ''}`}>
      <header className="flex items-center gap-3 mb-4">
        {number}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-zinc-900">{label}</h3>
          <p className="text-xs text-zinc-500">{desc}</p>
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
