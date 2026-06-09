'use client'

import { useEffect, useState } from 'react'
import PortalShell from '../PortalShell'

interface Display {
  id: string
  name: string
  manufacturer: string | null
  model: string | null
  pixel_pitch: number | null
  width_ft: number | null
  height_ft: number | null
  brightness_nits: number | null
  environment: string | null
  zone: string | null
  health: 'ok' | 'attention' | 'offline'
  issue: string | null
}

interface OpenWork {
  id: string
  summary: string
  status: string
  type: string | null
  scheduled_date: string | null
}

interface VenueDisplays {
  id: string
  name: string
  display_count: number
  open_issues: number
  last_service: string | null
  displays: Display[]
  open_work: OpenWork[]
}

const HEALTH: Record<string, { led: string; label: string; color: string }> = {
  ok: { led: 'is-done', label: 'In service', color: 'var(--cp-green)' },
  attention: { led: 'is-work', label: 'Attention', color: 'var(--cp-amber)' },
  offline: { led: 'is-closed', label: 'Issue reported', color: 'var(--cp-red)' },
}

function fmtDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function specLine(d: Display) {
  const parts: string[] = []
  if (d.width_ft && d.height_ft) parts.push(`${d.width_ft}′ × ${d.height_ft}′`)
  if (d.pixel_pitch) parts.push(`${d.pixel_pitch}mm`)
  if (d.brightness_nits) parts.push(`${Number(d.brightness_nits).toLocaleString()} nits`)
  if (d.manufacturer) parts.push(d.manufacturer)
  return parts.join(' · ')
}

function DisplaysContent() {
  const [venues, setVenues] = useState<VenueDisplays[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/customer/displays')
      .then(res => res.ok ? res.json() : null)
      .then(data => setVenues(data?.venues || []))
      .finally(() => setLoading(false))
  }, [])

  const totalDisplays = venues.reduce((n, v) => n + v.display_count, 0)
  const totalIssues = venues.reduce((n, v) => n + v.open_issues, 0)

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="cp-page-title">Displays</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--anc-muted)' }}>
          {loading
            ? 'Loading your display systems…'
            : `${totalDisplays} display${totalDisplays === 1 ? '' : 's'} under ANC service${totalIssues > 0 ? ` · ${totalIssues} item${totalIssues === 1 ? '' : 's'} being worked` : ' · all clear'}`}
        </p>
      </div>

      {loading ? (
        <div className="cp-panel p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>Loading…</div>
      ) : venues.length === 0 ? (
        <div className="cp-panel p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>No venues linked yet.</div>
      ) : (
        venues.map(v => (
          <section key={v.id} className="mb-10">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
              <h2 className="cp-section-title">{v.name}</h2>
              <div className="text-xs" style={{ color: 'var(--anc-muted)' }}>
                {v.display_count} display{v.display_count === 1 ? '' : 's'}
                {v.open_issues > 0 && <> · <span style={{ color: 'var(--cp-amber)' }}>{v.open_issues} open work item{v.open_issues === 1 ? '' : 's'}</span></>}
                {v.last_service && <> · last service {fmtDate(v.last_service)}</>}
              </div>
            </div>

            {v.displays.length === 0 ? (
              <div className="cp-panel p-6 text-sm" style={{ color: 'var(--anc-muted)' }}>
                Display registry for this venue is being set up by the ANC team.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 cp-stagger">
                {v.displays.map(d => {
                  const h = HEALTH[d.health] || HEALTH.ok
                  return (
                    <div key={d.id} className="cp-panel cp-panel-hover p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{d.name}</div>
                          <div className="text-xs mt-1" style={{ color: 'var(--anc-muted)' }}>
                            {specLine(d) || 'Specs on file with ANC'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-none mt-0.5">
                          <span className={`cp-led ${h.led}`} style={d.health === 'offline' ? { background: 'var(--cp-red)', opacity: 1 } : undefined} />
                          <span className="text-xs font-medium" style={{ color: h.color }}>{h.label}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 flex-wrap">
                        {d.zone && <span className="cp-chip p-low">{d.zone}</span>}
                        {d.environment && <span className="cp-chip p-low">{d.environment}</span>}
                        {d.model && <span className="cp-chip p-low">{d.model}</span>}
                      </div>
                      {d.issue && (
                        <div className="text-xs mt-3 pt-3" style={{ color: 'var(--cp-amber)', borderTop: '1px solid var(--anc-border)' }}>
                          {d.issue}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {v.open_work.length > 0 && (
              <div className="cp-panel mt-4 p-4">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--anc-muted)' }}>
                  WORK IN PROGRESS AT {v.name.toUpperCase()}
                </div>
                {v.open_work.map(w => (
                  <div key={w.id} className="flex items-center gap-3 py-1.5 text-sm">
                    <span className="cp-led is-work" />
                    <span className="flex-1 min-w-0 truncate">{w.summary}</span>
                    <span className="text-xs capitalize flex-none" style={{ color: 'var(--anc-muted)' }}>
                      {w.status.replace(/_/g, ' ')}
                      {w.scheduled_date && ` · ${fmtDate(w.scheduled_date)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))
      )}
    </div>
  )
}

export default function CustomerDisplaysPage() {
  return (
    <PortalShell active="Displays">
      <DisplaysContent />
    </PortalShell>
  )
}
