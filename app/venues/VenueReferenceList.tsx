'use client'

/**
 * All venues, grouped by sport, with the versions each one is running.
 *
 * Steve Solomson, 2026-08-25: "Every venue listed, grouped by sport. Each
 * group header shows the sport's season start date. Columns: venue, CMS
 * version, LED firmware version, last updated, status. Up to date / Update
 * due / Overdue — so we know at a glance which venues need updates before
 * their season starts."
 *
 * The season start on a group header is read from the venues in it rather
 * than from a league calendar nobody maintains: whatever date the venues
 * themselves carry is the date the group is working to, and a group where
 * nobody has set one says so instead of inventing a plausible September.
 */

import { useMemo } from 'react'
import Link from 'next/link'
import { orderSports, NO_SPORT_LABEL } from '@/lib/venue-reference'

type VersionStatus = 'up_to_date' | 'update_due' | 'overdue' | 'unknown'

type Venue = {
  id: string
  name: string
  market: string
  logo_url: string | null
  is_active: boolean
  sport?: string | null
  sport_group?: string
  season_start_date?: string | null
  cms_version?: string | null
  led_firmware_version?: string | null
  versions_updated_at?: string | null
  version_status?: VersionStatus
  version_status_label?: string
  equipment_count?: number
  document_count?: number
  ticket_count?: number
}

const TONE: Record<VersionStatus, string> = {
  up_to_date: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update_due: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

const seasonLabel = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric' }) : null

export function VenueReferenceList({ venues }: { venues: Venue[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, Venue[]>()
    for (const v of venues) {
      const key = v.sport_group || v.sport || NO_SPORT_LABEL
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(v)
    }
    return orderSports([...map.keys()]).map((sport) => {
      const rows = map.get(sport)!
      // The earliest season date anyone in the group has set. One venue with a
      // date is better than a header that says nothing.
      const dates = rows.map((r) => r.season_start_date).filter(Boolean) as string[]
      const season = dates.sort()[0] || null
      return {
        sport,
        rows,
        season,
        attention: rows.filter((r) => r.version_status === 'overdue' || r.version_status === 'update_due').length,
      }
    })
  }, [venues])

  const needsAttention = groups.reduce((s, g) => s + g.attention, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-sm text-zinc-500">
        <span>{venues.length} venues across {groups.length} {groups.length === 1 ? 'group' : 'groups'}</span>
        {needsAttention > 0 && (
          <span className="text-amber-700 font-medium">{needsAttention} need a version check</span>
        )}
      </div>

      {groups.map((g) => (
        <div key={g.sport} className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h3 className="text-sm font-bold text-zinc-900">{g.sport}</h3>
              <span className="text-[11px] text-zinc-500">
                {g.rows.length} venue{g.rows.length === 1 ? '' : 's'}
                {seasonLabel(g.season) ? ` · season opens ${seasonLabel(g.season)}` : ' · no season date set'}
              </span>
            </div>
            {g.attention > 0 && (
              <span className="text-[11px] font-medium text-amber-700">{g.attention} to check</span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white border-b border-zinc-100">
                <tr className="text-left">
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Venue</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">CMS</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">LED firmware</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Last updated</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Equipment</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Docs</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {g.rows.map((v) => (
                  <tr key={v.id}
                    onClick={() => v.is_active && window.open(`/venues/${v.id}`, '_blank', 'noopener,noreferrer')}
                    className={`${v.is_active ? 'hover:bg-zinc-50 cursor-pointer' : 'opacity-60'} transition-colors`}>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-6 h-6 rounded flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200">
                          {v.logo_url
                            ? <img src={v.logo_url} alt="" className="w-full h-full object-cover" />
                            : (
                              <div className="w-full h-full bg-gradient-to-br from-[#0A52EF] to-[#0840C0] flex items-center justify-center">
                                <span className="text-white font-bold text-[8px]">
                                  {(v.name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                            )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-zinc-900 truncate">{v.name}</p>
                          {v.market && <p className="text-[11px] text-zinc-400 truncate">{v.market}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-700">{v.cms_version || <span className="text-zinc-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-zinc-700">{v.led_firmware_version || <span className="text-zinc-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-[13px]">{fmt(v.versions_updated_at)}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">{v.equipment_count ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-zinc-600">{v.document_count ?? 0}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONE[v.version_status || 'unknown']}`}>
                        {v.version_status_label || 'Not reviewed'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <p className="text-[11px] text-zinc-400 px-1">
        Set a venue&apos;s sport, season date and versions on its Overview tab. A venue reads as
        &ldquo;Not reviewed&rdquo; until someone confirms both — that is a blank record, not a warning.
        {' '}
        <Link href="/equipment" className="hover:underline text-[#0A52EF]">Equipment Library</Link>
      </p>
    </div>
  )
}
