'use client'

// Request Hub — request detail / decision brief. Dual-mode like
// components/design-detail.tsx: `embedded` renders inside the slide-in panel
// on /request-hub; without it the [id] page wraps it in DashboardLayout.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useToast } from '@/components/toast'

type Rubric = { key: string; label: string; description: string }

interface Meta {
  types: { key: string; label: string }[]
  statuses: { key: string; label: string; accent: string; phase: string }[]
  rubric: { feasibility: Rubric[]; effort: Rubric[]; businessValue: Rubric[]; confidence: Rubric[] }
  staff: { id: string; full_name: string; role: string }[]
  permissions: {
    isAssessor: boolean
    isApprover: boolean
    isBuilder: boolean
    isAdmin: boolean
  }
}

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-sky-50 text-sky-700',
  needs_clarification: 'bg-violet-50 text-violet-700',
  feasibility: 'bg-cyan-50 text-cyan-700',
  leadership_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked: 'bg-red-50 text-red-700',
  completed: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-zinc-100 text-zinc-600',
  declined: 'bg-zinc-100 text-zinc-500',
  draft: 'bg-zinc-50 text-zinc-500',
}

function StatusPill({ status, statuses }: { status: string; statuses: Meta['statuses'] }) {
  const label = statuses.find((s) => s.key === status)?.label || status
  return (
    <span className={`text-xs font-medium px-1.5 py-0.5 ${STATUS_TONE[status] || 'bg-zinc-100 text-zinc-600'}`}>
      {label}
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</h3>
      {children}
    </section>
  )
}

function LinesEditor({
  label,
  value,
  onChange,
  placeholder,
  readOnly,
}: {
  label: string
  value: string[]
  onChange: (lines: string[]) => void
  placeholder?: string
  readOnly?: boolean
}) {
  if (readOnly) {
    if (!value || value.length === 0) return null
    return (
      <div>
        <div className="text-xs font-medium text-zinc-600 mb-1">{label}</div>
        <ul className="space-y-1">
          {value.map((line, i) => (
            <li key={i} className="text-sm text-zinc-700 flex gap-2">
              <span className="text-zinc-300 shrink-0">—</span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <div>
      <label className="block text-xs font-medium text-zinc-600 mb-1">{label}</label>
      <textarea
        value={value.join('\n')}
        onChange={(e) => onChange(e.target.value.split('\n'))}
        onBlur={(e) => onChange(e.target.value.split('\n').map((l) => l.trim()).filter(Boolean))}
        rows={Math.max(2, value.length + 1)}
        placeholder={placeholder || 'One per line'}
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
      />
    </div>
  )
}

function RubricSelect({
  label,
  levels,
  value,
  reason,
  onChange,
  onReason,
  readOnly,
}: {
  label: string
  levels: Rubric[]
  value: string | null
  reason: string
  onChange: (v: string) => void
  onReason: (v: string) => void
  readOnly?: boolean
}) {
  const level = levels.find((l) => l.key === value)
  if (readOnly) {
    return (
      <div>
        <div className="text-xs font-medium text-zinc-600 mb-1">{label}</div>
        <div className="text-sm text-zinc-900">{level?.label || '—'}</div>
        {reason ? <div className="text-xs text-zinc-500 mt-0.5">{reason}</div> : null}
      </div>
    )
  }
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-zinc-600">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
      >
        <option value="">Not rated</option>
        {levels.map((l) => (
          <option key={l.key} value={l.key}>
            {l.label}
          </option>
        ))}
      </select>
      {level ? <p className="text-[11px] text-zinc-400">{level.description}</p> : null}
      <input
        value={reason}
        onChange={(e) => onReason(e.target.value)}
        placeholder="Why? (shown to leadership)"
        className="w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0A52EF]"
      />
    </div>
  )
}

export default function RequestDetailBody({
  id,
  embedded,
  onClose,
  onChanged,
}: {
  id: string
  embedded?: boolean
  onClose?: () => void
  onChanged?: () => void
}) {
  const { showToast } = useToast()
  const [data, setData] = useState<any>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [comment, setComment] = useState('')
  const [assessment, setAssessment] = useState<any>(null)
  const [assessmentDirty, setAssessmentDirty] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState<any>(null)
  const [decisionModal, setDecisionModal] = useState<null | 'decline' | 'hold' | 'need_info'>(null)
  const [decisionText, setDecisionText] = useState('')
  const [linkQuery, setLinkQuery] = useState('')
  const [linkResults, setLinkResults] = useState<any[]>([])
  const [linkUrl, setLinkUrl] = useState('')

  const load = useCallback(async () => {
    const [detailRes, metaRes] = await Promise.all([
      fetch(`/api/request-hub/${id}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/request-hub/meta`).then((r) => (r.ok ? r.json() : null)),
    ])
    if (detailRes?.request) {
      setData(detailRes.request)
      setAssessment({
        ...(detailRes.request.assessment || {}),
        feasibility: detailRes.request.feasibility,
        effort: detailRes.request.effort,
        duration: detailRes.request.duration,
        business_value: detailRes.request.business_value,
        confidence: detailRes.request.confidence,
        recommendation: detailRes.request.recommendation,
        dependencies_summary: detailRes.request.dependencies,
      })
      setAssessmentDirty(false)
    }
    if (metaRes) setMeta(metaRes)
    setLoading(false)
  }, [id])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  // Link search debounce
  useEffect(() => {
    if (linkQuery.trim().length < 2) {
      setLinkResults([])
      return
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/request-hub/search-links?q=${encodeURIComponent(linkQuery)}`)
      if (res.ok) setLinkResults((await res.json()).results || [])
    }, 350)
    return () => clearTimeout(t)
  }, [linkQuery])

  const perms = meta?.permissions
  const canReview = !!(perms?.isAssessor || perms?.isApprover)
  const canDecide = !!perms?.isApprover

  const patch = useCallback(
    async (fields: Record<string, unknown>, silent = false) => {
      setSaving(true)
      const res = await fetch(`/api/request-hub/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(silent ? { ...fields, _silent: true } : fields),
      })
      setSaving(false)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        showToast(err.error || 'Save failed', 'error')
        return null
      }
      const json = await res.json()
      setData((prev: any) => ({ ...prev, ...json.request }))
      onChanged?.()
      return json.request
    },
    [id, onChanged, showToast]
  )

  const saveAssessment = async () => {
    if (!assessment) return
    const { feasibility, effort, duration, business_value, confidence, recommendation, dependencies_summary, ...rest } = assessment
    const ok = await patch({
      feasibility: feasibility || null,
      effort: effort || null,
      duration: duration || null,
      business_value: business_value || null,
      confidence: confidence || null,
      recommendation: recommendation || null,
      dependencies: dependencies_summary || null,
      assessment: rest,
    })
    if (ok) {
      setAssessmentDirty(false)
      showToast('Assessment saved', 'success')
      load()
    }
  }

  const runAiBrief = async () => {
    setAiBusy(true)
    const res = await fetch(`/api/request-hub/${id}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'feasibility' }),
    })
    setAiBusy(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'AI brief failed', 'error')
      return
    }
    const json = await res.json()
    setAiSuggestion(json.suggestion)
  }

  const applyAiSuggestion = () => {
    if (!aiSuggestion) return
    setAssessment((prev: any) => ({
      ...prev,
      facts: aiSuggestion.facts || [],
      assumptions: aiSuggestion.assumptions || [],
      unknowns: aiSuggestion.unknowns || [],
      proposed_scope: aiSuggestion.proposed_scope || '',
      dependencies: aiSuggestion.dependencies || [],
      risks: aiSuggestion.risks || [],
      feasibility_reason: aiSuggestion.feasibility?.reason || '',
      effort_reason: aiSuggestion.effort?.reason || '',
      value_reason: aiSuggestion.business_value?.reason || '',
      confidence_reason: aiSuggestion.confidence?.reason || '',
      recommendation_reason: aiSuggestion.recommendation?.reason || '',
      suggested_reviewer: aiSuggestion.suggested_reviewer || '',
      feasibility: aiSuggestion.feasibility?.rating || prev.feasibility,
      effort: aiSuggestion.effort?.bucket || prev.effort,
      duration: aiSuggestion.duration || prev.duration,
      business_value: aiSuggestion.business_value?.rating || prev.business_value,
      confidence: aiSuggestion.confidence?.rating || prev.confidence,
      recommendation: aiSuggestion.recommendation?.action || prev.recommendation,
      dependencies_summary: (aiSuggestion.dependencies || []).join('; ').slice(0, 200),
    }))
    setAssessmentDirty(true)
    setAiSuggestion(null)
    showToast('AI draft loaded — review and save', 'info')
  }

  const decide = async (decision: string, reason?: string, questions?: string[]) => {
    const res = await fetch(`/api/request-hub/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason, questions }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'Decision failed', 'error')
      return
    }
    setDecisionModal(null)
    setDecisionText('')
    showToast('Decision recorded', 'success')
    load()
    onChanged?.()
  }

  const moveStatus = async (status: string) => {
    const res = await fetch(`/api/request-hub/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'Move failed', 'error')
      return
    }
    showToast('Status updated', 'success')
    load()
    onChanged?.()
  }

  const postComment = async (kind?: string) => {
    const text = comment.trim()
    if (!text) return
    const res = await fetch(`/api/request-hub/${id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, kind }),
    })
    if (res.ok) {
      setComment('')
      load()
    } else {
      showToast('Comment failed', 'error')
    }
  }

  const uploadFile = async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/request-hub/${id}/attachments`, { method: 'POST', body: form })
    if (res.ok) {
      showToast('Attached', 'success')
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'Upload failed', 'error')
    }
  }

  const addLink = async (payload: Record<string, unknown>) => {
    const res = await fetch(`/api/request-hub/${id}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setLinkQuery('')
      setLinkUrl('')
      setLinkResults([])
      load()
    }
  }

  const answersEntries = useMemo(() => {
    if (!data?.answers) return []
    const typeQuestions: Record<string, string> = {}
    // Best-effort question labels from meta config
    const typeCfg: any = (meta as any)?.types?.find((t: any) => t.key === data.type)
    for (const q of typeCfg?.questions || []) typeQuestions[q.key] = q.label
    return Object.entries(data.answers)
      .filter(([, v]) => v != null && String(v).trim() !== '')
      .map(([k, v]) => ({ key: k, label: typeQuestions[k] || k.replace(/_/g, ' '), value: String(v) }))
  }, [data?.answers, meta, data?.type])

  if (loading) {
    return <div className="p-6 text-sm text-zinc-400">Loading request…</div>
  }
  if (!data || !meta) {
    return <div className="p-6 text-sm text-zinc-500">Request not found.</div>
  }

  const pendingQuestions: string[] = Array.isArray(data.pending_questions) ? data.pending_questions : []
  const a = assessment || {}

  return (
    <div className={embedded ? 'space-y-6' : 'space-y-6 max-w-4xl'}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-zinc-400">{data.request_number || 'DRAFT'}</span>
            <StatusPill status={data.status} statuses={meta.statuses} />
            <span className="text-xs text-zinc-400">
              {meta.types.find((t) => t.key === data.type)?.label || data.type}
            </span>
            {data.assessment_ai ? (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-50 text-violet-600 ring-1 ring-violet-200">
                AI draft — needs human review
              </span>
            ) : null}
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 mt-1 break-words">
            {data.title || 'Untitled request'}
          </h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            Requested by {data.requester_name || data.requester_staff_name || 'Unknown'}
            {data.venue_name ? ` · ${data.venue_name}` : ''}
            {data.submitted_at ? ` · ${new Date(data.submitted_at).toLocaleDateString()}` : ''}
          </p>
        </div>
        {saving ? <span className="text-[11px] text-zinc-400 shrink-0">Saving…</span> : null}
      </div>

      {/* Leadership action bar */}
      {canDecide && !['completed', 'declined'].includes(data.status) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#E8E8E8] bg-zinc-50 px-3 py-2">
          <button
            onClick={() => decide('approve')}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors rounded"
          >
            Approve
          </button>
          <button
            onClick={() => setDecisionModal('need_info')}
            className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:border-[#0A52EF]/40 hover:text-[#0A52EF] rounded"
          >
            Request information
          </button>
          <button
            onClick={() => setDecisionModal('hold')}
            className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 hover:border-amber-400 hover:text-amber-700 rounded"
          >
            Hold
          </button>
          <button
            onClick={() => setDecisionModal('decline')}
            className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-red-600 hover:border-red-300 rounded"
          >
            Decline
          </button>
          <div className="ml-auto flex items-center gap-2">
            <select
              value={data.priority || 'medium'}
              onChange={(e) => patch({ priority: e.target.value })}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none"
              title="Priority"
            >
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
              <option value="critical">Critical priority</option>
            </select>
            <select
              value={data.owner_id || ''}
              onChange={(e) => patch({ owner_id: e.target.value || null })}
              className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none max-w-[160px]"
              title="Owner"
            >
              <option value="">Unassigned</option>
              {meta.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : null}

      {/* Delivery moves for assessors/builders */}
      {canReview && ['approved', 'in_progress', 'blocked'].includes(data.status) ? (
        <div className="flex items-center gap-2">
          {data.status !== 'in_progress' ? (
            <button onClick={() => moveStatus('in_progress')} className="px-3 py-1.5 bg-[#0A52EF] text-white text-xs font-semibold rounded hover:bg-[#0840C0]">
              Start work
            </button>
          ) : null}
          {data.status !== 'blocked' ? (
            <button onClick={() => moveStatus('blocked')} className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-red-600 rounded">
              Mark blocked
            </button>
          ) : null}
          <button onClick={() => moveStatus('completed')} className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-emerald-700 rounded">
            Mark completed
          </button>
        </div>
      ) : null}
      {canReview && ['submitted', 'needs_clarification'].includes(data.status) ? (
        <div className="flex items-center gap-2">
          <button onClick={() => moveStatus('feasibility')} className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 rounded hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
            Start feasibility assessment
          </button>
        </div>
      ) : null}
      {canReview && data.status === 'feasibility' ? (
        <div className="flex items-center gap-2">
          <button onClick={() => moveStatus('leadership_review')} className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800">
            Send to leadership review
          </button>
        </div>
      ) : null}

      {/* Pending clarification questions */}
      {pendingQuestions.length > 0 ? (
        <div className="rounded-md border border-violet-200 bg-violet-50/60 p-4 space-y-2">
          <div className="text-xs font-semibold text-violet-700 uppercase tracking-[0.14em]">
            Open questions for the requester
          </div>
          <ul className="space-y-1">
            {pendingQuestions.map((q, i) => (
              <li key={i} className="text-sm text-zinc-700">
                {i + 1}. {q}
              </li>
            ))}
          </ul>
          {!canReview ? (
            <div className="pt-1">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Answer here — your reply reopens the review."
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
              />
              <button
                onClick={() => postComment('clarification_answer')}
                className="mt-2 px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] rounded"
              >
                Send answers
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Decision record */}
      {data.decision ? (
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1">Decision</div>
          <div className="text-sm text-zinc-900">
            <span className="font-medium capitalize">{String(data.decision).replace('_', ' ')}</span>
            {data.decided_by_name ? ` by ${data.decided_by_name}` : ''}
            {data.decided_at ? ` on ${new Date(data.decided_at).toLocaleDateString()}` : ''}
          </div>
          {data.decision_reason ? <p className="text-sm text-zinc-600 mt-1">{data.decision_reason}</p> : null}
        </div>
      ) : null}

      {/* The request itself */}
      <Section title="What is being requested">
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4 space-y-3">
          {data.summary ? <p className="text-sm text-zinc-800">{data.summary}</p> : null}
          {answersEntries.map((entry) => (
            <div key={entry.key}>
              <div className="text-xs font-medium text-zinc-500 capitalize">{entry.label}</div>
              <div className="text-sm text-zinc-800 whitespace-pre-wrap">{entry.value}</div>
            </div>
          ))}
          {data.deadline ? (
            <div>
              <div className="text-xs font-medium text-zinc-500">Deadline</div>
              <div className="text-sm text-zinc-800">
                {String(data.deadline).slice(0, 10)}
                {data.deadline_reason ? ` — ${data.deadline_reason}` : ''}
              </div>
            </div>
          ) : null}
          {data.constraints_note ? (
            <div>
              <div className="text-xs font-medium text-zinc-500">Must not change</div>
              <div className="text-sm text-zinc-800">{data.constraints_note}</div>
            </div>
          ) : null}
          {data.source_permalink ? (
            <a href={data.source_permalink} target="_blank" rel="noreferrer" className="inline-block text-xs text-[#0A52EF] hover:underline">
              View original Slack message ↗
            </a>
          ) : null}
        </div>
      </Section>

      {/* Assessment / decision brief */}
      <Section title="Assessment">
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4 space-y-4">
          {canReview ? (
            <div className="flex items-center gap-2">
              <button
                onClick={runAiBrief}
                disabled={aiBusy}
                className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-700 rounded hover:border-[#0A52EF]/40 hover:text-[#0A52EF] disabled:opacity-50"
              >
                {aiBusy ? 'Drafting…' : 'Draft AI feasibility brief'}
              </button>
              {assessmentDirty ? (
                <button onClick={saveAssessment} className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800">
                  Save assessment
                </button>
              ) : null}
              <span className="text-[11px] text-zinc-400">
                The AI drafts; a person decides. Everything below is editable.
              </span>
            </div>
          ) : null}

          {aiSuggestion ? (
            <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 space-y-2">
              <div className="text-xs font-semibold text-violet-700">
                AI draft ready — facts, assumptions, and unknowns are separated. Review before applying.
              </div>
              <div className="text-xs text-zinc-600">
                Feasibility: {aiSuggestion.feasibility?.rating} — {aiSuggestion.feasibility?.reason}
              </div>
              <div className="text-xs text-zinc-600">
                Recommendation: {aiSuggestion.recommendation?.action} — {aiSuggestion.recommendation?.reason}
              </div>
              <div className="flex gap-2">
                <button onClick={applyAiSuggestion} className="px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded">
                  Load into editor
                </button>
                <button onClick={() => setAiSuggestion(null)} className="px-3 py-1.5 border border-zinc-300 bg-white text-xs rounded">
                  Discard
                </button>
              </div>
            </div>
          ) : null}

          {canReview ? (
            <>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Proposed scope</label>
                <textarea
                  value={a.proposed_scope || ''}
                  onChange={(e) => {
                    setAssessment({ ...a, proposed_scope: e.target.value })
                    setAssessmentDirty(true)
                  }}
                  rows={3}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <LinesEditor label="What is known (facts)" value={a.facts || []} onChange={(v) => { setAssessment({ ...a, facts: v }); setAssessmentDirty(true) }} />
                <LinesEditor label="Assumptions" value={a.assumptions || []} onChange={(v) => { setAssessment({ ...a, assumptions: v }); setAssessmentDirty(true) }} />
                <LinesEditor label="Missing information / unknowns" value={a.unknowns || []} onChange={(v) => { setAssessment({ ...a, unknowns: v }); setAssessmentDirty(true) }} />
                <LinesEditor label="Dependencies & blockers" value={a.dependencies || []} onChange={(v) => { setAssessment({ ...a, dependencies: v, dependencies_summary: v.join('; ').slice(0, 200) }); setAssessmentDirty(true) }} />
                <LinesEditor label="Risks" value={a.risks || []} onChange={(v) => { setAssessment({ ...a, risks: v }); setAssessmentDirty(true) }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <RubricSelect label="Feasibility" levels={meta.rubric.feasibility} value={a.feasibility} reason={a.feasibility_reason || ''} onChange={(v) => { setAssessment({ ...a, feasibility: v }); setAssessmentDirty(true) }} onReason={(v) => { setAssessment({ ...a, feasibility_reason: v }); setAssessmentDirty(true) }} />
                <RubricSelect label="Estimated effort" levels={meta.rubric.effort} value={a.effort} reason={a.effort_reason || ''} onChange={(v) => { setAssessment({ ...a, effort: v }); setAssessmentDirty(true) }} onReason={(v) => { setAssessment({ ...a, effort_reason: v }); setAssessmentDirty(true) }} />
                <RubricSelect label="Business value" levels={meta.rubric.businessValue} value={a.business_value} reason={a.value_reason || ''} onChange={(v) => { setAssessment({ ...a, business_value: v }); setAssessmentDirty(true) }} onReason={(v) => { setAssessment({ ...a, value_reason: v }); setAssessmentDirty(true) }} />
                <RubricSelect label="Confidence" levels={meta.rubric.confidence} value={a.confidence} reason={a.confidence_reason || ''} onChange={(v) => { setAssessment({ ...a, confidence: v }); setAssessmentDirty(true) }} onReason={(v) => { setAssessment({ ...a, confidence_reason: v }); setAssessmentDirty(true) }} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Estimated calendar duration</label>
                  <input
                    value={a.duration || ''}
                    onChange={(e) => { setAssessment({ ...a, duration: e.target.value }); setAssessmentDirty(true) }}
                    placeholder={`e.g. "about 2 weeks once started"`}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Recommended next action</label>
                  <select
                    value={a.recommendation || ''}
                    onChange={(e) => { setAssessment({ ...a, recommendation: e.target.value }); setAssessmentDirty(true) }}
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                  >
                    <option value="">No recommendation yet</option>
                    <option value="approve">Approve</option>
                    <option value="need_info">Request information</option>
                    <option value="hold">Hold</option>
                    <option value="decline">Decline</option>
                  </select>
                  <input
                    value={a.recommendation_reason || ''}
                    onChange={(e) => { setAssessment({ ...a, recommendation_reason: e.target.value }); setAssessmentDirty(true) }}
                    placeholder="Why?"
                    className="mt-1.5 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-[#0A52EF]"
                  />
                </div>
              </div>
              {assessmentDirty ? (
                <button onClick={saveAssessment} className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 rounded">
                  Save assessment
                </button>
              ) : null}
            </>
          ) : (
            <div className="space-y-4">
              {a.proposed_scope ? (
                <div>
                  <div className="text-xs font-medium text-zinc-600 mb-1">Proposed scope</div>
                  <p className="text-sm text-zinc-800">{a.proposed_scope}</p>
                </div>
              ) : null}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <RubricSelect readOnly label="Feasibility" levels={meta.rubric.feasibility} value={a.feasibility} reason={a.feasibility_reason || ''} onChange={() => {}} onReason={() => {}} />
                <RubricSelect readOnly label="Estimated effort" levels={meta.rubric.effort} value={a.effort} reason={a.effort_reason || ''} onChange={() => {}} onReason={() => {}} />
                <RubricSelect readOnly label="Business value" levels={meta.rubric.businessValue} value={a.business_value} reason={a.value_reason || ''} onChange={() => {}} onReason={() => {}} />
              </div>
              <LinesEditor readOnly label="What is known" value={a.facts || []} onChange={() => {}} />
              <LinesEditor readOnly label="Assumptions" value={a.assumptions || []} onChange={() => {}} />
              <LinesEditor readOnly label="Unknowns" value={a.unknowns || []} onChange={() => {}} />
              {!a.feasibility && !(a.facts || []).length ? (
                <p className="text-sm text-zinc-400">No assessment yet — it appears here once review starts.</p>
              ) : null}
            </div>
          )}
        </div>
      </Section>

      {/* Links */}
      <Section title="Linked records">
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4 space-y-3">
          {(data.links || []).length > 0 ? (
            <ul className="space-y-1.5">
              {data.links.map((l: any) => (
                <li key={l.id} className="flex items-center gap-2 text-sm">
                  <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">
                    {String(l.kind).replace('_', ' ')}
                  </span>
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-[#0A52EF] hover:underline truncate">
                      {l.label || l.url}
                    </a>
                  ) : (
                    <span className="text-zinc-700 truncate">{l.label}</span>
                  )}
                  <button
                    onClick={async () => {
                      await fetch(`/api/request-hub/${id}/links?linkId=${l.id}`, { method: 'DELETE' })
                      load()
                    }}
                    className="ml-auto text-zinc-300 hover:text-red-500 text-xs"
                    title="Remove link"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Nothing linked yet.</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="relative">
              <input
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search venues, accounts, opportunities…"
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
              />
              {linkResults.length > 0 ? (
                <div className="absolute z-10 mt-1 w-full rounded-md border border-zinc-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                  {linkResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => addLink({ kind: r.kind, label: r.label, ref_id: r.ref_id, url: r.url })}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      <span className="text-[10px] uppercase text-zinc-400 mr-2">{r.kind}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="flex gap-2">
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="…or paste any URL (doc, Slack thread, page)"
                className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
              />
              <button
                onClick={() => linkUrl.trim() && addLink({ kind: 'url', url: linkUrl.trim(), label: linkUrl.trim() })}
                className="px-3 py-2 border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 rounded hover:border-[#0A52EF]/40"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* Attachments */}
      <Section title="Attachments">
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4 space-y-3">
          {(data.attachments || []).length > 0 ? (
            <ul className="space-y-1.5">
              {data.attachments.map((att: any) => (
                <li key={att.id} className="flex items-center gap-2 text-sm">
                  <a
                    href={att.external_url || `/api/request-hub/${id}/attachments/${att.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#0A52EF] hover:underline truncate"
                  >
                    {att.file_name}
                  </a>
                  <span className="text-[11px] text-zinc-400">
                    {att.size_bytes ? `${Math.max(1, Math.round(att.size_bytes / 1024))} KB · ` : ''}
                    {att.uploaded_by_name || ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No files yet.</p>
          )}
          <label className="inline-block px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 rounded cursor-pointer hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
            Upload file
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) uploadFile(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </Section>

      {/* Comments */}
      <Section title="Comments">
        <div className="rounded-md border border-[#E8E8E8] bg-white p-4 space-y-3">
          {(data.comments || []).length > 0 ? (
            <ul className="space-y-3">
              {data.comments.map((c: any) => (
                <li key={c.id}>
                  <div className="text-xs text-zinc-400">
                    <span className="font-medium text-zinc-600">{c.author_name || c.author_staff_name || 'Someone'}</span>
                    {' · '}
                    {new Date(c.created_at).toLocaleString()}
                    {c.kind === 'clarification_answer' ? ' · answered questions' : ''}
                  </div>
                  <p className="text-sm text-zinc-800 whitespace-pre-wrap mt-0.5">{c.body}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">No comments yet.</p>
          )}
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postComment()}
              placeholder="Add a comment…"
              className="flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
            />
            <button onClick={() => postComment()} className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 rounded">
              Post
            </button>
          </div>
        </div>
      </Section>

      {/* History */}
      <Section title="History">
        <div className="rounded-md border border-[#E8E8E8] bg-white">
          <ul className="divide-y divide-[#F4F4F4]">
            {(data.activity || []).map((ev: any) => (
              <li key={ev.id} className="px-4 py-2 text-xs text-zinc-500 flex items-center gap-2">
                <span className="text-zinc-400 shrink-0 tabular-nums">
                  {new Date(ev.created_at).toLocaleString()}
                </span>
                <span className="text-zinc-700">
                  {ev.actor_name ? `${ev.actor_name} — ` : ''}
                  {String(ev.event_type).replace(/_/g, ' ')}
                  {ev.to_value ? ` → ${ev.to_value}` : ''}
                </span>
              </li>
            ))}
            {(data.activity || []).length === 0 ? (
              <li className="px-4 py-3 text-xs text-zinc-400">No history yet.</li>
            ) : null}
          </ul>
        </div>
      </Section>

      {/* Decision reason modal */}
      {decisionModal ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]"
          onClick={() => setDecisionModal(null)}
        >
          <div className="w-full max-w-md rounded-md bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-zinc-900">
              {decisionModal === 'need_info'
                ? 'What do you need to know?'
                : decisionModal === 'hold'
                  ? 'Put on hold — why?'
                  : 'Decline — why?'}
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              {decisionModal === 'need_info'
                ? 'One question per line. They go straight to the requester.'
                : 'The reason is shared with the requester.'}
            </p>
            <textarea
              value={decisionText}
              onChange={(e) => setDecisionText(e.target.value)}
              rows={4}
              autoFocus
              className="mt-3 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button onClick={() => setDecisionModal(null)} className="px-3 py-1.5 border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 rounded">
                Cancel
              </button>
              <button
                onClick={() => {
                  const text = decisionText.trim()
                  if (decisionModal === 'need_info') {
                    const questions = text.split('\n').map((q) => q.trim()).filter(Boolean)
                    if (questions.length === 0) return
                    decide('need_info', null as any, questions)
                  } else {
                    decide(decisionModal, text || undefined)
                  }
                }}
                className="px-3 py-1.5 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
