'use client'

// Request Hub — conversational intake. One clear question at a time,
// autosaved as a draft after the first answer, resumable via ?draft=<id>.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useToast } from '@/components/toast'

interface Question {
  key: string
  label: string
  help?: string
  input: 'text' | 'textarea' | 'date' | 'select'
  options?: string[]
  required?: boolean
  showIf?: { key: string; anyOf?: string[]; notEmpty?: boolean }
}

interface RequestType {
  key: string
  label: string
  description: string
  questions: Question[]
}

// Wizard answers that live in real columns, not the answers jsonb.
const COLUMN_KEYS: Record<string, string> = {
  deadline: 'deadline',
  deadline_reason: 'deadline_reason',
  constraints: 'constraints_note',
}

function NewRequestWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showToast } = useToast()

  const [types, setTypes] = useState<RequestType[]>([])
  const [responseTimeText, setResponseTimeText] = useState('')
  const [loading, setLoading] = useState(true)

  const [draftId, setDraftId] = useState<string | null>(null)
  const [type, setType] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [stepIndex, setStepIndex] = useState(-1) // -1 = type picker
  const [phase, setPhase] = useState<'questions' | 'extras' | 'review' | 'done'>('questions')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [duplicates, setDuplicates] = useState<any[]>([])
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [attachmentCount, setAttachmentCount] = useState(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftIdRef = useRef<string | null>(null)
  const draftCreation = useRef<Promise<string | null> | null>(null)

  useEffect(() => {
    draftIdRef.current = draftId
  }, [draftId])

  // Serialize draft creation so a fast first answer can't race the initial
  // POST into creating two drafts.
  const ensureDraft = useCallback(async (typeKey: string): Promise<string | null> => {
    if (draftIdRef.current) return draftIdRef.current
    if (!draftCreation.current) {
      draftCreation.current = fetch('/api/request-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: typeKey }),
      })
        .then(async (res) => {
          if (!res.ok) return null
          const json = await res.json()
          draftIdRef.current = json.request.id
          setDraftId(json.request.id)
          return json.request.id as string
        })
        .catch(() => null)
        .finally(() => {
          // allow a retry if creation failed
          if (!draftIdRef.current) draftCreation.current = null
        })
    }
    return draftCreation.current
  }, [])

  useEffect(() => {
    ;(async () => {
      const meta = await fetch('/api/request-hub/meta').then((r) => (r.ok ? r.json() : null))
      if (meta) {
        setTypes(meta.types || [])
        setResponseTimeText(meta.responseTimeText || '')
      }
      const resume = searchParams.get('draft')
      if (resume) {
        const res = await fetch(`/api/request-hub/${resume}`).then((r) => (r.ok ? r.json() : null))
        const req = res?.request
        if (req && req.status === 'draft') {
          setDraftId(req.id)
          setType(req.type)
          const merged: Record<string, string> = {}
          for (const [k, v] of Object.entries(req.answers || {})) merged[k] = String(v ?? '')
          if (req.deadline) merged.deadline = String(req.deadline).slice(0, 10)
          if (req.deadline_reason) merged.deadline_reason = req.deadline_reason
          if (req.constraints_note) merged.constraints = req.constraints_note
          setAnswers(merged)
          setStepIndex(0)
        }
      }
      setLoading(false)
    })()
  }, [searchParams])

  const activeType = useMemo(() => types.find((t) => t.key === type) || null, [types, type])

  const visibleQuestions = useMemo(() => {
    if (!activeType) return []
    return activeType.questions.filter((q) => {
      if (!q.showIf) return true
      const dep = (answers[q.showIf.key] || '').trim()
      if (q.showIf.notEmpty) return dep !== ''
      if (q.showIf.anyOf) return q.showIf.anyOf.includes(dep)
      return true
    })
  }, [activeType, answers])

  const currentQuestion = phase === 'questions' && stepIndex >= 0 ? visibleQuestions[stepIndex] : null

  // ---- persistence -------------------------------------------------------

  const persist = useCallback(
    async (nextAnswers: Record<string, string>, nextType: string) => {
      const jsonAnswers: Record<string, string> = {}
      const columns: Record<string, string | null> = {}
      for (const [k, v] of Object.entries(nextAnswers)) {
        if (COLUMN_KEYS[k]) columns[COLUMN_KEYS[k]] = v || null
        else jsonAnswers[k] = v
      }
      const payload = { type: nextType, answers: jsonAnswers, ...columns }

      const id = await ensureDraft(nextType)
      if (!id) return null
      const res = await fetch(`/api/request-hub/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, _silent: true }),
      })
      if (res.ok) setSavedAt(new Date())
      return id
    },
    [ensureDraft]
  )

  const scheduleSave = useCallback(
    (nextAnswers: Record<string, string>) => {
      if (!type) return
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        persist(nextAnswers, type).catch(() => {})
      }, 800)
    },
    [persist, type]
  )

  const setAnswer = (key: string, value: string) => {
    const next = { ...answers, [key]: value }
    setAnswers(next)
    scheduleSave(next)
  }

  const pickType = async (key: string) => {
    setType(key)
    setStepIndex(0)
    setPhase('questions')
    // create the draft immediately so autosave + resume work from question 1
    const existing = draftIdRef.current
    if (!existing) {
      ensureDraft(key)
    } else {
      fetch(`/api/request-hub/${existing}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: key, _silent: true }),
      }).catch(() => {})
    }
  }

  const goNext = async () => {
    if (!currentQuestion) return
    const value = (answers[currentQuestion.key] || '').trim()
    if (currentQuestion.required && !value) {
      showToast('This one matters — a short answer is fine.', 'info')
      return
    }
    if (type) await persist(answers, type)
    if (stepIndex + 1 < visibleQuestions.length) setStepIndex(stepIndex + 1)
    else setPhase('extras')
  }

  const goBack = () => {
    if (phase === 'review') { setPhase('extras'); return }
    if (phase === 'extras') { setStepIndex(visibleQuestions.length - 1); setPhase('questions'); return }
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
    else { setStepIndex(-1); }
  }

  const submit = async () => {
    if (!type) return
    setSubmitting(true)
    const id = await persist(answers, type)
    if (!id) {
      setSubmitting(false)
      showToast('Could not save your draft — check your connection and try again.', 'error')
      return
    }
    const res = await fetch(`/api/request-hub/${id}/submit`, { method: 'POST' })
    setSubmitting(false)
    if (!res.ok) {
      showToast('Submit failed — your draft is safe, try again.', 'error')
      return
    }
    const json = await res.json()
    setResult(json.request)
    setDuplicates(json.duplicates || [])
    if (json.responseTimeText) setResponseTimeText(json.responseTimeText)
    setPhase('done')
  }

  const uploadFile = async (file: File) => {
    if (!draftId) return
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/request-hub/${draftId}/attachments`, { method: 'POST', body: form })
    if (res.ok) {
      setAttachmentCount((c) => c + 1)
      showToast(`Attached ${file.name}`, 'success')
    } else {
      const err = await res.json().catch(() => ({}))
      showToast(err.error || 'Upload failed', 'error')
    }
  }

  const addLink = async () => {
    const url = linkUrl.trim()
    if (!draftId || !/^https?:\/\//i.test(url)) return
    const res = await fetch(`/api/request-hub/${draftId}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'url', url, label: url }),
    })
    if (res.ok) {
      setLinkUrl('')
      setAttachmentCount((c) => c + 1)
      showToast('Link added', 'success')
    }
  }

  // ---- render ------------------------------------------------------------

  if (loading) {
    return (
      <DashboardLayout>
        <div className="py-24 text-center text-sm text-zinc-400">Loading…</div>
      </DashboardLayout>
    )
  }

  const progress =
    phase === 'questions' && stepIndex >= 0 && visibleQuestions.length > 0
      ? (stepIndex / visibleQuestions.length) * 0.8
      : phase === 'extras'
        ? 0.85
        : phase === 'review'
          ? 0.95
          : phase === 'done'
            ? 1
            : 0

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        {/* progress */}
        {phase !== 'done' ? (
          <div className="flex items-center gap-3">
            <div className="h-1 flex-1 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className="h-full bg-[#0A52EF] transition-all duration-300"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
            {savedAt ? (
              <span className="text-[11px] text-zinc-400 shrink-0">
                Draft saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </div>
        ) : null}

        {/* Type picker */}
        {stepIndex === -1 && phase === 'questions' ? (
          <div className="space-y-5">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">What are you submitting?</h1>
              <p className="text-sm text-zinc-500 mt-0.5">
                A couple of quick questions — most people finish in under two minutes.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {types.map((t) => (
                <button
                  key={t.key}
                  onClick={() => pickType(t.key)}
                  className={`text-left rounded-xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,0.18)] ${
                    type === t.key ? 'border-[#0A52EF] ring-2 ring-[#0A52EF]/15' : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="text-sm font-semibold text-zinc-900">{t.label}</div>
                  <div className="text-xs text-zinc-500 mt-1">{t.description}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* One question at a time */}
        {currentQuestion ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                {activeType?.label} · question {stepIndex + 1} of {visibleQuestions.length}
              </div>
              <h2 className="text-lg font-semibold text-zinc-900 mt-1.5">{currentQuestion.label}</h2>
              {currentQuestion.help ? (
                <p className="text-sm text-zinc-500 mt-1">{currentQuestion.help}</p>
              ) : null}
            </div>

            {currentQuestion.input === 'textarea' ? (
              <textarea
                autoFocus
                value={answers[currentQuestion.key] || ''}
                onChange={(e) => setAnswer(currentQuestion.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) goNext()
                }}
                rows={4}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
              />
            ) : currentQuestion.input === 'select' ? (
              <div className="space-y-2">
                {(currentQuestion.options || []).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      setAnswer(currentQuestion.key, opt)
                    }}
                    className={`block w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors ${
                      answers[currentQuestion.key] === opt
                        ? 'border-[#0A52EF] bg-[#0A52EF]/5 text-zinc-900 font-medium'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <input
                autoFocus
                type={currentQuestion.input === 'date' ? 'date' : 'text'}
                value={answers[currentQuestion.key] || ''}
                onChange={(e) => setAnswer(currentQuestion.key, e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && goNext()}
                className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
              />
            )}

            <div className="flex items-center justify-between pt-1">
              <button onClick={goBack} className="text-xs font-medium text-zinc-400 hover:text-zinc-600">
                ← Back
              </button>
              <div className="flex items-center gap-3">
                {!currentQuestion.required ? (
                  <button
                    onClick={() => {
                      setAnswer(currentQuestion.key, answers[currentQuestion.key] || '')
                      goNext()
                    }}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-600"
                  >
                    Skip
                  </button>
                ) : null}
                <button
                  onClick={goNext}
                  className="px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] transition-colors rounded"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Extras: files + links */}
        {phase === 'extras' ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Anything that shows what you mean?</h2>
              <p className="text-sm text-zinc-500 mt-1">
                Screenshots, examples, documents, or links — all optional, all helpful.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3 py-2 border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 rounded cursor-pointer hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
                Upload a file
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
              <input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addLink()}
                placeholder="Paste a link (doc, page, Slack thread)…"
                className="flex-1 min-w-[220px] rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
              />
              <button onClick={addLink} className="px-3 py-2 border border-zinc-300 bg-white text-xs font-semibold text-zinc-600 rounded">
                Add link
              </button>
            </div>
            {attachmentCount > 0 ? (
              <p className="text-xs text-emerald-600">{attachmentCount} item{attachmentCount === 1 ? '' : 's'} attached.</p>
            ) : null}
            <div className="flex items-center justify-between pt-1">
              <button onClick={goBack} className="text-xs font-medium text-zinc-400 hover:text-zinc-600">
                ← Back
              </button>
              <button
                onClick={() => setPhase('review')}
                className="px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] rounded"
              >
                Review & submit
              </button>
            </div>
          </div>
        ) : null}

        {/* Review */}
        {phase === 'review' ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Quick look before it goes in</h2>
              <p className="text-sm text-zinc-500 mt-1">Tap any answer to change it.</p>
            </div>
            <ul className="divide-y divide-zinc-100">
              {visibleQuestions.map((q, i) => (
                <li key={q.key}>
                  <button
                    onClick={() => { setPhase('questions'); setStepIndex(i) }}
                    className="w-full text-left py-2.5 hover:bg-zinc-50 px-2 -mx-2 rounded"
                  >
                    <div className="text-xs font-medium text-zinc-500">{q.label}</div>
                    <div className="text-sm text-zinc-800 whitespace-pre-wrap">
                      {(answers[q.key] || '').trim() || <span className="text-zinc-300">—</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between pt-1">
              <button onClick={goBack} className="text-xs font-medium text-zinc-400 hover:text-zinc-600">
                ← Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="px-5 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] rounded disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </div>
        ) : null}

        {/* Confirmation */}
        {phase === 'done' && result ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg">✓</div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Request <span className="font-mono">{result.request_number}</span> is in
                </h2>
                <p className="text-sm text-zinc-500">{responseTimeText}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-medium text-zinc-500">Status</div>
                <div className="text-zinc-900">Submitted — being routed for review</div>
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500">What happens next</div>
                <div className="text-zinc-900">Feasibility look → leadership decision → you hear back</div>
              </div>
            </div>
            {duplicates.length > 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50/60 p-3">
                <div className="text-xs font-semibold text-amber-700 mb-1">
                  Possibly related requests already in the system:
                </div>
                <ul className="space-y-0.5">
                  {duplicates.map((d) => (
                    <li key={d.id} className="text-xs text-zinc-600">
                      <a href={`/request-hub/${d.id}`} className="text-[#0A52EF] hover:underline">
                        {d.request_number}
                      </a>{' '}
                      {d.title} <span className="text-zinc-400">({d.status})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex gap-2">
              <button
                onClick={() => router.push(`/request-hub/${result.id}`)}
                className="px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] rounded"
              >
                Follow your request
              </button>
              <button
                onClick={() => router.push('/request-hub')}
                className="px-4 py-2 border border-zinc-300 bg-white text-sm font-medium text-zinc-600 rounded"
              >
                Back to Request Hub
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  )
}

export default function NewRequestPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="py-24 text-center text-sm text-zinc-400">Loading…</div></DashboardLayout>}>
      <NewRequestWizard />
    </Suspense>
  )
}
