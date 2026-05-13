'use client'

// Roadmap View — narrates ANC's current state, what's in flight, and the
// proposed next moves as a single roadmap rather than a flat list of cards.
// Each next-move card has a planning button that streams a breakdown from
// the Advisor.

import { useEffect, useMemo, useState } from 'react'
import ScopeBreakdownDrawer from './ScopeBreakdownDrawer'

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
}

interface CurrentState {
  active_venues: number
  field_staff: number
  events_next_7d: number
  open_tickets: number
  open_design_requests: number
  active_clients: number
}

const PROJECT_LABEL: Record<string, string> = {
  'service-dashboard': 'Service Dashboard',
  'proposal-engine': 'Proposal Engine',
  'crm': 'CRM',
  'kb': 'Knowledge Base',
  'mirror-mode': 'Mirror Mode',
  'anything-llm': 'AI Assistant',
  'cross-platform': 'Cross-platform',
}

const PROJECT_TONE: Record<string, string> = {
  'service-dashboard': 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  'proposal-engine': 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  'crm': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'kb': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'mirror-mode': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  'anything-llm': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'cross-platform': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

function fmtUSD(n: number | null): string {
  if (!n || !Number.isFinite(n)) return ''
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n)
}

export default function RoadmapView({ items }: { items: ProposedCO[] }) {
  const [now, setNow] = useState<CurrentState | null>(null)
  const [openScopeBreakdown, setOpenScopeBreakdown] = useState<ProposedCO | null>(null)

  useEffect(() => {
    fetch('/api/roadmap/now', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && !data.error) setNow(data) })
      .catch(() => {})
  }, [])

  const inFlight = useMemo(() => items.filter((i) => i.status === 'in_progress'), [items])
  const next = useMemo(() => items.filter((i) => i.status === 'available' || i.status === 'pitched'), [items])
  const won = useMemo(() => items.filter((i) => i.status === 'won').slice(0, 6), [items])

  // Group "next" by target project for the engineering swim-lane feel
  const nextByProject = useMemo(() => {
    const m = new Map<string, ProposedCO[]>()
    for (const co of next) {
      const key = co.target_project || 'unassigned'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(co)
    }
    return Array.from(m.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [next])

  return (
    <div className="space-y-6">
      {/* Now — current state */}
      <section className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-blue-50 via-white to-white dark:from-blue-950/40 dark:via-gray-950 dark:to-gray-950 p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">ANC is here</h2>
        </div>
        {now ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Stat label="Active venues" value={now.active_venues} />
            <Stat label="Field staff" value={now.field_staff} />
            <Stat label="Events next 7d" value={now.events_next_7d} />
            <Stat label="Open tickets" value={now.open_tickets} tone={now.open_tickets > 15 ? 'rose' : 'gray'} />
            <Stat label="Open design reqs" value={now.open_design_requests} />
            <Stat label="Active clients" value={now.active_clients} />
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic">Reading the live ANC state…</div>
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4 max-w-2xl">
          A snapshot of ANC&apos;s operational position right now — the starting line for everything below. Each card on the right side branches off from here.
        </p>
      </section>

      {/* In flight */}
      {inFlight.length > 0 && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">In flight</span>
            <span className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full">{inFlight.length}</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">— building right now</span>
          </header>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {inFlight.map((co) => (
              <RoadmapCard key={co.id} co={co} accent="indigo" onScopeBreakdown={() => setOpenScopeBreakdown(co)} />
            ))}
          </div>
        </section>
      )}

      {/* Next — proposed COs grouped by platform */}
      <section>
        <header className="flex items-center gap-2 mb-3">
          <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Next moves</span>
          <span className="text-[10px] font-semibold text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">{next.length}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">— pick where to go from here</span>
        </header>
        {nextByProject.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-sm text-gray-500">
            No next-move ideas in the pipeline yet. Use the scope-it hero above to add one.
          </div>
        ) : (
          <div className="space-y-5">
            {nextByProject.map(([project, cos]) => (
              <div key={project}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PROJECT_TONE[project] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'}`}>
                    {PROJECT_LABEL[project] || (project === 'unassigned' ? 'Unassigned' : project)}
                  </span>
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">{cos.length} idea{cos.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {cos.map((co) => (
                    <RoadmapCard key={co.id} co={co} accent="blue" onScopeBreakdown={() => setOpenScopeBreakdown(co)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Won — momentum strip */}
      {won.length > 0 && (
        <section>
          <header className="flex items-center gap-2 mb-3">
            <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Recent wins</span>
            <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">{won.length}</span>
          </header>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {won.map((co) => (
              <div key={co.id} className="rounded-lg border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20 px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-600 dark:text-emerald-400 text-sm">✓</span>
                  <div className="text-sm font-medium truncate">{co.name}</div>
                </div>
                {co.target_project && (
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 ml-6">{PROJECT_LABEL[co.target_project] || co.target_project}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {openScopeBreakdown && <ScopeBreakdownDrawer co={openScopeBreakdown} onClose={() => setOpenScopeBreakdown(null)} />}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'gray' | 'rose' }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-3xl font-bold tabular-nums mt-0.5 ${tone === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-gray-900 dark:text-gray-100'}`}>
        {value.toLocaleString('en-US')}
      </div>
    </div>
  )
}

function RoadmapCard({ co, accent, onScopeBreakdown }: { co: ProposedCO; accent: 'indigo' | 'blue'; onScopeBreakdown: () => void }) {
  const accentLine = accent === 'indigo' ? 'border-l-indigo-500' : 'border-l-blue-500'
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 border-l-4 ${accentLine} p-4 shadow-sm flex flex-col gap-3`}>
      <div>
        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 leading-tight">{co.name}</h3>
        {co.pitch && <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-snug line-clamp-3">{co.pitch}</p>}
      </div>
      {co.bullets && co.bullets.length > 0 && (
        <ul className="text-[11px] text-gray-500 dark:text-gray-400 space-y-0.5 ml-3">
          {co.bullets.slice(0, 3).map((b, i) => <li key={i} className="list-disc">{b}</li>)}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 min-w-0">
          {co.price_usd ? <span className="font-semibold tabular-nums">{fmtUSD(co.price_usd)}</span> : null}
          {co.timeline_label ? <span className="truncate">· {co.timeline_label}</span> : null}
        </div>
        <button
          onClick={onScopeBreakdown}
          className="text-xs px-2.5 py-1 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold hover:opacity-90 shrink-0 inline-flex items-center gap-1"
          title="Plan this out with the advisor"
        >
          <span>Plan it</span>
        </button>
      </div>
    </div>
  )
}
