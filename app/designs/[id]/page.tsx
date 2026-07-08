'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { DesignProofUpload } from '@/components/design-proof-upload'
import { CommentThread } from '@/components/comment-thread'

import { INTERNAL_CATEGORIES, labelForCategory } from '@/lib/design-internal-category'

interface DesignRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  company_name: string | null
  job_title: string
  tricode: string | null
  internal_category?: string | null
  priority?: string | null
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
// dropdown at the top. Proof uploads only file the work; the client email is
// fired when the request is explicitly moved to Client Review.
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

// Cancelled is a terminal status, not a pipeline stage — keep it out of the
// STAGES timeline but selectable in the status dropdown so a request can be
// cancelled. Cancelled requests drop out of the active dashboard views.
const STATUS_OPTIONS = [...STAGES.map((s) => ({ value: s.key, label: s.label })), { value: 'cancelled', label: 'Cancelled' }]

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
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    try {
      setCurrentUserId(localStorage.getItem('userId'))
      setIsAdmin(localStorage.getItem('userRole') === 'admin')
    } catch {}
  }, [])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [hoursSpentDraft, setHoursSpentDraft] = useState('')
  const [boardsDraft, setBoardsDraft] = useState('')
  const [sizesDraft, setSizesDraft] = useState('')
  const [finalFileDraft, setFinalFileDraft] = useState('')
  const [finalLinkDraft, setFinalLinkDraft] = useState('')
  const [proofLinkDraft, setProofLinkDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [drRes, staffRes] = await Promise.all([
        fetch(`/api/design-requests/${params.id}`),
        fetch('/api/staff?assignable=project'),
      ])
      if (!drRes.ok) { setLoading(false); return }
      const drData = await drRes.json()
      const staffData = await staffRes.json()
      const d = drData.design_request
      setDr(d)
      setStaffList(staffData.staff || [])
      setNotesDraft(d?.notes || '')
      setHoursSpentDraft(d?.hours_spent?.toString() || '')
      setBoardsDraft(d?.boards_requested || '')
      setSizesDraft(d?.sizes_requested || '')
      setFinalFileDraft(d?.final_file_name || '')
      setFinalLinkDraft(d?.ftp_final_link || '')
      setProofLinkDraft(d?.ftp_proof_link || '')
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

  const duplicate = async () => {
    if (duplicating) return
    setDuplicating(true)
    try {
      const res = await fetch(`/api/design-requests/${params.id}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not duplicate this request')
        return
      }
      const data = await res.json()
      const newId = data?.design_request?.id
      if (newId) router.push(`/designs/${newId}`)
    } catch (err) {
      console.error(err)
      alert('Could not duplicate this request')
    } finally {
      setDuplicating(false)
    }
  }

  const setInternalCategory = async (next: string | null) => {
    try {
      const res = await fetch(`/api/design-requests/${params.id}/internal-category`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: next }),
      })
      if (res.ok) await fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  const setPriority = async (next: 'high' | null) => {
    try {
      const res = await fetch(`/api/design-requests/${params.id}/priority`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority: next }),
      })
      if (res.ok) await fetchData()
    } catch (err) {
      console.error(err)
    }
  }

  const saveAsTemplate = async () => {
    const suggested = dr ? `${dr.company_name || dr.venue_name || dr.job_title} template` : ''
    const name = window.prompt('Save this request as a template — what should we call it?', suggested)
    if (!name || !name.trim()) return
    try {
      const res = await fetch(`/api/design-requests/${params.id}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not save template')
        return
      }
      if (window.confirm(`Template "${name.trim()}" saved. Open the templates library now?`)) {
        router.push('/designs/templates')
      }
    } catch (err) {
      console.error(err)
      alert('Could not save template')
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
        <div className="max-w-[1800px] mx-auto space-y-6 py-2">
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
                {dr.priority === 'high' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-rose-700 bg-rose-50 ring-1 ring-rose-200 px-1.5 py-0.5 rounded">
                    <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-rose-500 text-white text-[9px] font-bold">!</span>
                    High priority
                  </span>
                )}
                <span className="font-medium text-zinc-700">{dr.company_name || dr.venue_name || 'No client'}</span>
                {dr.tricode && <><span className="text-zinc-300">·</span><span className="text-xs font-mono bg-zinc-100 px-1.5 py-0.5 rounded">{dr.tricode}</span></>}
                {dr.due_date && <><span className="text-zinc-300">·</span><span>Due {formatDate(dr.due_date)}</span></>}
                {dr.internal_category && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 ring-1 ring-amber-200 px-1.5 py-0.5 rounded">
                      Internal · {labelForCategory(dr.internal_category)}
                    </span>
                  </>
                )}
              </div>
              <div className="mt-2 flex items-center gap-3 flex-wrap">
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mr-2">
                    Internal tag
                  </label>
                  <select
                    value={dr.internal_category || ''}
                    onChange={(e) => setInternalCategory(e.target.value || null)}
                    className="text-xs rounded ring-1 ring-zinc-200 px-2 py-1 bg-white outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    title="Tag this as non-billable internal work for hours tracking"
                  >
                    <option value="">Client work (default)</option>
                    {INTERNAL_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mr-2">
                    Priority
                  </label>
                  <button
                    type="button"
                    onClick={() => setPriority(dr.priority === 'high' ? null : 'high')}
                    className={
                      'text-xs rounded px-2 py-1 ring-1 transition-colors ' +
                      (dr.priority === 'high'
                        ? 'bg-rose-500 text-white ring-rose-500 hover:bg-rose-600'
                        : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50')
                    }
                    title="Mark high priority — bumps this request to the top of the designer's list"
                  >
                    {dr.priority === 'high' ? '! High priority' : 'Set high priority'}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveAsTemplate}
                className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                title="Save this request as a reusable template"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5" />
                </svg>
                <span>Save as Template</span>
              </button>
              <button
                type="button"
                onClick={duplicate}
                disabled={duplicating}
                className="inline-flex items-center gap-1.5 rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors disabled:opacity-60"
                title="Create a fresh Submitted request with the same brief"
              >
                {duplicating ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                )}
                <span>Duplicate</span>
              </button>
              <select
                value={dr.status}
                onChange={(e) => updateField({ status: e.target.value })}
                disabled={saving}
                data-ai-target="design-status"
                className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-[#0A52EF]/30 disabled:opacity-60"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
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

            {/* Final Files & Proof Links — always visible (Alexis 2026-06-11): enter/see these at any stage, not gated to the Approved stage */}
            <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-4 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600">Final Files &amp; Proof Links</div>
              <Field label="Final File Location">
                <input
                  type="text"
                  value={finalLinkDraft}
                  onChange={(e) => setFinalLinkDraft(e.target.value)}
                  onBlur={() => dr && finalLinkDraft !== (dr.ftp_final_link || '') && updateField({ ftp_final_link: finalLinkDraft })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  placeholder="FTP path / folder for final files"
                />
              </Field>
              <Field label="Proof Link">
                <input
                  type="text"
                  value={proofLinkDraft}
                  onChange={(e) => setProofLinkDraft(e.target.value)}
                  onBlur={() => dr && proofLinkDraft !== (dr.ftp_proof_link || '') && updateField({ ftp_proof_link: proofLinkDraft })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  placeholder="https://… proof or review link"
                />
              </Field>
            </div>

            {/* STAGE 1: SUBMITTED — always visible (summary of core fields) */}
            <StageCard n={1} label="Submitted" desc={STAGES[0].desc} state={currentIdx >= 0 ? (currentIdx === 0 ? 'active' : 'done') : 'upcoming'}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Boards requested">
                  <textarea
                    data-ai-target="boards-requested"
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
                    data-ai-target="sizes-requested"
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
                  data-ai-target="notes-brief"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={() => notesDraft !== (dr.notes || '') && updateField({ notes: notesDraft })}
                  rows={4}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                  placeholder="What the client wants + any specific callouts"
                />
              </Field>
            </StageCard>

            {/* STAGE 2: IN QUEUE — multi-assign designers + enterprise reps */}
            <StageCard n={2} label="In Queue" desc={STAGES[1].desc} state={currentIdx < 1 ? 'upcoming' : currentIdx === 1 ? 'active' : 'done'}>
              <AssigneePicker designRequestId={dr.id} staffList={staffList} />
            </StageCard>
            {currentIdx === 1 && (
              <button
                onClick={() => updateField({ status: 'in_progress' })}
                className="mt-3 text-xs font-medium text-[#0A52EF] hover:underline block"
              >
                → Team assigned? Advance to In Progress
              </button>
            )}

            {/* STAGE 3: IN PROGRESS — hours (logged via entries) + notes */}
            <StageCard n={3} label="In Progress" desc={STAGES[2].desc} state={currentIdx < 2 ? 'upcoming' : currentIdx === 2 ? 'active' : 'done'}>
              <Field label="Hours Logged">
                <div className="text-sm text-zinc-600">{dr.hours_spent ?? 0}h logged</div>
              </Field>
              <HoursLog designRequestId={dr.id} staffList={staffList} />
            </StageCard>

            {/* STAGE 4: IN QC */}
            <StageCard n={4} label="In QC" desc={STAGES[3].desc} state={currentIdx < 3 ? 'upcoming' : currentIdx === 3 ? 'active' : 'done'}>
              <p className="text-sm text-zinc-500">
                Internal quality check. When passed, upload the proof below, then explicitly advance this request to Client Review to fire the approval email.
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
                <Field label="Upload Proof">
                  <DesignProofUpload designRequestId={dr.id} />
                </Field>
                <AIFirstDraftButton designRequestId={dr.id} />
                <p className="text-xs text-zinc-500">
                  The client email fires only when you explicitly advance the status to Client Review — QC first, send second.
                </p>
              </div>
            </StageCard>

            {/* STAGE 6: APPROVED — final file */}
            <StageCard n={6} label="Approved" desc={STAGES[5].desc} state={currentIdx < 5 ? 'upcoming' : currentIdx === 5 ? 'active' : 'done'}>
              <Field label="Final File Name">
                <input
                  type="text"
                  data-ai-target="final-file-name"
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

            {/* Comment thread (Alexis 5/6 — distinct from notes, newest at
                top, @-mentions). Lives in the aside so designers can talk
                about the request while keeping the stage flow on the left. */}
            <CommentThread
              baseUrl={`/api/design-requests/${dr.id}/comments`}
              staff={staffList}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
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

// ─────────────────────────────────────────────────────────────────────────────
// Multi-assignee picker — Alexis (2026-04-23): "multiple Enterprise Solutions
// reps + multiple designers per request." Pills UI, click to add, × to remove.
// Writes the whole set via POST /api/design-requests/[id]/assignees which
// replaces the join-table rows atomically.
// ─────────────────────────────────────────────────────────────────────────────
interface Assignee { id: string; full_name: string; email?: string; is_primary?: boolean }

function AssigneePicker({ designRequestId, staffList }: { designRequestId: string; staffList: Staff[] }) {
  const [designers, setDesigners] = useState<Assignee[]>([])
  const [reps, setReps] = useState<Assignee[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    try {
      const res = await fetch(`/api/design-requests/${designRequestId}/assignees`)
      if (!res.ok) { setLoading(false); return }
      const d = await res.json()
      setDesigners(d.designers || [])
      setReps(d.enterprise_contacts || [])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [designRequestId])

  const save = async (next: { designer_ids?: string[]; enterprise_contact_ids?: string[]; primary_designer_id?: string }) => {
    setSaving(true)
    try {
      await fetch(`/api/design-requests/${designRequestId}/assignees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      await load()
    } finally {
      setSaving(false)
    }
  }

  const designerIds = designers.map(d => d.id)
  const repIds = reps.map(r => r.id)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
          Designers {designers.length > 0 && <span className="text-zinc-400 font-normal">· {designers.length}</span>}
        </label>
        <div className="rounded-lg ring-1 ring-zinc-200 bg-white p-2 min-h-[40px] flex flex-wrap gap-1.5">
          {designers.map(d => (
            <span key={d.id} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${d.is_primary ? 'bg-[#0A52EF] text-white' : 'bg-zinc-100 text-zinc-700'}`}>
              {d.is_primary && <span title="Primary designer">★</span>}
              {d.full_name}
              <button
                onClick={() => save({ designer_ids: designerIds.filter(x => x !== d.id) })}
                className="opacity-60 hover:opacity-100"
                title="Remove"
              >×</button>
            </span>
          ))}
          {!loading && designers.length === 0 && (
            <span className="text-xs text-zinc-400 px-1 py-1">No designers yet</span>
          )}
        </div>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value
            if (id && !designerIds.includes(id)) save({ designer_ids: [...designerIds, id] })
          }}
          disabled={saving}
          data-ai-target="add-designer"
          className="mt-2 w-full rounded-lg ring-1 ring-zinc-200 px-3 py-1.5 text-xs text-zinc-600 bg-white outline-none"
        >
          <option value="">＋ Add designer…</option>
          {staffList.filter(s => !designerIds.includes(s.id)).map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
          Enterprise Solutions {reps.length > 0 && <span className="text-zinc-400 font-normal">· {reps.length}</span>}
        </label>
        <div className="rounded-lg ring-1 ring-zinc-200 bg-white p-2 min-h-[40px] flex flex-wrap gap-1.5">
          {reps.map(r => (
            <span key={r.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-violet-100 text-violet-800">
              {r.full_name}
              <button
                onClick={() => save({ enterprise_contact_ids: repIds.filter(x => x !== r.id) })}
                className="opacity-60 hover:opacity-100"
                title="Remove"
              >×</button>
            </span>
          ))}
          {!loading && reps.length === 0 && (
            <span className="text-xs text-zinc-400 px-1 py-1">No reps yet</span>
          )}
        </div>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value
            if (id && !repIds.includes(id)) save({ enterprise_contact_ids: [...repIds, id] })
          }}
          disabled={saving}
          data-ai-target="add-enterprise-rep"
          className="mt-2 w-full rounded-lg ring-1 ring-zinc-200 px-3 py-1.5 text-xs text-zinc-600 bg-white outline-none"
        >
          <option value="">＋ Add enterprise rep…</option>
          {staffList.filter(s => !repIds.includes(s.id)).map(s => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// HoursLog — per-job time entries (Alexis 2026-04-23: "designer logs hours
// instead of an estimate for the full job"). Writes to designer_time_entries
// via /api/design-requests/[id]/hours — the table already has a
// design_request_id column, this just exposes the read/write to the UI.
// Keeps design_requests.hours_spent synced on every mutation for the kanban
// progress bar.
// ─────────────────────────────────────────────────────────────────────────────
interface HourEntry {
  id: string
  hours: number
  description: string | null
  entry_date: string
  designer_name: string | null
  designer_id: string | null
  created_at: string
}

function HoursLog({ designRequestId, staffList }: { designRequestId: string; staffList: Staff[] }) {
  const [entries, setEntries] = useState<HourEntry[]>([])
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [formHours, setFormHours] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [formDesignerId, setFormDesignerId] = useState('')

  const load = async () => {
    const r = await fetch(`/api/design-requests/${designRequestId}/hours`)
    if (!r.ok) return
    const d = await r.json()
    setEntries(d.entries || [])
    setTotal(d.total_hours || 0)
  }
  useEffect(() => { load() }, [designRequestId])

  const add = async () => {
    const h = Number(formHours)
    if (!Number.isFinite(h) || h <= 0) return
    setBusy(true)
    try {
      await fetch(`/api/design-requests/${designRequestId}/hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours: h,
          description: formDesc || null,
          entry_date: formDate || null,
          designer_id: formDesignerId || null,
        }),
      })
      setFormHours(''); setFormDesc('')
      await load()
      window.dispatchEvent(new Event('anc:data-refresh'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (entryId: string) => {
    if (!confirm('Remove this time entry?')) return
    setBusy(true)
    try {
      await fetch(`/api/design-requests/${designRequestId}/hours?entry_id=${entryId}`, { method: 'DELETE' })
      await load()
      window.dispatchEvent(new Event('anc:data-refresh'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-4 rounded-lg ring-1 ring-zinc-200 bg-white">
      <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-zinc-900">Time Log</div>
          <div className="text-xs text-zinc-500">{total.toFixed(2)}h logged across {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</div>
        </div>
      </div>
      {/* Quick add row */}
      <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-[100px,100px,1fr,140px,80px] gap-2 border-b border-zinc-100">
        <input type="number" step="0.25" data-ai-target="time-log-hours" value={formHours} onChange={e => setFormHours(e.target.value)}
          placeholder="Hours" className="rounded-md ring-1 ring-zinc-200 px-2.5 py-1.5 text-sm bg-white outline-none" />
        <input type="date" data-ai-target="time-log-date" value={formDate} onChange={e => setFormDate(e.target.value)}
          className="rounded-md ring-1 ring-zinc-200 px-2.5 py-1.5 text-sm bg-white outline-none" />
        <input type="text" data-ai-target="time-log-description" value={formDesc} onChange={e => setFormDesc(e.target.value)}
          placeholder="What did you work on?" className="rounded-md ring-1 ring-zinc-200 px-2.5 py-1.5 text-sm bg-white outline-none" />
        <select data-ai-target="time-log-designer" value={formDesignerId} onChange={e => setFormDesignerId(e.target.value)}
          className="rounded-md ring-1 ring-zinc-200 px-2.5 py-1.5 text-xs bg-white outline-none">
          <option value="">Me</option>
          {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
        <button onClick={add} disabled={busy || !formHours}
          className="px-3 py-1.5 rounded-md bg-[#0A52EF] text-white text-xs font-semibold disabled:opacity-60">
          {busy ? '…' : 'Log'}
        </button>
      </div>
      {/* Entries list */}
      {entries.length === 0 ? (
        <div className="p-5 text-xs text-zinc-400 text-center">No time logged yet.</div>
      ) : (
        <div className="divide-y divide-zinc-100 max-h-64 overflow-y-auto">
          {entries.map(e => (
            <div key={e.id} className="px-4 py-2.5 flex items-center gap-3 text-sm hover:bg-zinc-50">
              <span className="w-16 font-mono text-xs text-zinc-500">{e.entry_date?.slice(5)}</span>
              <span className="w-16 font-semibold tabular-nums text-zinc-900">{Number(e.hours).toFixed(2)}h</span>
              <span className="flex-1 truncate text-zinc-700">{e.description || <span className="text-zinc-400 italic">no description</span>}</span>
              <span className="text-xs text-zinc-400">{e.designer_name || 'unknown'}</span>
              <button onClick={() => remove(e.id)} className="text-zinc-300 hover:text-red-500 text-xs" title="Remove">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// AI First Draft — Alexis's ask (2026-04-23): let the system take a first
// pass at the design so designers refine instead of starting from blank.
// Hits the /generate-ai-proof endpoint which builds a venue-aware prompt from
// the request context, calls image generation, and files the output as a proof
// attachment flagged is_ai_generated=true. UX: one button, ~20-40s wait,
// preview card when ready.
// ─────────────────────────────────────────────────────────────────────────────
function parseApiError(res: Response, text: string, data: any): string {
  if (data?.error) return data.error
  if (res.status === 401) return 'Your session expired. Refresh, sign in, and try again.'
  if (res.status === 403) return 'You do not have permission to generate AI drafts.'

  const contentType = res.headers.get('content-type') || ''
  const looksLikeHtml =
    contentType.includes('text/html') ||
    /^\s*<!doctype html/i.test(text) ||
    /^\s*<html[\s>]/i.test(text)

  if (looksLikeHtml) {
    return 'The AI draft request returned an app page instead of an API error. Refresh and try again; if it continues, check the server logs.'
  }

  return text.trim().slice(0, 200) || `Failed (${res.status})`
}

function getServicesApiUrl(path: string) {
  // Keep browser calls on the current ANC Services origin. Absolute public app
  // URLs can drift between EasyPanel hosts and make API requests return the app
  // shell HTML instead of JSON.
  return path
}

function AIFirstDraftButton({ designRequestId }: { designRequestId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<{ filename: string; download_url: string } | null>(null)

  const run = async () => {
    setBusy(true); setError(null); setGenerated(null)
    try {
      const res = await fetch(getServicesApiUrl(`/api/design-requests/${designRequestId}/generate-ai-proof`), {
        method: 'POST',
        headers: { Accept: 'application/json' },
        credentials: 'include',
      })
      // The server may respond with an HTML error page (Next.js 500) when
      // something blows up. Catch the JSON-parse failure so the UI can show
      // a clean message instead of leaking markup.
      const text = await res.text()
      let data: any = null
      try { data = text ? JSON.parse(text) : null } catch {}
      if (!res.ok) {
        setError(parseApiError(res, text, data))
      } else if (data?.proof) {
        setGenerated(data.proof)
        window.dispatchEvent(new Event('anc:data-refresh'))
      } else {
        setError(parseApiError(res, text, data))
      }
    } catch (err: any) {
      setError(err?.message || 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-lg ring-1 ring-[#0A52EF]/30 bg-gradient-to-b from-[#0A52EF]/[0.04] to-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="h-9 w-9 rounded-lg bg-[#0A52EF] flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-900">AI First Draft</div>
          <p className="text-xs text-zinc-600 mt-0.5">
            Generate a venue-ready starting point from the brief. Designer refines + approves. ~30 seconds.
          </p>
          {error && (
            <div className="mt-2 rounded bg-red-50 ring-1 ring-red-200 px-2.5 py-1.5 text-xs text-red-700">{error}</div>
          )}
          {generated && (
            <div className="mt-3 rounded-lg ring-1 ring-emerald-200 bg-white overflow-hidden">
              <div className="bg-emerald-50 px-3 py-2 flex items-center gap-2 text-xs">
                <span className="font-semibold text-emerald-800">✨ Draft ready</span>
                <span className="text-emerald-600 font-mono">{generated.filename}</span>
                <a href={generated.download_url} target="_blank" rel="noreferrer" className="ml-auto text-[#0A52EF] hover:underline">Open full-size →</a>
              </div>
              {/* Inline preview — show the actual generated image so the designer
                  can eyeball it before opening the file. AI draft files come
                  back as PNG from gpt-image-1.5. */}
              <img
                src={generated.download_url}
                alt="AI-generated first draft"
                className="w-full max-h-96 object-contain bg-zinc-50"
              />
              <div className="px-3 py-2 text-[11px] text-zinc-500 border-t border-zinc-100">
                Also filed under this design's uploaded proofs — refresh to see it listed alongside uploads.
              </div>
            </div>
          )}
        </div>
        <button
          onClick={run}
          disabled={busy}
          className="flex-shrink-0 px-3 py-2 rounded-lg bg-[#0A52EF] hover:bg-[#0840C0] text-white text-xs font-semibold transition-colors disabled:opacity-60 disabled:cursor-wait whitespace-nowrap"
        >
          {busy ? 'Generating…' : 'Generate draft'}
        </button>
      </div>
    </div>
  )
}
