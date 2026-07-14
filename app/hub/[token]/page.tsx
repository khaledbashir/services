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

const CATEGORY_ORDER = ['Revenue', 'Operations', 'Marketing', 'Knowledge']

// ANC brand palettes (see brand kit). Dark = "stadium at night" house look.
const THEMES = {
  dark: {
    bg: '#0A0F1C',
    surface: '#101A2E',
    surface2: '#15213A',
    ink: '#EBF1FC',
    muted: '#93A2C2',
    faint: '#5F6E8E',
    line: 'rgba(255,255,255,.075)',
    lineSoft: 'rgba(255,255,255,.06)',
    accent: '#00AEEF',
    linkText: '#4F86FF',
    chipBg: 'rgba(10,82,239,.14)',
    chipLine: 'rgba(79,134,255,.22)',
    logo: '/anc-wordmark-white.png',
    green: '#46D588',
    amber: '#F2B33B',
  },
  light: {
    bg: '#F4F7FC',
    surface: '#FFFFFF',
    surface2: '#E9EEF8',
    ink: '#0A1020',
    muted: '#5A6B86',
    faint: '#8A97B0',
    line: 'rgba(10,16,32,.10)',
    lineSoft: 'rgba(10,16,32,.07)',
    accent: '#0A52EF',
    linkText: '#0A52EF',
    chipBg: 'rgba(10,82,239,.07)',
    chipLine: 'rgba(10,82,239,.22)',
    logo: '/anc-wordmark-blue.png',
    green: '#1FA35C',
    amber: '#B97A0B',
  },
} as const

type ThemeKey = keyof typeof THEMES

export default function HubPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<HubData | null>(null)
  const [error, setError] = useState(false)
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})
  // Device-level display choice on a tokenless-public page (shared links have
  // many viewers, so this intentionally does NOT persist to the token row).
  const [theme, setTheme] = useState<ThemeKey>('dark')

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('anc-hub-theme')
      if (saved === 'light' || saved === 'dark') setTheme(saved)
    } catch { /* private browsing */ }
  }, [])

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try { window.localStorage.setItem('anc-hub-theme', next) } catch { /* private browsing */ }
      return next
    })
  }

  useEffect(() => {
    fetch(`/api/hub/${params.token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError(true))
  }, [params.token])

  const firstName = useMemo(() => data?.person.name.split(' ')[0] || '', [data])
  const greeting = useMemo(() => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }, [])

  const t = THEMES[theme]

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: t.bg, color: t.muted, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        This link isn&apos;t active. Ask Ahmad for a fresh one.
      </div>
    )
  }

  const kpiItems = data
    ? [
        { label: 'Opportunities in CRM', value: data.kpis.opportunities },
        { label: 'Open service tickets', value: data.kpis.openTickets },
        { label: 'Events · next 7 days', value: data.kpis.eventsNext7Days },
        { label: 'Marketing contacts', value: data.kpis.marketingContacts },
        { label: 'Emails delivered', value: data.kpis.emailsDelivered },
      ].filter((k) => k.value != null)
    : []

  const eyebrowStyle = {
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: 11.5,
    letterSpacing: '.3em',
    textTransform: 'uppercase' as const,
    color: t.accent,
  }

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.ink, fontFamily: 'Inter, system-ui, sans-serif', transition: 'background .25s ease, color .25s ease' }}>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.logo} alt="ANC" style={{ height: 26 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={eyebrowStyle}>{data?.classificationLabel || 'Leadership'}</div>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{
                background: t.surface,
                color: t.muted,
                border: `1px solid ${t.line}`,
                borderRadius: 999,
                width: 34,
                height: 34,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: 15,
                lineHeight: 1,
              }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 44 }}>
          <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>
            {data ? (firstName && firstName !== 'Leadership' ? `${greeting}, ${firstName}.` : `${greeting}.`) : 'Loading…'}
          </div>
          <div style={{ color: t.muted, marginTop: 8, fontSize: 15, lineHeight: 1.6, maxWidth: 640 }}>
            Everything ANC runs on, in one place — what each platform does, whether it&apos;s healthy right now, what changed recently, and your own access to all of it.
          </div>
        </div>

        {/* KPIs */}
        {kpiItems.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(160px, 1fr))`, gap: 12, marginTop: 36 }}>
            {kpiItems.map((k) => (
              <div key={k.label} style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14, padding: '18px 20px' }}>
                <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 26, fontWeight: 700 }}>
                  {Number(k.value).toLocaleString()}
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: t.faint, marginTop: 6 }}>
                  {k.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* platform categories */}
        {data &&
          CATEGORY_ORDER.map((cat) => {
            const items = data.platforms.filter((p) => p.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} style={{ marginTop: 44 }}>
                <div style={eyebrowStyle}>{cat}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14, marginTop: 14 }}>
                  {items.map((p) => (
                    <a
                      key={p.key}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, padding: 22, textDecoration: 'none', color: 'inherit', display: 'block' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 18, fontWeight: 600 }}>{p.name}</div>
                        <span
                          title={p.health ? (p.health.ok ? 'Healthy' : 'Attention') : 'Unknown'}
                          style={{
                            width: 9,
                            height: 9,
                            borderRadius: 99,
                            background: p.health ? (p.health.ok ? t.green : t.amber) : t.faint,
                            boxShadow: p.health?.ok && theme === 'dark' ? '0 0 8px rgba(70,213,136,.6)' : 'none',
                            display: 'inline-block',
                          }}
                        />
                      </div>
                      <div style={{ color: t.muted, fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{p.description}</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                        {p.capabilities.map((c) => (
                          <span key={c} style={{ fontSize: 11.5, color: t.muted, background: t.chipBg, border: `1px solid ${t.chipLine}`, borderRadius: 999, padding: '3px 10px' }}>
                            {c}
                          </span>
                        ))}
                      </div>
                      <div style={{ marginTop: 16, fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: t.linkText }}>Open →</div>
                    </a>
                  ))}
                </div>
              </div>
            )
          })}

        {/* what's new */}
        {data && data.feed.length > 0 && (
          <div style={{ marginTop: 52 }}>
            <div style={eyebrowStyle}>What&apos;s new</div>
            <div style={{ marginTop: 14, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, overflow: 'hidden' }}>
              {data.feed.map((f, i) => (
                <div key={i} style={{ padding: '16px 22px', borderTop: i ? `1px solid ${t.lineSoft}` : 'none', display: 'flex', gap: 16, alignItems: 'baseline' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 11, color: t.faint, whiteSpace: 'nowrap' }}>
                    {new Date(f.entry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{f.title}</div>
                    {f.detail && <div style={{ fontSize: 13, color: t.muted, marginTop: 3, lineHeight: 1.5 }}>{f.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* your access */}
        {data && data.logins.length > 0 && (
          <div style={{ marginTop: 52 }}>
            <div style={eyebrowStyle}>Your access</div>
            <div style={{ marginTop: 14, background: t.surface, border: `1px solid ${t.line}`, borderRadius: 16, overflow: 'hidden' }}>
              {data.logins.map((l, i) => (
                <div key={i} style={{ padding: '16px 22px', borderTop: i ? `1px solid ${t.lineSoft}` : 'none', display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{l.platform}</div>
                    <div style={{ fontSize: 12.5, color: t.muted, marginTop: 2 }}>
                      {l.email ? `Sign in as ${l.email}` : ''}
                      {l.note ? (l.email ? ' — ' : '') + l.note : ''}
                    </div>
                  </div>
                  {l.password && (
                    <button
                      onClick={() => setRevealed((r) => ({ ...r, [i]: !r[i] }))}
                      style={{ background: revealed[i] ? t.surface2 : '#0A52EF', color: revealed[i] ? t.ink : '#fff', border: 'none', borderRadius: 999, padding: '7px 16px', fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, cursor: 'pointer' }}
                    >
                      {revealed[i] ? l.password : 'Show password'}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: t.faint, marginTop: 10 }}>
              This page is personal to you — the link works only for {data.person.name}. Keep it private.
            </div>
          </div>
        )}

        <div style={{ marginTop: 64, textAlign: 'center', fontSize: 12, color: t.faint }}>
          Built for the big picture · updates live · questions go to Ahmad
        </div>
      </div>
    </div>
  )
}
