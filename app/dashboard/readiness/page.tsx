/**
 * Opening-Day Readiness Dashboard — for Gianni.
 *
 * Groups all checklistItem records by teamName and shows, per team:
 *   - Days to opening (from the furthest-out dueDate in the checklist)
 *   - Status breakdown: done / in-progress / not-started
 *   - % complete
 *   - Overdue count (past dueDate && still not done)
 *   - Up-next checklist item (nearest non-done)
 *
 * Pulls from Twenty's REST API. Runs server-side so the API key stays put.
 */
import Link from 'next/link'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

type Item = {
  id: string
  name: string
  teamName: string
  league: string | null
  status: string
  dueDate: string | null
  daysOut: string | null
  taskDescription: string | null
}

async function twentyFetchAll(): Promise<Item[]> {
  const all: Item[] = []
  let cursor: string | null = null
  for (let i = 0; i < 50; i++) {
    const url: string = `${TWENTY_BASE}/rest/checklistItems?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${TWENTY_API_KEY}` }, cache: 'no-store' })
    if (!r.ok) break
    const j: any = await r.json()
    for (const row of j?.data?.checklistItems || []) {
      all.push({
        id: row.id,
        name: row.name,
        teamName: row.teamName || 'Unassigned',
        league: row.league,
        status: row.status,
        dueDate: row.dueDate,
        daysOut: row.daysOut,
        taskDescription: row.taskDescription,
      })
    }
    if (!j?.pageInfo?.hasNextPage) break
    cursor = j.pageInfo.endCursor
  }
  return all
}

function daysBetween(iso: string): number {
  const target = new Date(iso + 'T00:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - now.getTime()) / 86_400_000)
}

type TeamSummary = {
  teamName: string
  league: string | null
  total: number
  done: number
  inProgress: number
  notStarted: number
  overdue: number
  percent: number
  daysToOpening: number | null
  nextItem: Item | null
}

function summarize(items: Item[]): TeamSummary[] {
  const byTeam = new Map<string, Item[]>()
  for (const it of items) {
    const k = it.teamName || 'Unassigned'
    if (!byTeam.has(k)) byTeam.set(k, [])
    byTeam.get(k)!.push(it)
  }
  const out: TeamSummary[] = []
  for (const [teamName, list] of byTeam) {
    const done = list.filter((x) => x.status === 'STATUS_DONE').length
    const inProgress = list.filter((x) => x.status === 'STATUS_IN_PROGRESS').length
    const notStarted = list.length - done - inProgress
    const total = list.length
    const dated = list.filter((x) => x.dueDate)
    const maxDue = dated.length > 0 ? dated.map((x) => x.dueDate!).sort().at(-1)! : null
    const openingDays = maxDue ? daysBetween(maxDue) : null
    const overdue = list.filter((x) => x.status !== 'STATUS_DONE' && x.dueDate && daysBetween(x.dueDate) < 0).length
    const nextItem = list
      .filter((x) => x.status !== 'STATUS_DONE' && x.dueDate)
      .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))[0] || null
    const percent = total > 0 ? Math.round((done / total) * 100) : 0
    out.push({ teamName, league: list[0].league, total, done, inProgress, notStarted, overdue, percent, daysToOpening: openingDays, nextItem })
  }
  out.sort((a, b) => (a.daysToOpening ?? 9999) - (b.daysToOpening ?? 9999))
  return out
}

export default async function ReadinessDashboard() {
  if (!TWENTY_API_KEY) return <div className="p-8 text-red-600">TWENTY_API_KEY not set.</div>
  const items = await twentyFetchAll()
  const teams = summarize(items)

  if (teams.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-10">
        <div className="max-w-4xl mx-auto bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="text-5xl mb-3">📋</div>
          <h1 className="text-xl font-semibold">No checklists yet</h1>
          <p className="text-sm text-gray-600 mt-2">Create a 30/60/90 checklist for a team in Twenty — this dashboard will light up.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Opening-Day Readiness</h1>
          <p className="text-sm text-gray-600 mt-1">Live status of every 30/60/90 checklist, sorted by how soon opening day is.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map((t) => <TeamCard key={t.teamName} t={t} />)}
        </div>

        <p className="text-center text-xs text-gray-400 mt-8">
          <Link href="https://abc-twenty.izcgmb.easypanel.host/objects/checklistItems" className="hover:text-gray-600">Open full checklist in CRM →</Link>
        </p>
      </div>
    </div>
  )
}

function TeamCard({ t }: { t: TeamSummary }) {
  const urgency = (t.daysToOpening ?? 9999) < 14 ? 'red' : (t.daysToOpening ?? 9999) < 45 ? 'orange' : 'green'
  const urgencyBg = urgency === 'red' ? 'border-red-300 bg-red-50' : urgency === 'orange' ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
  const barColor = t.percent >= 80 ? 'bg-emerald-500' : t.percent >= 50 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${urgencyBg}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">{t.league?.replace('LEAGUE_', '') || 'TEAM'}</div>
            <h3 className="text-lg font-semibold text-gray-900">{t.teamName}</h3>
          </div>
          {t.daysToOpening != null && (
            <div className="text-right">
              <div className={`text-2xl font-semibold ${urgency === 'red' ? 'text-red-700' : urgency === 'orange' ? 'text-amber-700' : 'text-emerald-700'}`}>
                {t.daysToOpening < 0 ? `${Math.abs(t.daysToOpening)}` : t.daysToOpening}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">
                {t.daysToOpening < 0 ? 'days past' : 'days out'}
              </div>
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{t.done} of {t.total} done</span>
            <span className="font-medium">{t.percent}%</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div className={`h-full ${barColor}`} style={{ width: `${t.percent}%` }} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 mt-4 text-center text-xs">
          <Stat label="Done" n={t.done} color="emerald" />
          <Stat label="In Progress" n={t.inProgress} color="amber" />
          <Stat label="Not Started" n={t.notStarted} color="gray" />
          <Stat label="Overdue" n={t.overdue} color="red" />
        </div>

        {t.nextItem && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Up next</div>
            <div className="text-sm font-medium text-gray-900">{t.nextItem.name}</div>
            {t.nextItem.dueDate && (
              <div className="text-xs text-gray-600 mt-0.5">
                Due {new Date(t.nextItem.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {t.nextItem.daysOut ? ` · ${t.nextItem.daysOut.replace('DAYS_', '')} days out` : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, n, color }: { label: string; n: number; color: 'emerald' | 'amber' | 'gray' | 'red' }) {
  const bg = color === 'emerald' ? 'bg-emerald-100 text-emerald-800' : color === 'amber' ? 'bg-amber-100 text-amber-800' : color === 'red' && n > 0 ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
  return (
    <div className={`rounded-md py-1.5 ${bg}`}>
      <div className="text-lg font-semibold tabular-nums">{n}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  )
}
