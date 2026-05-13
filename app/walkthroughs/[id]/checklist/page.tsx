'use client'

// Per-walkthrough asset checklist — opens from the "Maintain Checklist"
// button in the grid drawer (Nick parity 5/13 video). Lets the tech revisit
// the asset matrix for an existing walkthrough after the fact:
//   * Reads the row + linked locations from NocoDB
//   * Fetches every Display under those Display Locations
//   * Same per-asset matrix as /walkthroughs/new (Image Quality / Ad Rotation /
//     Physical Damage / Pixel Outages / Cleanliness)
//   * Save patches the row's Comments field with an updated "Per-asset
//     findings" block — preserves any free-text the tech wrote earlier
//
// Mirrors what Airtable's "Open Checklist" extension does per record.

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface WalkthroughRow {
  id: string
  log_id: string
  venue_name: string
  technician_name: string | null
  log_date: string | null
  type: string | null
  result: string | null
  locations_visited: string | null
  issues_found: string | null
  comments: string | null
}

interface DisplayOption {
  id: number
  name: string
  nickName: string | null
  type: string | null
  location_id: number | null
}

interface LocationOption {
  id: number
  name: string
  three_letter_code: string | null
  location_abbreviation: string | null
}

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

export default function WalkthroughChecklistPage() {
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const walkId = params?.id || ''

  const [walk, setWalk] = useState<WalkthroughRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [displays, setDisplays] = useState<DisplayOption[]>([])
  const [findings, setFindings] = useState<Record<number, AssetFinding>>({})
  const [saving, setSaving] = useState(false)

  // Load the walkthrough row first, then its venue's locations + displays.
  useEffect(() => {
    if (!walkId) return
    setLoading(true)
    fetch(`/api/walkthroughs/nocodb?action=row&id=${encodeURIComponent(walkId)}`)
      .then((r) => r.ok ? r.json() : null)
      .then(async (d) => {
        if (!d?.walkthrough) {
          setErrorMsg('Walkthrough not found')
          return
        }
        const w: WalkthroughRow = d.walkthrough
        setWalk(w)
        const venueId = d.venue_id
        if (venueId) {
          const lr = await fetch(`/api/walkthroughs/nocodb?action=locations&venue_id=${venueId}`).then((r) => r.ok ? r.json() : null)
          const locs: LocationOption[] = lr?.locations || []
          // Filter to the locations actually visited on this walk (by name).
          const visitedNames = (w.locations_visited || '').split(',').map((s) => s.trim()).filter(Boolean)
          const filtered = visitedNames.length
            ? locs.filter((l) => visitedNames.includes(l.name))
            : locs
          setLocations(filtered)
          const names = filtered.map((l) => l.name).filter(Boolean).join('|')
          if (names) {
            const dr = await fetch(`/api/walkthroughs/nocodb?action=displays&location_names=${encodeURIComponent(names)}`).then((r) => r.ok ? r.json() : null)
            const ds: DisplayOption[] = dr?.displays || []
            setDisplays(ds)
            // Default-pass every dimension (Airtable convention — uncheck what failed).
            const next: Record<number, AssetFinding> = {}
            for (const dsp of ds) {
              next[dsp.id] = {
                display_id: dsp.id,
                display_name: dsp.name,
                image_quality: true,
                av_rotation: true,
                physical_damage: true,
                pixel_outages: true,
                cleanliness: true,
              }
            }
            setFindings(next)
          }
        }
      })
      .catch((e) => setErrorMsg(e?.message || 'Failed to load walkthrough'))
      .finally(() => setLoading(false))
  }, [walkId])

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

  const toggleDimension = (displayId: number, dim: keyof Omit<AssetFinding, 'display_id' | 'display_name'>) => {
    setFindings((prev) => {
      const cur = prev[displayId]
      if (!cur) return prev
      return { ...prev, [displayId]: { ...cur, [dim]: !cur[dim] } }
    })
  }

  const summarizeFindings = (): string => {
    const lines: string[] = []
    for (const f of Object.values(findings)) {
      const fails: string[] = []
      if (!f.image_quality) fails.push('Image Quality')
      if (!f.av_rotation) fails.push('A/V Rotation')
      if (!f.physical_damage) fails.push('Physical Damage')
      if (!f.pixel_outages) fails.push('Pixel Outages')
      if (!f.cleanliness) fails.push('Cleanliness')
      if (fails.length) lines.push(`• ${f.display_name}: failed — ${fails.join(', ')}`)
    }
    return lines.join('\n')
  }

  const handleSave = async () => {
    if (!walk) return
    setSaving(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      const summary = summarizeFindings()
      // Preserve any free-text comments above the findings block; replace
      // the old "Per-asset findings" block if present.
      const prior = (walk.comments || '').trim()
      const withoutOldBlock = prior.replace(/\n*--- Per-asset findings ---[\s\S]*$/m, '').trim()
      const composed = summary
        ? `${withoutOldBlock}\n\n--- Per-asset findings ---\n${summary}`.trim()
        : withoutOldBlock
      const res = await fetch('/api/walkthroughs/nocodb', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: walk.id, fields: { 'Comments (log issues above)': composed } }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error || 'Save failed')
      }
      setSuccessMsg('Checklist updated.')
      setWalk({ ...walk, comments: composed })
    } catch (e: any) {
      setErrorMsg(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto py-6 space-y-6">
        <div>
          <button
            onClick={() => router.push('/walkthroughs')}
            className="text-xs text-zinc-500 hover:text-zinc-900 mb-2 inline-flex items-center gap-1"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            All walkthroughs
          </button>
          <h1 className="text-2xl font-bold text-zinc-900">Maintain Checklist</h1>
          {walk && (
            <p className="text-sm text-zinc-500 mt-1">
              <span className="font-mono text-[#0A52EF]">{walk.log_id}</span>
              <span className="mx-2 text-zinc-300">·</span>
              {walk.venue_name}
              {walk.log_date && (
                <>
                  <span className="mx-2 text-zinc-300">·</span>
                  {walk.log_date}
                </>
              )}
            </p>
          )}
        </div>

        {loading && (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-sm text-zinc-500">
            Loading checklist…
          </div>
        )}

        {!loading && errorMsg && !walk && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
            {errorMsg}
          </div>
        )}

        {!loading && walk && displays.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            No assets on file for the locations visited on this walkthrough. Anything you want to log, add it to the comments and the team will backfill the asset list.
          </div>
        )}

        {!loading && displays.length > 0 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900">Asset Checklist</h3>
              <p className="text-xs text-zinc-500">
                {failingCount > 0
                  ? `${failingCount} asset${failingCount === 1 ? '' : 's'} flagged`
                  : 'Uncheck a box to flag an issue on that asset'}
              </p>
            </div>

            {locations.filter((l) => (displaysByLocation[l.id]?.length || 0) > 0).map((loc) => (
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
                                  <button
                                    type="button"
                                    onClick={() => toggleDimension(dsp.id, dim.key)}
                                    className={`w-6 h-6 rounded border-2 inline-flex items-center justify-center transition-colors ${checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-zinc-300 text-zinc-300 hover:border-rose-400'}`}
                                    title={checked ? `${dim.label}: passing — click to flag` : `${dim.label}: flagged — click to clear`}
                                  >
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

            <div className="flex items-center justify-between pt-4 border-t border-zinc-200">
              <div className="text-xs">
                {errorMsg && <span className="text-rose-700">{errorMsg}</span>}
                {successMsg && <span className="text-emerald-700">{successMsg}</span>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => router.push('/walkthroughs')}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-5 py-2 bg-[#0A52EF] text-white rounded text-sm font-semibold hover:bg-[#0840C0] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save checklist'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
