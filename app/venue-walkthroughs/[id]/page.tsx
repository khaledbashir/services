'use client'

// The checklist a technician actually answers — Joe 2026-08-17.
//
// One row per screen/system: Operating as intended, or Issue found. Choosing
// Issue found reveals a required detail box, and Submit stays disabled until
// every item is answered and every issue has detail. The same rules are
// enforced by the API and by a database constraint, so this is convenience,
// not the guard.

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ChecklistItem {
  id: string
  template_item_id: string | null
  label: string
  item_type: string
  result: 'operating' | 'issue' | null
  detail: string | null
}

interface Walkthrough {
  id: string
  venue_name: string
  assigned_staff_name: string | null
  scheduled_for: string | null
  status: string
  notes: string | null
  generated_ticket_number: number | null
  items: ChecklistItem[]
}

export default function WalkthroughChecklistPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [walkthrough, setWalkthrough] = useState<Walkthrough | null>(null)
  const [answers, setAnswers] = useState<Record<string, { result: 'operating' | 'issue' | null; detail: string }>>({})
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ issue_count: number; ticket_number: number | null; summary_sent: boolean } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/venue-walkthroughs/${params.id}`)
    if (!res.ok) {
      setError(res.status === 403 ? 'This walk-thru is assigned to someone else.' : 'Could not load this walk-thru.')
      return
    }
    const data: Walkthrough = await res.json()
    setWalkthrough(data)
    setNotes(data.notes || '')
    const seeded: Record<string, { result: 'operating' | 'issue' | null; detail: string }> = {}
    for (const item of data.items) {
      if (!item.template_item_id) continue
      seeded[item.template_item_id] = { result: item.result, detail: item.detail || '' }
    }
    setAnswers(seeded)
  }, [params.id])

  useEffect(() => { load() }, [load])

  const setResult = (itemId: string, result: 'operating' | 'issue') => {
    setAnswers((prev) => ({ ...prev, [itemId]: { result, detail: prev[itemId]?.detail || '' } }))
  }

  const setDetail = (itemId: string, detail: string) => {
    setAnswers((prev) => ({ ...prev, [itemId]: { result: prev[itemId]?.result || null, detail } }))
  }

  const answerable = (walkthrough?.items || []).filter((i) => i.template_item_id)
  const unanswered = answerable.filter((i) => !answers[i.template_item_id!]?.result)
  const missingDetail = answerable.filter(
    (i) => answers[i.template_item_id!]?.result === 'issue' && !answers[i.template_item_id!]?.detail.trim(),
  )
  const canSubmit = answerable.length > 0 && unanswered.length === 0 && missingDetail.length === 0

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/venue-walkthroughs/${params.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notes,
          results: answerable.map((i) => ({
            template_item_id: i.template_item_id,
            result: answers[i.template_item_id!]?.result,
            detail: answers[i.template_item_id!]?.detail || null,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error || 'Could not submit this walk-thru')
        return
      }
      setDone({ issue_count: data.issue_count, ticket_number: data.ticket_number, summary_sent: data.summary_sent })
    } finally {
      setSubmitting(false)
    }
  }

  if (error && !walkthrough) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl p-6"><p className="text-sm text-red-600">{error}</p></div>
      </DashboardLayout>
    )
  }

  if (!walkthrough) {
    return (
      <DashboardLayout>
        <div className="mx-auto max-w-3xl p-6"><p className="text-sm text-zinc-400">Loading…</p></div>
      </DashboardLayout>
    )
  }

  const submitted = walkthrough.status === 'submitted' || done !== null

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div>
          <button onClick={() => router.push('/venue-walkthroughs')} className="text-xs text-zinc-500 hover:text-zinc-900">
            ← All walk-thrus
          </button>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">{walkthrough.venue_name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {walkthrough.assigned_staff_name || 'Unassigned'} · {walkthrough.scheduled_for || 'No date'}
          </p>
        </div>

        {done && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Walk-thru submitted.{' '}
            {done.issue_count > 0
              ? `${done.issue_count} issue${done.issue_count === 1 ? '' : 's'} reported${done.ticket_number ? ` — ticket #${done.ticket_number} opened` : ''}.`
              : 'Everything operating as intended.'}{' '}
            {done.summary_sent ? 'Summary emailed.' : ''}
          </div>
        )}

        {submitted && !done && (
          <div className="rounded-lg border border-[#E8E8E8] bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Submitted{walkthrough.generated_ticket_number ? ` — ticket #${walkthrough.generated_ticket_number} was opened.` : '.'}
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-3">
          {answerable.map((item) => {
            const answer = answers[item.template_item_id!] || { result: null, detail: '' }
            return (
              <div key={item.id} className="rounded-lg border border-[#E8E8E8] bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-zinc-900">{item.label}</div>
                    <div className="text-xs capitalize text-zinc-400">{item.item_type}</div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={submitted}
                      onClick={() => setResult(item.template_item_id!, 'operating')}
                      className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                        answer.result === 'operating'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-[#E8E8E8] bg-white text-zinc-600 hover:border-emerald-300'
                      }`}
                    >
                      Operating as intended
                    </button>
                    <button
                      disabled={submitted}
                      onClick={() => setResult(item.template_item_id!, 'issue')}
                      className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors disabled:opacity-60 ${
                        answer.result === 'issue'
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-[#E8E8E8] bg-white text-zinc-600 hover:border-red-300'
                      }`}
                    >
                      Issue found
                    </button>
                  </div>
                </div>

                {answer.result === 'issue' && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">
                      What&apos;s wrong? <span className="text-red-600">Required</span>
                    </label>
                    <textarea
                      disabled={submitted}
                      value={answer.detail}
                      onChange={(e) => setDetail(item.template_item_id!, e.target.value)}
                      rows={2}
                      placeholder="Describe the issue — this goes straight onto the ticket."
                      className="mt-1 w-full rounded-md border border-[#E8E8E8] px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {!submitted && (
          <>
            <div className="rounded-lg border border-[#E8E8E8] bg-white p-4">
              <label className="block text-xs font-medium uppercase tracking-wider text-zinc-500">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-[#E8E8E8] px-3 py-2 text-sm"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={submit}
                disabled={!canSubmit || submitting}
                className="h-10 rounded-md bg-[#0A52EF] px-5 text-sm font-medium text-white hover:bg-[#0846cc] disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit walk-thru'}
              </button>
              {unanswered.length > 0 && (
                <span className="text-xs text-zinc-500">{unanswered.length} item{unanswered.length === 1 ? '' : 's'} still need an answer</span>
              )}
              {unanswered.length === 0 && missingDetail.length > 0 && (
                <span className="text-xs text-red-600">Add detail to every issue before submitting</span>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
