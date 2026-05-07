import { getDashboardData, COVERED_CLAUSES, NOT_COVERED_CLAUSES } from '@/lib/transparency-data'

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default async function TransparencyDashboard() {
  const data = await getDashboardData()
  const meter = data.meter

  const meterTone =
    meter.pct_used >= 100 ? 'bg-rose-500'
    : meter.pct_used >= 75 ? 'bg-amber-500'
    : 'bg-emerald-500'

  return (
    <html lang="en">
      <head>
        <title>ANC Sports — Service Transparency</title>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="refresh" content="60" />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="icon" href="/favicon.ico" />
        <style>{`
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background: #f6f7f9;
            color: #111827;
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 1100px; margin: 0 auto; padding: 28px 20px 48px; }
          header.head { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 28px; flex-wrap: wrap; }
          header.head .brand { display: flex; align-items: center; gap: 12px; }
          header.head .brand img { height: 32px; width: auto; }
          header.head .brand .title { font-size: 13px; color: #4b5563; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 600; }
          header.head .stamp { font-size: 12px; color: #6b7280; }
          h1 { font-size: 24px; font-weight: 700; margin: 0 0 4px; letter-spacing: -0.01em; }
          h2 { font-size: 13px; font-weight: 600; color: #4b5563; letter-spacing: 0.06em; text-transform: uppercase; margin: 0 0 12px; }
          .grid { display: grid; gap: 18px; }
          @media (min-width: 860px) {
            .grid.two { grid-template-columns: 1fr 1fr; }
            .grid.three { grid-template-columns: 1fr 1fr 1fr; }
          }
          .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 22px; box-shadow: 0 1px 2px rgba(15,23,42,0.04); }
          .meter-card { padding: 26px; }
          .meter-num { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; color: #111827; line-height: 1.1; }
          .meter-num small { font-size: 16px; font-weight: 500; color: #6b7280; margin-left: 4px; }
          .meter-sub { font-size: 13px; color: #6b7280; margin-top: 4px; }
          .bar-track { height: 10px; background: #f1f5f9; border-radius: 999px; margin-top: 18px; overflow: hidden; }
          .bar-fill { height: 100%; border-radius: 999px; transition: width 0.4s ease; }
          .meter-foot { display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; margin-top: 8px; }
          .warranty-item { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 14px 0; border-bottom: 1px solid #f1f5f9; }
          .warranty-item:last-child { border-bottom: 0; }
          .warranty-summary { font-size: 14px; color: #111827; line-height: 1.4; }
          .warranty-meta { font-size: 12px; color: #6b7280; margin-top: 3px; }
          .warranty-days { white-space: nowrap; font-size: 13px; font-weight: 600; padding: 4px 10px; border-radius: 999px; background: #ecfdf5; color: #065f46; }
          .warranty-days.warn { background: #fef3c7; color: #92400e; }
          .warranty-days.expired { background: #f1f5f9; color: #6b7280; }
          .empty { color: #9ca3af; font-size: 13px; padding: 12px 0; font-style: italic; }
          .clause { display: flex; gap: 12px; padding: 10px 0; }
          .clause + .clause { border-top: 1px solid #f3f4f6; }
          .clause .check { flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%; background: #ecfdf5; color: #059669; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; margin-top: 2px; }
          .clause.no .check { background: #fef2f2; color: #b91c1c; }
          .clause .ctitle { font-size: 14px; font-weight: 600; color: #111827; }
          .clause .cdetail { font-size: 12px; color: #6b7280; margin-top: 2px; }
          details.notcovered { margin-top: 18px; border-top: 1px solid #f1f5f9; padding-top: 16px; }
          details.notcovered summary { cursor: pointer; font-size: 12px; font-weight: 600; color: #6b7280; letter-spacing: 0.04em; text-transform: uppercase; list-style: none; }
          details.notcovered summary::-webkit-details-marker { display: none; }
          details.notcovered summary::after { content: '+'; float: right; font-size: 16px; color: #9ca3af; }
          details.notcovered[open] summary::after { content: '−'; }
          details.notcovered .nc-body { margin-top: 14px; }
          .recent-row { display: flex; justify-content: space-between; padding: 10px 0; gap: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
          .recent-row:last-child { border-bottom: 0; }
          .recent-row .summary { color: #111827; }
          .recent-row .meta { color: #6b7280; font-size: 12px; white-space: nowrap; }
          footer.foot { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 40px; }
          a { color: inherit; }
        `}</style>
      </head>
      <body>
        <div className="wrap">

          <header className="head">
            <div className="brand">
              <img src="/ANC_Logo_2023_blue.png" alt="ANC Sports" />
              <span className="title">Service Transparency</span>
            </div>
            <div className="stamp">Updated {fmtTime(data.generated_at)} · auto-refreshes every minute</div>
          </header>

          <h1>Platform Support &amp; Maintenance</h1>
          <p style={{ color: '#6b7280', margin: '0 0 24px', fontSize: 14 }}>
            Live status of ANC&apos;s monthly service contract — credit used, warranty in force, and what&apos;s covered.
          </p>

          <div className="grid two" style={{ marginBottom: 18 }}>
            <div className="card meter-card">
              <h2>Service Credit · {meter.month}</h2>
              <div className="meter-num">
                {meter.hours_used.toFixed(1)}<small>/ {meter.cap_hours} hrs used</small>
              </div>
              <div className="meter-sub">
                {meter.hours_remaining.toFixed(1)} hrs remaining this month · {meter.overage_hours > 0 ? `${meter.overage_hours.toFixed(1)} hrs overage at $90/hr` : 'No overage'}
              </div>
              <div className="bar-track">
                <div className={`bar-fill ${meterTone}`} style={{ width: `${meter.pct_used}%`, background: meter.pct_used >= 100 ? '#ef4444' : meter.pct_used >= 75 ? '#f59e0b' : '#10b981' }} />
              </div>
              <div className="meter-foot">
                <span>0 hrs</span>
                <span>{meter.cap_hours} hrs cap</span>
              </div>
            </div>

            <div className="card">
              <h2>Warranty · 30-day clock per shipped fix</h2>
              {data.warranty_items.length === 0 ? (
                <div className="empty">No fixes shipped in the last 30 days. The warranty clock starts on each new ship.</div>
              ) : (
                data.warranty_items.map((w) => {
                  const tone = w.days_remaining === 0 ? 'expired' : w.days_remaining <= 7 ? 'warn' : ''
                  return (
                    <div key={w.id} className="warranty-item">
                      <div>
                        <div className="warranty-summary">{w.summary}</div>
                        <div className="warranty-meta">
                          Shipped {fmtDate(w.shipped_at)} · expires {fmtDate(w.warranty_expires)}
                          {w.repo ? ` · ${w.repo}` : ''}
                        </div>
                      </div>
                      <div className={`warranty-days ${tone}`}>
                        {w.days_remaining === 0 ? 'Expired' : `${w.days_remaining} days left`}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          <div className="grid two" style={{ marginBottom: 18 }}>
            <div className="card">
              <h2>What&apos;s covered each month</h2>
              {COVERED_CLAUSES.map((c) => (
                <div key={c.title} className="clause">
                  <span className="check">✓</span>
                  <div>
                    <div className="ctitle">{c.title}</div>
                    <div className="cdetail">{c.detail}</div>
                  </div>
                </div>
              ))}
              <details className="notcovered">
                <summary>What&apos;s a separate quote</summary>
                <div className="nc-body">
                  {NOT_COVERED_CLAUSES.map((c) => (
                    <div key={c.title} className="clause no">
                      <span className="check">−</span>
                      <div>
                        <div className="ctitle">{c.title}</div>
                        <div className="cdetail">{c.detail}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>

            <div className="card">
              <h2>Shipped this month</h2>
              {data.recently_shipped.length === 0 ? (
                <div className="empty">Nothing shipped yet this month — credit at full.</div>
              ) : (
                data.recently_shipped.map((s) => (
                  <div key={s.id} className="recent-row">
                    <div className="summary">{s.summary}</div>
                    <div className="meta">
                      {fmtDate(s.shipped_at)}{s.actual_hours != null ? ` · ${s.actual_hours.toFixed(1)} hrs` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <footer className="foot">
            ANC Sports · Standard service contract · $1,500/mo · 12 hrs included · 30-day warranty on shipped work · $90/hr overage<br />
            Operated by Ahmad Basheer
          </footer>
        </div>
      </body>
    </html>
  )
}
