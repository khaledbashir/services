'use client'

import Link from 'next/link'
import { useState } from 'react'

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
  status: string
}

function fmtUSD(n: number | null): string {
  if (!n || !Number.isFinite(n)) return '—'
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n)
}

const PLATFORM_LABEL: Record<string, string> = {
  'service-dashboard': 'Service Dashboard',
  'crm': 'CRM',
  'proposal-engine': 'Proposal Engine',
  'kb': 'Knowledge Base',
  'mirror-mode': 'Mirror Mode',
  'anything-llm': 'AI Assistant',
  'cross-platform': 'Cross-platform',
}

interface Props {
  draft: ProposedCO
  context?: {
    grounding?: string[] // list of sources the AI grounded against
    answers?: { question: string; answer: string }[]
    attachments?: string[]
  }
  onRefine: (instruction: string) => void
  onReset: () => void
  busy?: boolean
}

export default function IdeaResultDashboard({ draft, context, onRefine, onReset, busy }: Props) {
  const [refining, setRefining] = useState('')
  const grounding = context?.grounding && context.grounding.length > 0
    ? context.grounding
    : ['ANC live operational state (venues, staff, events, tickets)', 'Comparable past shipped work in the catalog', 'Pinned anc-live-context.md context doc']
  const platform = draft.target_project ? PLATFORM_LABEL[draft.target_project] || draft.target_project : null

  return (
    <div className="space-y-3">
      {/* HERO BANNER */}
      <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-800/60 bg-gradient-to-br from-white via-blue-50/40 to-indigo-50/30 dark:from-gray-900 dark:via-blue-950/30 dark:to-indigo-950/20 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-blue-600 text-white">AI scope</span>
              {draft.category === 'bundle' && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300">bundle</span>
              )}
              {platform && (
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">{platform}</span>
              )}
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{draft.name}</h2>
            {draft.pitch && <p className="text-sm text-gray-600 dark:text-gray-400 mt-1.5 leading-relaxed">{draft.pitch}</p>}
          </div>
          <div className="text-right flex-shrink-0">
            <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">Investment</div>
            <div className="text-3xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100 leading-none mt-0.5">{fmtUSD(draft.price_usd)}</div>
            {draft.timeline_label && <div className="text-[11px] text-gray-500 mt-1">{draft.timeline_label}</div>}
          </div>
        </div>
      </div>

      {/* TWO-COLUMN GRID for the sections */}
      <div className="grid md:grid-cols-2 gap-3">
        {/* Grounded in */}
        <Section icon="📚" title="Grounded in">
          <ul className="space-y-1">
            {grounding.map((s, i) => (
              <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                <span className="text-blue-500 flex-shrink-0">◆</span>
                <span>{s}</span>
              </li>
            ))}
            {context?.attachments && context.attachments.length > 0 && (
              <li className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                <span className="text-blue-500 flex-shrink-0">📎</span>
                <span>Attached: {context.attachments.join(', ')}</span>
              </li>
            )}
          </ul>
        </Section>

        {/* Tech needed */}
        <Section icon="🛠️" title="Tech needed">
          {draft.bullets && draft.bullets.length > 0 ? (
            <ul className="space-y-1">
              {draft.bullets.map((b, i) => (
                <li key={i} className="text-xs text-gray-700 dark:text-gray-300 flex gap-2">
                  <span className="text-indigo-500 flex-shrink-0">●</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 italic">Refine to surface specific components.</p>
          )}
        </Section>

        {/* Business potential */}
        <Section icon="🧠" title="Business potential">
          {draft.benefit ? (
            <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{draft.benefit}</p>
          ) : (
            <p className="text-xs text-gray-500 italic">No benefit captured yet — try Refine with &quot;why does ANC care&quot;.</p>
          )}
        </Section>

        {/* Plan / next steps */}
        <Section icon="⚡" title="Next moves">
          <ol className="space-y-1.5">
            <Step n={1} text="Pitch it" detail="Send to Joe / Charlie / Jireh for green light" />
            <Step n={2} text="Lock scope" detail="Promote to a real CO on the kanban once approved" />
            <Step n={3} text="Ship" detail={draft.timeline_label || 'Per agreed timeline'} />
          </ol>
        </Section>
      </div>

      {/* Clarification context — answers from the journey */}
      {context?.answers && context.answers.length > 0 && (
        <Section icon="💬" title="What you told the AI">
          <ul className="space-y-2">
            {context.answers.map((qa, i) => (
              <li key={i} className="text-xs">
                <div className="font-semibold text-gray-700 dark:text-gray-300">{qa.question}</div>
                <div className="text-gray-600 dark:text-gray-400 mt-0.5 italic">{qa.answer || '— skipped —'}</div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Refine + actions footer */}
      <div className="rounded-2xl border border-blue-200 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-950/20 p-4">
        <div className="text-xs font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-2">Iterate</div>
        <div className="flex gap-2 mb-3">
          <input
            value={refining}
            onChange={(e) => setRefining(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && refining.trim() && !busy) {
                onRefine(refining)
                setRefining('')
              }
            }}
            placeholder='e.g. "make it cheaper", "add region filtering", "drop the email part"'
            disabled={busy}
            className="flex-1 px-3 py-2 border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-gray-900 rounded-md text-sm disabled:opacity-60"
          />
          <button
            onClick={() => { if (refining.trim() && !busy) { onRefine(refining); setRefining('') } }}
            disabled={busy || !refining.trim()}
            className="px-3 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50 font-semibold"
          >
            {busy ? '…' : 'Refine'}
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-blue-200 dark:border-blue-800/40">
          <div className="text-[11px] text-blue-700 dark:text-blue-400">
            Saved as <strong>draft</strong> · flip to <strong>available</strong> to pitch.
          </div>
          <div className="flex gap-2">
            <Link
              href={`/service-contract/proposed/${draft.id}`}
              className="px-3 py-1.5 text-xs bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-md hover:opacity-90"
            >
              Open detail →
            </Link>
            <button
              onClick={onReset}
              className="px-3 py-1.5 text-xs border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-100/50 dark:hover:bg-blue-950/40"
            >
              Start over
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{icon}</span>
        <h3 className="text-[11px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Step({ n, text, detail }: { n: number; text: string; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center justify-center">{n}</span>
      <div className="flex-1">
        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{text}</div>
        <div className="text-[10px] text-gray-500 dark:text-gray-400">{detail}</div>
      </div>
    </li>
  )
}
