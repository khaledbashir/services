'use client'

import { useEffect, useMemo, useState } from 'react'

type Login = { platform: string; url?: string; email?: string; password?: string; note?: string }
type Platform = {
  key: string
  name: string
  category: string
  description: string
  capabilities: string[]
  url: string
  status?: 'live' | 'in_progress' | 'experimental'
  health: { ok: boolean; ms: number } | null
}
type HubData = {
  person: { name: string; email: string }
  classification?: string
  classificationLabel?: string
  logins: Login[]
  platforms: Platform[]
  kpis: {
    openTickets: number | null
    eventsNext7Days: number | null
    marketingContacts: number | null
    emailsDelivered: number | null
    opportunities: number | null
  }
  feed: { platform_key: string; title: string; detail: string | null; entry_date: string }[]
}

const CATEGORY_ORDER = ['Revenue', 'Operations', 'Marketing', 'Knowledge', 'In Development']

const STATUS_LABEL: Record<string, string> = {
  in_progress: 'Building',
  experimental: 'Experimental',
}

export default function HubPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<HubData | null>(null)
  const [error, setError] = useState(false)
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('anc-hub-theme')
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    } catch { /* private browsing */ }
  }, [])

  useEffect(() => {
    fetch(`/api/hub/${params.token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [params.token])

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try { window.localStorage.setItem('anc-hub-theme', next) } catch { /* private browsing */ }
      return next
    })
  }

  const firstName = useMemo(() => data?.person.name.split(' ')[0] || '', [data])
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }, [])

  // The board only ever shows numbers this person is scoped to see.
  const readouts = data
    ? [
        { label: 'Opportunities', value: data.kpis.opportunities },
        { label: 'Open tickets', value: data.kpis.openTickets },
        { label: 'Events / 7 days', value: data.kpis.eventsNext7Days },
        { label: 'Contacts', value: data.kpis.marketingContacts },
        { label: 'Emails out', value: data.kpis.emailsDelivered },
      ].filter((k) => k.value != null)
    : []

  const liveCount = data ? data.platforms.filter((p) => p.health?.ok).length : 0

  return (
    <div className={`root ${theme}`}>
      <style jsx global>{THEME_CSS}</style>

      {error ? (
        <main className="shell">
          <p className="dead">This link isn&apos;t active. Ask Ahmad for a fresh one.</p>
        </main>
      ) : (
        <main className="shell">
          <header className="top">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="mark" src={theme === 'dark' ? '/anc-wordmark-white.png' : '/anc-wordmark-blue.png'} alt="ANC" />
            <div className="top-right">
              <span className="eyebrow">{data?.classificationLabel || 'Leadership'}</span>
              <button
                className="toggle"
                type="button"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? '☀' : '☾'}
              </button>
            </div>
          </header>

          <section className="lede">
            <h1>{data ? (firstName && firstName !== 'Leadership' ? `${greeting}, ${firstName}.` : greeting) : 'Loading'}</h1>
            <p>
              Every platform ANC runs on, live. What each one does, whether it&apos;s up right now,
              what changed this week, and a way straight in.
            </p>
          </section>

          {/* SIGNATURE — the ribbon board. ANC builds these; leadership's numbers run on one. */}
          {readouts.length > 0 && (
            <section className="ribbon" aria-label="Live numbers">
              <span className="sweep" aria-hidden="true" />
              <div className="cells">
                {readouts.map((r) => (
                  <div className="cell" key={r.label}>
                    <div className="value">{Number(r.value).toLocaleString()}</div>
                    <div className="cell-label">{r.label}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {data &&
            CATEGORY_ORDER.map((category) => {
              const items = data.platforms.filter((p) => p.category === category)
              if (!items.length) return null
              return (
                <section className="band" key={category}>
                  <div className="band-head">
                    <h2 className="eyebrow">{category}</h2>
                    <span className="rule" />
                    <span className="count">{items.length}</span>
                  </div>

                  <div className="panels">
                    {items.map((p) => (
                      <a className="panel" key={p.key} href={p.url} target="_blank" rel="noreferrer">
                        <div className="panel-head">
                          <span className={`led ${p.health ? (p.health.ok ? 'on' : 'warn') : 'off'}`} aria-hidden="true" />
                          <h3>{p.name}</h3>
                          {p.status && STATUS_LABEL[p.status] && (
                            <span className={`tag ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                          )}
                        </div>
                        <p className="panel-copy">{p.description}</p>
                        <p className="panel-caps">{p.capabilities.slice(0, 4).join('  ·  ')}</p>
                        <span className="enter">Open</span>
                      </a>
                    ))}
                  </div>
                </section>
              )
            })}

          {data && data.feed.length > 0 && (
            <section className="band">
              <div className="band-head">
                <h2 className="eyebrow">What changed</h2>
                <span className="rule" />
              </div>
              <ol className="log">
                {data.feed.map((f, i) => (
                  <li key={i}>
                    <time>
                      {new Date(f.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </time>
                    <div>
                      <h4>{f.title}</h4>
                      {f.detail && <p>{f.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {data && data.logins.length > 0 && (
            <section className="band">
              <div className="band-head">
                <h2 className="eyebrow">Your access</h2>
                <span className="rule" />
              </div>
              <div className="keys">
                {data.logins.map((l, i) => (
                  <div className="key" key={i}>
                    <div>
                      <h4>{l.platform}</h4>
                      <p>
                        {l.email ? `Sign in as ${l.email}` : ''}
                        {l.note ? (l.email ? ' — ' : '') + l.note : ''}
                      </p>
                    </div>
                    {l.password && (
                      <button
                        className="reveal"
                        type="button"
                        onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                      >
                        {revealed[i] ? l.password : 'Show password'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="foot">
            <span>{data ? `${liveCount} of ${data.platforms.length} platforms up` : ''}</span>
            <span>ANC Sports</span>
          </footer>
        </main>
      )}
    </div>
  )
}

const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');

.root {
  --blue: #0A52EF;
  --sky: #4F86FF;
  --cyan: #00AEEF;
  --green: #46D588;
  --amber: #F2B33B;
  --violet: #B388FF;
  min-height: 100vh;
  background: var(--field);
  color: var(--ink);
  font-family: Inter, system-ui, sans-serif;
  transition: background .3s ease, color .3s ease;
}
.root.dark {
  --field: #060B14;
  --panel: #0C1524;
  --panel-hi: #111C2F;
  --bezel: #1A2942;
  --hair: rgba(255,255,255,.07);
  --ink: #E8EFFA;
  --muted: #8496B4;
  --faint: #4E5F7D;
  --dot: rgba(6,11,20,.72);
  --glow: rgba(79,134,255,.30);
}
.root.light {
  --field: #EFF3F9;
  --panel: #FFFFFF;
  --panel-hi: #FFFFFF;
  --bezel: #DBE3EF;
  --hair: rgba(10,16,32,.10);
  --ink: #0A1020;
  --muted: #5A6B86;
  --faint: #93A0B5;
  --dot: rgba(239,243,249,.82);
  --glow: rgba(10,82,239,.14);
}

.shell { max-width: 1120px; margin: 0 auto; padding: 40px 24px 96px; }

/* header */
.top { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.mark { height: 24px; }
.top-right { display: flex; align-items: center; gap: 16px; }
.eyebrow {
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: .28em;
  text-transform: uppercase; color: var(--cyan); margin: 0;
}
.toggle {
  width: 32px; height: 32px; border-radius: 999px; cursor: pointer; font-size: 14px;
  background: var(--panel); color: var(--muted); border: 1px solid var(--hair);
  display: inline-flex; align-items: center; justify-content: center;
}
.toggle:hover { color: var(--ink); }
.toggle:focus-visible, .panel:focus-visible, .reveal:focus-visible {
  outline: 2px solid var(--sky); outline-offset: 3px;
}

/* lede */
.lede { margin-top: 56px; }
.lede h1 {
  font-family: 'Space Grotesk', sans-serif; font-size: clamp(30px, 4.4vw, 44px);
  font-weight: 700; letter-spacing: -.03em; margin: 0;
}
.lede p { color: var(--muted); margin: 12px 0 0; font-size: 15px; line-height: 1.65; max-width: 58ch; }

/* ── THE RIBBON BOARD ─────────────────────────────────────────────
   The thing ANC actually builds: a bezel, LED digits with real pixel
   gaps, a slow refresh sweep. Their numbers, on their own hardware. */
.ribbon {
  position: relative; overflow: hidden; margin-top: 44px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel));
  border: 1px solid var(--bezel); border-radius: 4px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 20px 50px -30px rgba(0,0,0,.9);
}
/* gap + hairline background draws the gridlines on BOTH axes, so a wrapped
   row never leaves an orphan cell hanging off the board */
.cells { display: grid; grid-template-columns: repeat(auto-fit, minmax(128px, 1fr)); gap: 1px; background: var(--hair); }
.cell { padding: 22px 24px; background: var(--panel); }
.value {
  position: relative; width: fit-content;
  font-family: 'Space Grotesk', sans-serif; font-size: 34px; font-weight: 700;
  letter-spacing: .01em; line-height: 1;
  text-shadow: 0 0 22px var(--glow);
}
/* the pixel grid — what makes the digits read as LED, not type */
.value::after {
  content: ''; position: absolute; inset: -2px;
  background-image: radial-gradient(circle, var(--dot) 42%, transparent 43%);
  background-size: 3px 3px;
  pointer-events: none;
}
.cell-label {
  font-family: 'IBM Plex Mono', monospace; font-size: 9.5px; letter-spacing: .18em;
  text-transform: uppercase; color: var(--faint); margin-top: 10px;
}
.sweep {
  position: absolute; top: 0; bottom: 0; width: 22%;
  background: linear-gradient(90deg, transparent, rgba(120,170,255,.06), transparent);
  animation: sweep 9s linear infinite;
}
@keyframes sweep { from { left: -25%; } to { left: 105%; } }

/* bands */
.band { margin-top: 64px; }
.band-head { display: flex; align-items: center; gap: 16px; }
.band-head h2 { font-size: 10.5px; }
.rule { flex: 1; height: 1px; background: var(--hair); }
.count { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--faint); }

/* platform panels */
.panels { margin-top: 20px; display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 1px; background: var(--hair); border: 1px solid var(--hair); }
.panel {
  display: flex; flex-direction: column; gap: 10px;
  background: var(--panel); padding: 24px; text-decoration: none; color: inherit;
  transition: background .18s ease, transform .18s ease;
}
.panel:hover { background: var(--panel-hi); }
.panel:hover .enter { color: var(--sky); }
.panel:hover .enter::after { transform: translateX(4px); }
.panel-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.panel-head h3 { font-family: 'Space Grotesk', sans-serif; font-size: 17px; font-weight: 600; margin: 0; }
.led { width: 7px; height: 7px; border-radius: 999px; background: var(--faint); flex: none; }
.led.on { background: var(--green); box-shadow: 0 0 10px rgba(70,213,136,.8); }
.led.warn { background: var(--amber); box-shadow: 0 0 10px rgba(242,179,59,.7); }
.tag {
  font-family: 'IBM Plex Mono', monospace; font-size: 8.5px; letter-spacing: .14em;
  text-transform: uppercase; padding: 3px 7px; border-radius: 3px; white-space: nowrap;
}
.tag.in_progress { color: var(--amber); background: rgba(242,179,59,.10); border: 1px solid rgba(242,179,59,.30); }
.tag.experimental { color: var(--violet); background: rgba(179,136,255,.10); border: 1px solid rgba(179,136,255,.30); }
.panel-copy { color: var(--muted); font-size: 13.5px; line-height: 1.6; margin: 0; }
.panel-caps {
  font-family: 'IBM Plex Mono', monospace; font-size: 10px; color: var(--faint);
  margin: 2px 0 0; line-height: 1.7;
}
.enter {
  font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--muted);
  margin-top: auto; padding-top: 8px; transition: color .18s ease;
}
.enter::after { content: ' →'; display: inline-block; transition: transform .18s ease; }

/* what changed */
.log { list-style: none; margin: 20px 0 0; padding: 0; border-top: 1px solid var(--hair); }
.log li { display: flex; gap: 24px; padding: 18px 2px; border-bottom: 1px solid var(--hair); }
.log time {
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--faint);
  white-space: nowrap; padding-top: 2px; min-width: 52px;
}
.log h4 { font-size: 14px; font-weight: 600; margin: 0; }
.log p { color: var(--muted); font-size: 13px; line-height: 1.55; margin: 3px 0 0; }

/* access */
.keys { margin-top: 20px; border: 1px solid var(--hair); }
.key {
  display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap;
  padding: 18px 22px; background: var(--panel); border-bottom: 1px solid var(--hair);
}
.key:last-child { border-bottom: 0; }
.key h4 { font-size: 14px; font-weight: 600; margin: 0; }
.key p { color: var(--muted); font-size: 12.5px; margin: 3px 0 0; }
.reveal {
  font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; cursor: pointer;
  background: var(--blue); color: #fff; border: 0; border-radius: 999px; padding: 8px 16px;
}
.reveal:hover { background: var(--sky); }

.foot {
  margin-top: 72px; padding-top: 20px; border-top: 1px solid var(--hair);
  display: flex; justify-content: space-between;
  font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; color: var(--faint);
}

.dead { color: var(--muted); text-align: center; padding: 140px 0; }

@media (max-width: 620px) {
  .shell { padding: 28px 18px 72px; }
  .lede { margin-top: 40px; }
  .cell { padding: 18px; }
  .value { font-size: 28px; }
  .log li { gap: 14px; }
}
@media (prefers-reduced-motion: reduce) {
  .sweep { display: none; }
  .panel, .enter, .enter::after { transition: none; }
}
`
