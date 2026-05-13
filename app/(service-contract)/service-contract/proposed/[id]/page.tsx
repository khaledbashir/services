'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PricingTransparency from '../PricingTransparency'
import ReasoningPanel from '../ReasoningPanel'
import { PromptModal, SuccessModal } from '../../../Modal'

interface ProposedCO {
  id: string
  name: string
  pitch: string | null
  bullets: string[]
  price_usd: number | null
  timeline_label: string | null
  benefit: string | null
  category: 'bundle' | 'individual'
  target_project: string | null
  status: 'draft' | 'available' | 'pitched' | 'in_progress' | 'won' | 'archived'
  pitched_to: string[]
  promoted_request_id: string | null
  is_placeholder: boolean
  notes: string | null
  market_breakdown: any | null
  work_type: string | null
  scope_band: string | null
  ai_reasoning: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_by_email: string | null
  promoted_by_user_id: string | null
  promoted_by_name: string | null
  view_count: number | null
  last_viewed_at: string | null
  created_at: string
  updated_at: string
}

const PROJECT_LABEL: Record<string, string> = {
  'service-dashboard': 'Service Dashboard',
  'proposal-engine': 'Proposal Engine',
  'crm': 'CRM',
  'kb': 'Knowledge Base',
  'mirror-mode': 'Mirror Mode',
  'anything-llm': 'AI Assistant',
  'cross-platform': 'Cross-platform bundle',
}

function fmtUSD(n: number | null): string {
  if (!n) return '—'
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n)
}

export default function ProposedCODetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params.id || '')
  const [item, setItem] = useState<ProposedCO | null>(null)
  const [related, setRelated] = useState<ProposedCO[]>([])
  const [loading, setLoading] = useState(true)
  const [refining, setRefining] = useState('')
  const [refineBusy, setRefineBusy] = useState(false)
  const [refineError, setRefineError] = useState<string | null>(null)
  const [promoting, setPromoting] = useState(false)
  const [promoteOpen, setPromoteOpen] = useState(false)
  const [postPromote, setPostPromote] = useState(false)
  const [promoteError, setPromoteError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const [single, all] = await Promise.all([
      fetch(`/api/proposed-cos/${id}`).then(r => r.ok ? r.json() : null),
      fetch('/api/proposed-cos').then(r => r.json()),
    ])
    setItem(single)
    const items = (all.items || []) as ProposedCO[]
    setRelated(items.filter(i => i.id !== id && !i.is_placeholder).slice(0, 4))
    setLoading(false)
  }

  useEffect(() => { if (id) refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id])

  const refine = async () => {
    if (!refining.trim() || !item) return
    setRefineBusy(true); setRefineError(null)
    try {
      const res = await fetch('/api/proposed-cos/scope-it', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: refining, refine_from: item.id }),
      })
      if (!res.ok) {
        const t = await res.json().catch(() => ({}))
        setRefineError(t?.error || 'Refinement failed')
        return
      }
      const data = await res.json()
      router.push(`/service-contract/proposed/${data.draft.id}`)
    } finally {
      setRefineBusy(false)
    }
  }

  const promote = () => setPromoteOpen(true)

  const submitPromote = async (requester: string) => {
    if (!item) return
    setPromoteOpen(false)
    setPromoting(true)
    setPromoteError(null)
    const res = await fetch(`/api/proposed-cos/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester: requester || undefined }),
    })
    setPromoting(false)
    if (!res.ok) {
      setPromoteError('Lock-in failed — try again.')
      return
    }
    setPostPromote(true)
    await refresh()
  }

  const flipStatus = async (next: ProposedCO['status']) => {
    if (!item) return
    await fetch(`/api/proposed-cos/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    await refresh()
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Loading…</div>
  if (!item) return (
    <div className="p-6 max-w-3xl mx-auto">
      <p className="text-sm text-gray-700 mb-3">This proposal doesn&apos;t exist (or was archived).</p>
      <Link href="/service-contract/proposed" className="text-sm text-blue-600 hover:underline">← Back to catalog</Link>
    </div>
  )

  const projectLabel = item.target_project ? (PROJECT_LABEL[item.target_project] || item.target_project) : null

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-4">
        <Link href="/service-contract/proposed" className="hover:underline">Proposed COs</Link>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300">{item.category === 'bundle' ? 'Bundle' : 'Individual feature'}</span>
        {projectLabel && <><span>›</span><span>{projectLabel}</span></>}
      </div>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8">
        {/* Left column — content */}
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <StatusBadge status={item.status} />
            {item.category === 'bundle' && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">
                Bundle
              </span>
            )}
            {item.is_placeholder && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-amber-200 text-amber-900">
                Placeholder
              </span>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 mb-2">{item.name}</h1>
          {item.pitch && (
            <p className="text-base text-gray-600 dark:text-gray-300 leading-relaxed mb-6 max-w-2xl">{item.pitch}</p>
          )}

          {item.bullets.length > 0 && (
            <section className="mb-8">
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">What&apos;s included</h2>
              <ul className="space-y-2">
                {item.bullets.map((b, i) => (
                  <li key={i} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center text-xs font-bold mt-0.5">✓</span>
                    <span className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{b}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {item.benefit && (
            <section className="mb-8 rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-5">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-800 dark:text-emerald-300 mb-2">The win</h2>
              <p className="text-sm text-emerald-900 dark:text-emerald-200 leading-relaxed">{item.benefit}</p>
            </section>
          )}

          {/* Pricing transparency — 4-step chain + comparable past work + disclaimer */}
          <div className="mb-8">
            <PricingTransparency
              breakdown={item.market_breakdown}
              workType={item.work_type}
            />
          </div>

          {/* Scoping rationale accordion — client-safe explanation */}
          {item.ai_reasoning && (
            <details className="mb-8 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/30 dark:bg-purple-950/20 group">
              <summary className="cursor-pointer p-4 list-none flex items-center justify-between gap-3 hover:bg-purple-50/60 dark:hover:bg-purple-950/30 rounded-xl [&amp;::-webkit-details-marker]:hidden">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧠</span>
                    <h2 className="text-sm font-bold text-purple-900 dark:text-purple-100">
                      Scope rationale
                    </h2>
                  </div>
                  <p className="text-[11px] text-purple-700 dark:text-purple-300 mt-0.5 ml-6">
                    Client-safe notes explaining the estimate, scope band, and delivery logic before final approval.
                  </p>
                </div>
                <span className="text-purple-400 dark:text-purple-500 text-xl group-open:rotate-45 transition-transform leading-none flex-shrink-0">+</span>
              </summary>
              <div className="border-t border-purple-200 dark:border-purple-800/60 px-4 pb-4 pt-3">
                <ReasoningPanel reasoning={item.ai_reasoning} autoScroll={false} />
                <div className="mt-3 pt-3 border-t border-purple-200 dark:border-purple-800/40 text-[10px] text-purple-600 dark:text-purple-400/70 italic">
                  Planning estimate only. The final scope and price are confirmed before work starts.
                </div>
              </div>
            </details>
          )}

          {/* AI iterate */}
          <section className="mb-8 rounded-xl border-2 border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/30 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">✨</span>
              <h2 className="text-sm font-bold text-blue-900 dark:text-blue-100">Iterate this proposal</h2>
            </div>
            <p className="text-xs text-blue-800 dark:text-blue-300 mb-3">
              Tell the AI what to change — pricing, scope, timeline, capabilities. It generates a new draft you can compare.
            </p>
            <div className="flex gap-2">
              <input
                value={refining}
                onChange={(e) => setRefining(e.target.value)}
                placeholder='e.g. "Cut the scope to just the dashboard part", "make it 2 weeks tighter", "add a Slack alert"'
                className="flex-1 px-3 py-2 border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-gray-900 rounded-md text-sm"
              />
              <button
                onClick={refine}
                disabled={refineBusy || !refining.trim()}
                className="px-3 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50 whitespace-nowrap"
              >
                {refineBusy ? '…' : 'Refine →'}
              </button>
            </div>
            {refineError && <div className="text-xs text-rose-600 mt-2">{refineError}</div>}
          </section>

          {related.length > 0 && (
            <section>
              <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">Other proposals</h2>
              <div className="grid md:grid-cols-2 gap-3">
                {related.map(r => (
                  <Link
                    key={r.id}
                    href={`/service-contract/proposed/${r.id}`}
                    className="block rounded-lg border border-gray-200 dark:border-gray-700 p-3 hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 transition-shadow"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <StatusBadge status={r.status} small />
                      <span className="text-xs font-bold tabular-nums">{fmtUSD(r.price_usd)}</span>
                    </div>
                    <div className="text-sm font-semibold leading-tight text-gray-900 dark:text-gray-100">{r.name}</div>
                    {r.pitch && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2 leading-snug">{r.pitch}</div>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right column — buy box */}
        <aside className="lg:sticky lg:top-6 self-start">
          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-sm">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Estimate</div>
            <div className="text-4xl font-bold tabular-nums text-gray-900 dark:text-gray-100 leading-none">
              {fmtUSD(item.price_usd)}
            </div>
            <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-1.5 leading-tight">
              Estimate — final price confirmed before work starts
            </div>
            <div className="text-xs text-gray-500 mt-2">
              {item.timeline_label ? `Delivery: ${item.timeline_label}` : 'Timeline TBD'}
            </div>
            {projectLabel && (
              <div className="text-xs text-gray-500 mt-1">Platform: {projectLabel}</div>
            )}

            <div className="mt-5 space-y-2">
              {item.status !== 'won' && (
                <button
                  onClick={promote}
                  disabled={promoting || item.is_placeholder}
                  className="w-full px-4 py-3 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
                >
                  {promoting ? 'Locking it in…' : item.is_placeholder ? 'Fill in first' : 'Lock it in →'}
                </button>
              )}
              {item.status === 'won' && item.promoted_request_id && (
                <Link
                  href="/service-log/change-orders"
                  className="block text-center px-4 py-3 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-700"
                >
                  Open on kanban →
                </Link>
              )}

              {!item.is_placeholder && (
                <a
                  href={`/api/proposed-cos/${item.id}/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center px-4 py-2.5 text-sm font-semibold border-2 border-[#1b3a5f] text-[#1b3a5f] dark:border-blue-300 dark:text-blue-300 rounded-md hover:bg-[#1b3a5f] hover:text-white dark:hover:bg-blue-300 dark:hover:text-gray-900"
                >
                  ↓ Download CO PDF
                </a>
              )}

              <div className="grid grid-cols-2 gap-2">
                {item.status === 'draft' && (
                  <button
                    onClick={() => flipStatus('available')}
                    className="px-3 py-2 text-xs border border-blue-300 text-blue-700 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30"
                  >
                    Mark available
                  </button>
                )}
                {item.status === 'available' && (
                  <button
                    onClick={() => flipStatus('pitched')}
                    className="px-3 py-2 text-xs border border-purple-300 text-purple-700 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950/30"
                  >
                    Mark pitched
                  </button>
                )}
                <Link
                  href="/service-contract/proposed"
                  className="px-3 py-2 text-xs text-center border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  ← Catalog
                </Link>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-800">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">What you get</div>
              <ul className="space-y-1.5 text-[11px] text-gray-600 dark:text-gray-400">
                <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span>One number, one delivery, one invoice</span></li>
                <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span>30-day post-delivery warranty included</span></li>
                <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span>14-day quote validity from the CO PDF date</span></li>
                <li className="flex gap-1.5"><span className="text-emerald-600">✓</span><span>Approval by written reply locks it in</span></li>
              </ul>
            </div>
          </div>

          {item.pitched_to.length > 0 && (
            <div className="mt-3 rounded-lg border border-purple-200 dark:border-purple-800/60 bg-purple-50/40 dark:bg-purple-950/30 p-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-purple-800 dark:text-purple-300 mb-1">
                Already pitched to
              </div>
              <div className="text-xs text-purple-900 dark:text-purple-200">
                {item.pitched_to.join(', ')}
              </div>
            </div>
          )}

          {/* Audit trail — SSO-verified actor history. Tamper-proof at the API layer. */}
          <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/60 p-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-2">
              Audit trail · SSO-verified
            </div>
            <div className="space-y-1.5 text-[11px] text-gray-700 dark:text-gray-300">
              {item.created_by_name ? (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Scoped by:</span>{' '}
                  <strong>{item.created_by_name}</strong>
                  {item.created_by_email && <span className="text-gray-500"> · {item.created_by_email}</span>}
                </div>
              ) : (
                <div className="text-gray-500 italic">Created before SSO tracking was added.</div>
              )}
              {item.promoted_by_name && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Locked in by:</span>{' '}
                  <strong>{item.promoted_by_name}</strong>
                </div>
              )}
              {(item.view_count ?? 0) > 0 && (
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Opened:</span>{' '}
                  {item.view_count} {item.view_count === 1 ? 'time' : 'times'}
                  {item.last_viewed_at && (
                    <span className="text-gray-500"> · last {new Date(item.last_viewed_at).toLocaleString()}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <PromptModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        title="Lock this in"
        body="Who is this for? (optional — e.g. Joe, Charlie, Jireh.) Press Enter to lock it in as a real change order on the kanban."
        placeholder="Who's this for?"
        confirmLabel="Lock it in →"
        onSubmit={submitPromote}
      />

      <SuccessModal
        open={postPromote}
        onClose={() => { setPostPromote(false); refresh() }}
        title="Locked in"
        body="The idea is now a real change order on the kanban — quoted and ready to ship."
        actionLabel="Open the kanban →"
        onAction={() => { window.location.href = '/service-log/change-orders' }}
      />

      {promoteError && (
        <div className="fixed bottom-4 right-4 px-4 py-3 rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800/60 text-sm text-rose-900 dark:text-rose-100 shadow-lg z-50">
          {promoteError}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status, small }: { status: string; small?: boolean }) {
  const tones: Record<string, string> = {
    draft:       'bg-gray-100 text-gray-700 border-gray-300',
    available:   'bg-blue-100 text-blue-800 border-blue-300',
    pitched:     'bg-purple-100 text-purple-800 border-purple-300',
    in_progress: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    won:         'bg-emerald-100 text-emerald-800 border-emerald-300',
  }
  const tone = tones[status] || tones.draft
  return (
    <span className={`px-2 py-0.5 ${small ? 'text-[9px]' : 'text-[10px]'} font-bold uppercase tracking-wide rounded border ${tone}`}>
      {status.replace('_', ' ')}
    </span>
  )
}
