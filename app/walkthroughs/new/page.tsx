'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface VenueOption { id: number; name: string; abbreviation: string | null }
interface LocationOption { id: number; name: string; three_letter_code: string | null; location_abbreviation: string | null }
interface DisplayOption { id: number; name: string; nickName: string | null; type: string | null; location_id: number | null }
interface OpenIssue {
  id: number
  label: string
  status: string
  summary: string
  assigned_to: string | null
  affected_displays: Array<{ id: number; name: string }>
}

type Result = 'Open Issue Observed' | 'No Action Required' | 'New Issue Detected'
type WalkType = 'In-Person' | 'Remote'

interface AssetFinding {
  display_id: number
  display_name: string
  image_quality: boolean
  av_rotation: boolean
  physical_damage: boolean
  pixel_outages: boolean
  cleanliness: boolean
}

const DIMENSIONS: Array<{ key: keyof Omit<AssetFinding, 'display_id' | 'display_name'>; label: string }> = [
  { key: 'image_quality', label: 'Image Quality' },
  { key: 'av_rotation', label: 'Ad Rotation' },
  { key: 'physical_damage', label: 'Physical Damage' },
  { key: 'pixel_outages', label: 'Pixel Outages' },
  { key: 'cleanliness', label: 'Cleanliness' },
]

export default function NewWalkthroughPage() {
  const router = useRouter()
  const [techName, setTechName] = useState<string>('')
  const [loggedByOptions, setLoggedByOptions] = useState<string[]>([])
  const [loggedBy, setLoggedBy] = useState<string>('')
  // Whether the auth-detected tech name maps to a known "Logged By" option.
  // When true, we silently use the match and hide the dropdown — Nick parity
  // ask (5/13): the form should "automatically know it's me" with no extra
  // step. The dropdown only appears if the tech needs to override (no match).
  const [loggedByAutoMatched, setLoggedByAutoMatched] = useState(false)
  // Date prefix for the Log ID strip — Nick parity (5/13 video). Airtable
  // shows `YY-MM-DD []` at form open, fills in the TAG once a venue is
  // picked. We mirror that: prefix is set on mount, TAG composed from the
  // selected venue's abbreviation as the user picks it.
  const [logDatePrefix, setLogDatePrefix] = useState<string>('')
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [venueId, setVenueId] = useState<number | ''>('')
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<number>>(new Set())
  const [displays, setDisplays] = useState<DisplayOption[]>([])
  const [findings, setFindings] = useState<Record<number, AssetFinding>>({})
  const [type, setType] = useState<WalkType>('In-Person')
  const [result, setResult] = useState<Result>('No Action Required')
  const [comments, setComments] = useState('')
  const [openIssues, setOpenIssues] = useState<OpenIssue[]>([])
  const [openIssuesLoading, setOpenIssuesLoading] = useState(false)
  const [observedIssueIds, setObservedIssueIds] = useState<Set<number>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Array<Record<string, unknown> & { title?: string }>>([])
  const [uploading, setUploading] = useState(false)

  // Auto-recognize tech from local auth context. Falls back to a server fetch
  // if not in localStorage (rare — the dashboard layout sets these on login).
  useEffect(() => {
    const stored = (typeof window !== 'undefined' && localStorage.getItem('userName')) || ''
    if (stored) setTechName(stored)
    else {
      fetch('/api/auth/me').then((r) => r.ok ? r.json() : null).then((d) => {
        if (d?.user?.fullName) setTechName(d.user.fullName)
      }).catch(() => {})
    }
  }, [])

  // Load venues + Logged By dropdown options + projected Log ID on mount.
  useEffect(() => {
    fetch('/api/walkthroughs/nocodb?action=venues').then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.venues) setVenues(d.venues)
    })
    fetch('/api/walkthroughs/nocodb?action=logged-by-options').then((r) => r.ok ? r.json() : null).then((d) => {
      if (Array.isArray(d?.options)) setLoggedByOptions(d.options)
    })
    fetch('/api/walkthroughs/nocodb?action=projected-log-id').then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.date_prefix) setLogDatePrefix(String(d.date_prefix))
    })
  }, [])

  // Compose the projected Log ID as venue+location selection changes —
  // mirrors Nick's Airtable formula `YY-MM-DD [<loc codes joined>]`. Falls
  // back to venue abbr if no locations are checked yet.
  const projectedLogId = (() => {
    if (!logDatePrefix) return '—'
    const v = venues.find((x) => x.id === venueId)
    const codes = locations
      .filter((l) => selectedLocationIds.has(l.id))
      .map((l) => l.three_letter_code || l.location_abbreviation || '')
      .filter(Boolean)
    if (codes.length) return `${logDatePrefix} [${codes.join(', ')}]`
    const fallback = v?.abbreviation || (v?.name ? v.name.slice(0, 4).toUpperCase() : '')
    return fallback ? `${logDatePrefix} [${fallback}]` : `${logDatePrefix} [ ]`
  })()

  // Auto-default the submitter to whichever option matches the current
  // tech's name — saves a click for the tech logging their own walkthrough.
  // When matched, hide the dropdown entirely (Nick parity 5/13).
  useEffect(() => {
    if (!techName || !loggedByOptions.length || loggedBy) return
    const match = loggedByOptions.find(o => o.toLowerCase() === techName.trim().toLowerCase())
    if (match) {
      setLoggedBy(match)
      setLoggedByAutoMatched(true)
    }
  }, [techName, loggedByOptions, loggedBy])

  // When venue changes, fetch its Display Locations and auto-check them all.
  useEffect(() => {
    if (!venueId) {
      setLocations([]); setSelectedLocationIds(new Set()); setDisplays([]); setFindings({})
      return
    }
    fetch(`/api/walkthroughs/nocodb?action=locations&venue_id=${venueId}`).then((r) => r.ok ? r.json() : null).then((d) => {
      const locs: LocationOption[] = d?.locations || []
      setLocations(locs)
      // Per Nick's ask: when venue is selected, all Locations in that Venue
      // get auto-checked. Tech can uncheck what they didn't visit.
      setSelectedLocationIds(new Set(locs.map((l) => l.id)))
    })
  }, [venueId])

  // When selected locations change, fetch all displays under those locations.
  useEffect(() => {
    if (!selectedLocationIds.size) { setDisplays([]); setFindings({}); return }
    // Filter by location NAME — NocoDB Link fields filter on the linked
    // record's display title, not its row id. Names join with `|` to dodge
    // commas inside any individual location name.
    const namesParam = locations
      .filter((l) => selectedLocationIds.has(l.id))
      .map((l) => l.name)
      .filter(Boolean)
      .join('|')
    if (!namesParam) { setDisplays([]); setFindings({}); return }
    fetch(`/api/walkthroughs/nocodb?action=displays&location_names=${encodeURIComponent(namesParam)}`).then((r) => r.ok ? r.json() : null).then((d) => {
      const ds: DisplayOption[] = d?.displays || []
      setDisplays(ds)
      // Default-pass every dimension. Tech un-checks any failing dimension —
      // matches the Moynihan paper checklist semantics ("checked = passed").
      setFindings((prev) => {
        const next: Record<number, AssetFinding> = {}
        for (const dsp of ds) {
          next[dsp.id] = prev[dsp.id] || {
            display_id: dsp.id,
            display_name: dsp.name,
            image_quality: true,
            av_rotation: true,
            physical_damage: true,
            pixel_outages: true,
            cleanliness: true,
          }
        }
        return next
      })
    })
  }, [selectedLocationIds, locations])

  // When venue + result combo says "Open Issue Observed", fetch the
  // currently-open Issues for that venue so the tech can pick which one(s)
  // they spotted on this walkthrough. Mirrors the Airtable behaviour.
  useEffect(() => {
    if (!venueId || result !== 'Open Issue Observed') {
      setOpenIssues([])
      setObservedIssueIds(new Set())
      return
    }
    setOpenIssuesLoading(true)
    fetch(`/api/walkthroughs/nocodb?action=open-issues&venue_id=${venueId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setOpenIssues(d?.issues || []))
      .finally(() => setOpenIssuesLoading(false))
  }, [venueId, result])

  const displaysByLocation = useMemo(() => {
    const grouped: Record<number, DisplayOption[]> = {}
    for (const d of displays) {
      const k = d.location_id ?? 0
      if (!grouped[k]) grouped[k] = []
      grouped[k].push(d)
    }
    return grouped
  }, [displays])

  const failingCount = useMemo(() => {
    let c = 0
    for (const f of Object.values(findings)) {
      if (!f.image_quality || !f.av_rotation || !f.physical_damage || !f.pixel_outages || !f.cleanliness) c++
    }
    return c
  }, [findings])

  // Auto-promote result to "New Issue Detected" if any failing dimensions
  // exist and the user hasn't manually overridden — gentle nudge so the
  // ticket-creation flow fires when it should.
  useEffect(() => {
    if (failingCount > 0 && result === 'No Action Required') {
      setResult('New Issue Detected')
    }
  }, [failingCount]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleLocation(id: number) {
    setSelectedLocationIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleObservedIssue(id: number) {
    setObservedIssueIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleDimension(displayId: number, dim: keyof Omit<AssetFinding, 'display_id' | 'display_name'>) {
    setFindings((prev) => {
      const cur = prev[displayId]
      if (!cur) return prev
      return { ...prev, [displayId]: { ...cur, [dim]: !cur[dim] } }
    })
  }

  async function handleAttachmentUpload(files: FileList | null) {
    if (!files || !files.length) return
    setUploading(true)
    setErrorMsg(null)
    try {
      const newAttachments: any[] = []
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/walkthroughs/nocodb/upload', { method: 'POST', body: fd })
        if (!res.ok) {
          const d = await res.json().catch(() => null)
          throw new Error(d?.error || `Upload failed for ${file.name}`)
        }
        const data = await res.json()
        for (const att of data.attachments || []) newAttachments.push(att)
      }
      setAttachments((prev) => [...prev, ...newAttachments])
    } catch (e: any) {
      setErrorMsg(e?.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSubmit() {
    setErrorMsg(null); setSuccessMsg(null)
    if (!venueId) { setErrorMsg('Pick a venue'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/walkthroughs/nocodb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          type,
          result,
          comments,
          logged_by: loggedBy || undefined,
          location_ids: Array.from(selectedLocationIds),
          asset_findings: Object.values(findings),
          observed_issue_ids: Array.from(observedIssueIds),
          attachments,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setErrorMsg(data?.error || 'Submit failed')
        return
      }
      const ticketLine = data?.walkthrough?.ticket_number
        ? ` Ticket #${String(data.walkthrough.ticket_number).padStart(5, '0')} opened automatically.`
        : ''
      setSuccessMsg(`Walkthrough logged — ${data?.walkthrough?.log_id || 'recorded'}.${ticketLine}`)
      setTimeout(() => router.push('/walkthroughs'), 2200)
    } catch (e: any) {
      setErrorMsg(e?.message || 'Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">New Walkthrough</h1>
          <p className="text-sm text-zinc-500 mt-1">Date, time, and tech are auto-captured. Pick a venue and the asset checklist loads automatically. Uncheck any dimension that failed — the rest stay checked.</p>
        </div>

        {/* Log ID / Tech / Date / Time strip — all auto-captured, read-only.
            Log ID is a projection (Nick parity 5/13); the server stamps the
            final ID after insert using the row's auto-increment Id. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-sm">
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Log ID</div>
            <div className="font-mono font-semibold text-[#0A52EF] mt-0.5">{projectedLogId || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Technician</div>
            <div className="font-medium text-zinc-900 mt-0.5 truncate">{techName || '— recognizing —'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</div>
            <div className="font-medium text-zinc-900 mt-0.5">{new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Time</div>
            <div className="font-medium text-zinc-900 mt-0.5">{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
          </div>
        </div>

        {/* Submitter dropdown — only shown if the auth-detected tech doesn't
            match a known "Logged By" option, OR if the tech explicitly opens
            the override. Nick parity 5/13: should "automatically know it's
            me" without an extra step. */}
        {loggedByOptions.length > 0 && !loggedByAutoMatched && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-zinc-50 p-3">
            <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Who is logging this walkthrough?</label>
            <select
              value={loggedBy}
              onChange={(e) => setLoggedBy(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            >
              <option value="">— Pick submitter —</option>
              {loggedByOptions.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        {loggedByAutoMatched && (
          <div className="text-[11px] text-zinc-400 -mt-3">
            Logging as <span className="text-zinc-600 font-medium">{loggedBy}</span>.{' '}
            <button type="button" className="underline hover:text-zinc-700" onClick={() => setLoggedByAutoMatched(false)}>
              Log on behalf of someone else
            </button>
          </div>
        )}

        {/* Venue + Type + Result */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Venue *</label>
            <select value={venueId} onChange={(e) => setVenueId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30">
              <option value="">Select venue…</option>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.abbreviation ? ` (${v.abbreviation})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Type *</label>
            <select value={type} onChange={(e) => setType(e.target.value as WalkType)}
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30">
              <option value="In-Person">In-Person</option>
              <option value="Remote">Remote</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Result *</label>
            <select value={result} onChange={(e) => setResult(e.target.value as Result)}
              className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30">
              <option value="No Action Required">No Action Required</option>
              <option value="Open Issue Observed">Open Issue Observed</option>
              <option value="New Issue Detected">New Issue Detected (auto-creates ticket)</option>
            </select>
          </div>
        </div>

        {/* Open Issues picker — only renders when Result = "Open Issue Observed".
            Lets the tech flag which existing open issue(s) they observed,
            mirroring the Airtable Problem Detected workflow. */}
        {venueId !== '' && result === 'Open Issue Observed' && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-zinc-900">Problem Detected</h3>
              <p className="text-xs text-zinc-500">
                {openIssuesLoading ? 'Loading open issues…' : observedIssueIds.size > 0
                  ? `${observedIssueIds.size} flagged for this walkthrough`
                  : 'Pick the open issue(s) you observed today'}
              </p>
            </div>
            {!openIssuesLoading && openIssues.length === 0 && (
              <p className="text-xs text-zinc-400 italic">No open issues on file for this venue. Use comments below to describe what you saw.</p>
            )}
            {openIssues.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {openIssues.map((iss) => {
                  const checked = observedIssueIds.has(iss.id)
                  const statusColor = iss.status === 'On Hold' ? 'bg-amber-100 text-amber-800'
                    : iss.status === 'In Progress' ? 'bg-sky-100 text-sky-800'
                    : 'bg-rose-100 text-rose-800'
                  return (
                    <button key={iss.id} type="button" onClick={() => toggleObservedIssue(iss.id)}
                      className={`text-left border rounded-lg px-3 py-2 transition-colors ${checked ? 'border-[#0A52EF] bg-[#0A52EF]/5 ring-2 ring-[#0A52EF]/30' : 'border-zinc-200 bg-white hover:border-zinc-400'}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-zinc-900">{iss.label}</span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColor}`}>{iss.status || '—'}</span>
                      </div>
                      {iss.affected_displays.length > 0 && (
                        <div className="text-[11px] text-zinc-500 mb-1">
                          {iss.affected_displays.map((d) => d.name).join(', ')}
                        </div>
                      )}
                      {iss.assigned_to && (
                        <div className="text-[11px] text-zinc-400">Assigned: {iss.assigned_to}</div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Locations checklist — venue-bound, all auto-checked, tech can uncheck */}
        {venueId !== '' && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 mb-2">Locations Visited</h3>
            <p className="text-xs text-zinc-500 mb-2">All locations at this venue are checked by default. Uncheck any you didn&apos;t visit on this walkthrough.</p>
            {locations.length === 0 ? (
              <p className="text-xs text-zinc-400 italic">No display locations on file for this venue yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {locations.map((loc) => {
                  const checked = selectedLocationIds.has(loc.id)
                  return (
                    <button key={loc.id} type="button" onClick={() => toggleLocation(loc.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${checked ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-zinc-300 hover:border-zinc-400'}`}>
                      {loc.name}{loc.location_abbreviation ? <span className="ml-1 opacity-70">[{loc.location_abbreviation}]</span> : null}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Per-asset checklist matrix — grouped by Display Location */}
        {displays.length > 0 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Asset Checklist</h3>
              <p className="text-xs text-zinc-500">
                {failingCount > 0
                  ? `${failingCount} asset${failingCount === 1 ? '' : 's'} flagged — result auto-set to "New Issue Detected"`
                  : 'Uncheck a box to flag an issue on that asset'}
              </p>
            </div>

            {locations.filter((l) => selectedLocationIds.has(l.id) && (displaysByLocation[l.id]?.length || 0) > 0).map((loc) => (
              <div key={loc.id} className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
                <div className="bg-zinc-900 text-white px-4 py-2 text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                  <span>{loc.name}</span>
                  <span className="text-[10px] text-zinc-400">{(displaysByLocation[loc.id] || []).length} assets</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-50 border-b border-zinc-200">
                      <tr>
                        <th className="text-left py-2 px-3 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Asset</th>
                        {DIMENSIONS.map((d) => (
                          <th key={d.key} className="py-2 px-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-center w-24">{d.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {(displaysByLocation[loc.id] || []).map((dsp) => {
                        const f = findings[dsp.id]
                        if (!f) return null
                        return (
                          <tr key={dsp.id}>
                            <td className="py-2 px-3 text-zinc-700">{dsp.name}</td>
                            {DIMENSIONS.map((dim) => {
                              const checked = f[dim.key]
                              return (
                                <td key={dim.key} className="py-2 px-2 text-center">
                                  <button type="button" onClick={() => toggleDimension(dsp.id, dim.key)}
                                    className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center transition-colors ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-300 text-zinc-300 hover:border-rose-400'}`}
                                    title={checked ? `${dim.label}: passing — click to flag` : `${dim.label}: flagged — click to clear`}>
                                    {checked ? '✓' : '!'}
                                  </button>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            {/* Locations selected with no displays in NocoDB yet */}
            {locations.filter((l) => selectedLocationIds.has(l.id) && (displaysByLocation[l.id]?.length || 0) === 0).map((loc) => (
              <div key={loc.id} className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
                <span className="font-semibold">{loc.name}:</span> no assets on file yet — anything you find here, note in the comments below and I&apos;ll get it backfilled.
              </div>
            ))}
          </div>
        )}

        {/* Comments */}
        <div>
          <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Comments / Notes</label>
          <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={4}
            placeholder="Anything else worth logging — context for the ticket if New Issue Detected, photos to follow up on, etc."
            className="w-full px-3 py-2 border border-zinc-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 resize-y" />
        </div>

        {/* Attachments */}
        <div>
          <label className="text-xs font-semibold text-zinc-600 block mb-1.5">Attachments</label>
          <p className="text-xs text-zinc-500 mb-2">Photos, screenshots, anything that helps document a finding. Uploaded straight to the walkthrough record.</p>
          <div className="flex flex-wrap gap-2 mb-2">
            {attachments.map((a, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 bg-zinc-100 text-zinc-800 rounded-full px-3 py-1 text-xs">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                {String(a.title || 'attachment')}
                <button type="button" onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-zinc-400 hover:text-rose-500" aria-label="Remove">×</button>
              </span>
            ))}
            {!attachments.length && <span className="text-xs text-zinc-400">No files attached yet.</span>}
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 border border-dashed border-zinc-300 rounded text-xs text-zinc-600 hover:border-zinc-400 hover:bg-zinc-50 cursor-pointer transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Uploading…' : 'Add files (photos / docs)'}
            <input type="file" multiple disabled={uploading} className="hidden"
              onChange={(e) => { handleAttachmentUpload(e.target.files); e.target.value = '' }} />
          </label>
        </div>

        {/* Submit + status */}
        <div className="flex items-center justify-between pt-4 border-t border-zinc-200">
          <div className="text-xs">
            {errorMsg && <span className="text-rose-700">{errorMsg}</span>}
            {successMsg && <span className="text-emerald-700">{successMsg}</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => router.push('/walkthroughs')} disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting || !venueId}
              className="px-5 py-2 bg-[#0A52EF] text-white rounded text-sm font-semibold hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
              {submitting ? 'Submitting…' : 'Submit Walkthrough'}
            </button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
