/**
 * Asset history timeline — one unified chronological feed of every event
 * that's ever touched a display: tickets, maintenance events, walkthrough
 * visits.
 *
 * Queries Twenty directly on the server side so we don't leak the API key
 * into the browser. Joins:
 *   - serviceTicket WHERE ticketAssetId = $asset
 *   - maintenanceLog WHERE maintenanceAssetId = $asset
 *   - walkthroughLog WHERE walkLocationId = $asset's displayLocation
 *     (walkthroughs are per-location, not per-display)
 */
import Link from 'next/link'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

type Asset = {
  id: string
  name: string
  partName?: string
  modelName?: string
  manufacturer?: string
  screenNumber?: string
  ipAddress?: string
  resolution?: string
  displayType?: string
  orientation?: string
  ownershipGroup?: string
  installPhase?: string
  locationCode?: string
  threeLetterCode?: string
  photoUrl?: string
  renderName?: string
  physicalDimensions?: string
  assetVenueId?: string
}

type Event = {
  kind: 'ticket' | 'maintenance' | 'walkthrough'
  id: string
  date: string
  title: string
  subtitle?: string
  status?: string
  priority?: string
  body?: string
}

async function twentyGet(path: string): Promise<any> {
  const r = await fetch(`${TWENTY_BASE}${path}`, {
    headers: { Authorization: `Bearer ${TWENTY_API_KEY}` },
    cache: 'no-store',
  })
  if (!r.ok) return null
  return r.json()
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 10)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function AssetTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!TWENTY_API_KEY) {
    return <div className="p-8 text-red-600">TWENTY_API_KEY not set on this server.</div>
  }

  // Asset record
  const aRes = await twentyGet(`/rest/inventoryAssets/${id}`)
  const asset: Asset | null = aRes?.data?.inventoryAsset || null
  if (!asset) {
    return <div className="p-8">Display not found.</div>
  }

  // Parallel fetches for all 3 event sources
  const [ticketsRes, maintRes, walksRes, venueRes] = await Promise.all([
    twentyGet(`/rest/serviceTickets?filter=ticketAssetId[eq]:"${id}"&limit=60&order_by=dateReported[DescNullsLast]`),
    twentyGet(`/rest/maintenanceLogs?filter=maintenanceAssetId[eq]:"${id}"&limit=60&order_by=scheduledDate[DescNullsLast]`),
    // Walkthroughs: match by threeLetterCode when asset has one
    asset.threeLetterCode
      ? twentyGet(`/rest/walkthroughLogs?filter=threeLetterCode[eq]:"${asset.threeLetterCode}"&limit=60&order_by=logDate[DescNullsLast]`)
      : null,
    asset.assetVenueId ? twentyGet(`/rest/venues/${asset.assetVenueId}`) : null,
  ])

  const events: Event[] = []
  for (const t of ticketsRes?.data?.serviceTickets || []) {
    events.push({
      kind: 'ticket',
      id: t.id,
      date: t.dateReported || t.createdAt,
      title: t.name || `Ticket ${t.ticketNumber}`,
      subtitle: t.observedState || t.category,
      status: t.ticketStatus,
      priority: t.priority,
      body: t.description,
    })
  }
  for (const m of maintRes?.data?.maintenanceLogs || []) {
    events.push({
      kind: 'maintenance',
      id: m.id,
      date: m.scheduledDate || m.createdAt,
      title: m.name,
      subtitle: m.maintenanceType,
      status: m.status,
      body: m.issueSummary?.markdown,
    })
  }
  for (const w of walksRes?.data?.walkthroughLogs || []) {
    events.push({
      kind: 'walkthrough',
      id: w.id,
      date: w.logDate || w.createdAt,
      title: w.name,
      subtitle: w.technicianName,
      status: w.result,
      body: w.issuesFound?.markdown,
    })
  }

  events.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const venue = venueRes?.data?.venue
  const counts = { t: ticketsRes?.data?.serviceTickets?.length || 0, m: maintRes?.data?.maintenanceLogs?.length || 0, w: walksRes?.data?.walkthroughLogs?.length || 0 }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
          <div className="flex items-start gap-4">
            {asset.photoUrl && (
              <img src={asset.photoUrl} alt="" className="w-32 h-32 rounded-lg object-cover border border-gray-200" />
            )}
            <div className="flex-1">
              <div className="text-xs text-gray-500 mb-1">
                {venue?.name ? `${venue.name} · ` : ''}{asset.displayType || ''}
                {asset.orientation ? ` · ${asset.orientation}` : ''}
              </div>
              <h1 className="text-xl font-semibold text-gray-900">{asset.name}</h1>
              <div className="text-sm text-gray-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {asset.manufacturer && <span>{asset.manufacturer}{asset.modelName ? ` ${asset.modelName}` : ''}</span>}
                {asset.resolution && <span>{asset.resolution}</span>}
                {asset.ipAddress && <span>IP {asset.ipAddress}</span>}
                {asset.ownershipGroup && <span>Owner: {asset.ownershipGroup.replace(/_/g, ' ')}</span>}
              </div>
            </div>
          </div>
          {/* Summary counts */}
          <div className="flex gap-3 mt-5 pt-5 border-t border-gray-100">
            <CountBadge label="Tickets" n={counts.t} color="red" />
            <CountBadge label="Maintenance" n={counts.m} color="blue" />
            <CountBadge label="Walkthroughs" n={counts.w} color="green" />
          </div>
        </div>

        {/* Timeline */}
        {events.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
            No history recorded for this display yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">History — {events.length} events</h2>
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-200" aria-hidden />
              <ul className="space-y-4">
                {events.map((e) => (
                  <li key={`${e.kind}-${e.id}`} className="relative pl-8">
                    <div className={`absolute left-0 top-1.5 w-4 h-4 rounded-full border-2 ${dotColor(e.kind)}`} />
                    <div className="text-xs text-gray-500">{fmtDate(e.date)} · <span className="uppercase tracking-wide">{e.kind}</span></div>
                    <div className="font-medium text-gray-900 text-sm mt-0.5">{e.title}</div>
                    {e.subtitle && <div className="text-xs text-gray-600 mt-0.5">{e.subtitle}</div>}
                    {e.status && (
                      <span className={`inline-block mt-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${statusStyle(e.kind, e.status)}`}>
                        {e.status.replace(/^(STATUS|TICKET|RESULT|PRIORITY)_/, '').replace(/_/g, ' ')}
                      </span>
                    )}
                    {e.priority && e.priority !== 'PRIORITY_MEDIUM' && (
                      <span className={`ml-1 inline-block mt-1 text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${priorityStyle(e.priority)}`}>
                        {e.priority.replace('PRIORITY_', '')}
                      </span>
                    )}
                    {e.body && <p className="text-xs text-gray-600 mt-1.5 line-clamp-2">{e.body}</p>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 mt-4">
          <Link href="#" className="hover:text-gray-600">Asset timeline · ANC</Link>
        </p>
      </div>
    </div>
  )
}

function CountBadge({ label, n, color }: { label: string; n: number; color: 'red' | 'blue' | 'green' }) {
  const bg = color === 'red' ? 'bg-red-50 border-red-200 text-red-700' : color === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
  return (
    <div className={`flex-1 rounded-lg border ${bg} px-3 py-2`}>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{n}</div>
    </div>
  )
}

function dotColor(kind: Event['kind']): string {
  return kind === 'ticket' ? 'bg-red-400 border-red-500' : kind === 'maintenance' ? 'bg-blue-400 border-blue-500' : 'bg-emerald-400 border-emerald-500'
}

function statusStyle(kind: Event['kind'], status: string): string {
  if (kind === 'walkthrough') {
    return status === 'RESULT_GOOD' ? 'bg-emerald-100 text-emerald-800' : status === 'RESULT_PROBLEM' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-700'
  }
  if (kind === 'ticket') {
    return status === 'TICKET_CLOSED' || status === 'TICKET_RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
  }
  return status === 'STATUS_RESOLVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
}

function priorityStyle(p: string): string {
  return p === 'PRIORITY_HIGH' || p === 'PRIORITY_CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
}
