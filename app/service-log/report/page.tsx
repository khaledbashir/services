'use client'

export const dynamic = 'force-dynamic'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

interface ServiceRequest {
  id: string
  received_at: string
  source: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  repo: string | null
  area: string | null
  estimated_hours: number | null
  retainer_covered: boolean
  status: string
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  notes: string | null
}

interface Meter {
  month: string
  hours_used: number
  hours_estimated_open: number
  cap_hours: number
  overage_hours: number
}

function formatMonth(yyyy_mm: string): string {
  const [y, m] = yyyy_mm.split('-').map(Number)
  if (!y || !m) return yyyy_mm
  const d = new Date(Date.UTC(y, m - 1, 1))
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

export default function ServiceReportPage() {
  return (
    <Suspense fallback={<div style={{ padding: 20, color: '#9ca3af' }}>Loading report…</div>}>
      <ServiceReportPageInner />
    </Suspense>
  )
}

function ServiceReportPageInner() {
  const params = useSearchParams()
  const month = params?.get('month') || new Date().toISOString().slice(0, 7)
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [meter, setMeter] = useState<Meter | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/service-triage?month=${month}&limit=500`).then(r => r.json())
      setRequests(r.requests || [])
      setMeter(r.meter || null)
      setLoading(false)
    })()
  }, [month])

  const summary = useMemo(() => {
    const byClass = { FIX: 0, NEW: 0, MIXED: 0 }
    const byStatus = { open: 0, in_progress: 0, shipped: 0, quoted: 0, cancelled: 0 } as Record<string, number>
    let shipped_hours = 0
    let estimated_open = 0
    let quoted_amount = 0
    for (const r of requests) {
      byClass[r.classification] = (byClass[r.classification] || 0) + 1
      byStatus[r.status] = (byStatus[r.status] || 0) + 1
      if (r.status === 'shipped' && r.actual_hours) shipped_hours += Number(r.actual_hours)
      if ((r.status === 'open' || r.status === 'in_progress') && r.retainer_covered && r.estimated_hours) {
        estimated_open += Number(r.estimated_hours)
      }
    }
    return { byClass, byStatus, shipped_hours, estimated_open, quoted_amount }
  }, [requests])

  const cap = meter?.cap_hours ?? 12
  const used = Math.round(summary.shipped_hours * 10) / 10
  const remaining = Math.max(0, cap - used)
  const overage = Math.max(0, used - cap)
  const overageDollars = Math.round(overage * 90 * 100) / 100

  const fixRows = requests.filter(r => r.classification === 'FIX')
  const newRows = requests.filter(r => r.classification === 'NEW' || r.classification === 'MIXED')

  return (
    <div className="report-root">
      <style jsx global>{`
        body { background: white; color: #111; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
        .report-root { max-width: 8.5in; margin: 0 auto; padding: 0.5in 0.75in; }
        h1 { font-size: 22pt; font-weight: 600; margin: 0 0 4px 0; }
        h2 { font-size: 14pt; font-weight: 600; margin: 24px 0 8px 0; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .lede { color: #555; font-size: 10pt; margin-bottom: 16px; }
        .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0 24px 0; }
        .kpi { border: 1px solid #e5e7eb; padding: 12px; border-radius: 6px; }
        .kpi-label { text-transform: uppercase; font-size: 8pt; letter-spacing: 0.06em; color: #6b7280; margin-bottom: 4px; }
        .kpi-value { font-size: 18pt; font-weight: 600; }
        .kpi-sub { font-size: 9pt; color: #6b7280; margin-top: 2px; }
        .meter-bar { height: 10px; background: #e5e7eb; border-radius: 999px; overflow: hidden; margin: 8px 0; }
        .meter-fill { height: 100%; }
        table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
        th { text-align: left; padding: 6px 4px; border-bottom: 1px solid #ddd; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; color: #6b7280; }
        td { padding: 6px 4px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
        td.num { text-align: right; font-variant-numeric: tabular-nums; }
        .badge { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 8pt; font-weight: 500; }
        .badge-fix { background: #d1fae5; color: #065f46; }
        .badge-new { background: #ede9fe; color: #5b21b6; }
        .badge-mixed { background: #fed7aa; color: #9a3412; }
        .footer { margin-top: 32px; font-size: 8pt; color: #9ca3af; border-top: 1px solid #f3f4f6; padding-top: 8px; }
        .print-only { display: none; }
        .toolbar { background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; font-size: 9pt; color: #555; display: flex; gap: 12px; align-items: center; }
        .toolbar button { background: #2563eb; color: white; border: 0; padding: 6px 10px; border-radius: 4px; font-size: 9pt; cursor: pointer; }
        @media print {
          .toolbar, .print-hide { display: none !important; }
          .print-only { display: block; }
          .report-root { padding: 0; }
          h2 { break-after: avoid; }
          tr { break-inside: avoid; }
          @page { margin: 0.6in 0.7in; }
        }
      `}</style>

      <div className="toolbar print-hide">
        <span>📄 Monthly service report — {formatMonth(month)}</span>
        <span style={{ marginLeft: 'auto' }}>Print or save as PDF: ⌘P / Ctrl+P</span>
        <button onClick={() => window.print()}>Print</button>
      </div>

      <h1>Service Contract — {formatMonth(month)} Report</h1>
      <div className="lede">
        ANC Sports · Platform Support &amp; Maintenance · 12-hr/month retainer · Generated {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
      </div>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi">
              <div className="kpi-label">Hours used</div>
              <div className="kpi-value">{used}<span style={{ fontSize: '11pt', fontWeight: 400, color: '#6b7280' }}> / {cap} hr</span></div>
              <div className="meter-bar">
                <div
                  className="meter-fill"
                  style={{
                    width: `${Math.min(100, (used / cap) * 100)}%`,
                    background: used >= cap ? '#ef4444' : used >= cap * 0.75 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <div className="kpi-sub">{remaining} hr remaining</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Overage</div>
              <div className="kpi-value">{overage > 0 ? `${overage} hr` : '—'}</div>
              <div className="kpi-sub">{overage > 0 ? `${overage} × $90 = $${overageDollars}` : 'Within retainer cap'}</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">Fixes shipped</div>
              <div className="kpi-value">{summary.byStatus.shipped || 0}</div>
              <div className="kpi-sub">{summary.byClass.FIX} FIX · {summary.byClass.MIXED} MIXED</div>
            </div>
            <div className="kpi">
              <div className="kpi-label">New scope received</div>
              <div className="kpi-value">{summary.byClass.NEW}</div>
              <div className="kpi-sub">{summary.byStatus.quoted || 0} quoted as fixed-price</div>
            </div>
          </div>

          <h2>Retainer-covered work (FIX) — {fixRows.length}</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Summary</th>
                <th>Area</th>
                <th>Requester</th>
                <th>Status</th>
                <th className="num">Est.</th>
                <th className="num">Actual</th>
                <th>Shipped</th>
              </tr>
            </thead>
            <tbody>
              {fixRows.length === 0 && (
                <tr><td colSpan={8} style={{ color: '#9ca3af', textAlign: 'center', padding: '12px' }}>No fixes triaged in this month.</td></tr>
              )}
              {fixRows.map(r => (
                <tr key={r.id}>
                  <td>{fmtDate(r.received_at)}</td>
                  <td>{r.summary}</td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '8.5pt', color: '#6b7280' }}>{r.repo && r.area ? `${r.repo}/${r.area}` : '—'}</td>
                  <td>{r.requester || '—'}</td>
                  <td>{r.status.replace('_', ' ')}</td>
                  <td className="num">{r.estimated_hours !== null ? `${r.estimated_hours}h` : '—'}</td>
                  <td className="num">{r.actual_hours !== null ? <strong>{r.actual_hours}h</strong> : '—'}</td>
                  <td style={{ fontSize: '8.5pt' }}>{r.shipped_at ? `${fmtDate(r.shipped_at)}${r.shipped_commit_sha ? ' · ' + r.shipped_commit_sha.slice(0, 7) : ''}` : '—'}</td>
                </tr>
              ))}
              {fixRows.length > 0 && (
                <tr style={{ borderTop: '2px solid #111' }}>
                  <td colSpan={5} style={{ fontWeight: 600, paddingTop: '8px' }}>Total fix-hours shipped</td>
                  <td className="num" style={{ fontWeight: 600, paddingTop: '8px' }}>—</td>
                  <td className="num" style={{ fontWeight: 600, paddingTop: '8px' }}>{used}h</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          <h2>New-scope items (NEW / MIXED) — {newRows.length}</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Summary</th>
                <th>Area</th>
                <th>Requester</th>
                <th>Status</th>
                <th className="num">Rough est.</th>
              </tr>
            </thead>
            <tbody>
              {newRows.length === 0 && (
                <tr><td colSpan={7} style={{ color: '#9ca3af', textAlign: 'center', padding: '12px' }}>No new-scope items received this month.</td></tr>
              )}
              {newRows.map(r => (
                <tr key={r.id}>
                  <td>{fmtDate(r.received_at)}</td>
                  <td>
                    <span className={`badge ${r.classification === 'NEW' ? 'badge-new' : 'badge-mixed'}`}>{r.classification}</span>
                  </td>
                  <td>{r.summary}</td>
                  <td style={{ fontFamily: 'ui-monospace, monospace', fontSize: '8.5pt', color: '#6b7280' }}>{r.repo && r.area ? `${r.repo}/${r.area}` : '—'}</td>
                  <td>{r.requester || '—'}</td>
                  <td>{r.status.replace('_', ' ')}</td>
                  <td className="num">{r.estimated_hours !== null ? `${r.estimated_hours}h` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="footer">
            All hours are tracked in real time on the service-log dashboard. Estimates are derived from past similar work in the request log; actual hours are recorded at ship-time and deducted from the {cap}-hour monthly cap. New scope is quoted separately as fixed-price per the service contract.
          </div>
        </>
      )}
    </div>
  )
}
