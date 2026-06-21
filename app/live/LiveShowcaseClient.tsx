'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion, useScroll, useSpring, useInView } from 'framer-motion'
import type { ShowcaseMapPoint } from '@/components/showcase-live-map'

const ShowcaseLiveMap = dynamic(() => import('@/components/showcase-live-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-white/[0.02]" />,
})

const CORAL = '#F96167'
const YELLOW = '#F9E795'
const CREAM = '#F1EDE3'

type TonightEvent = {
  id: string
  summary: string
  venue_name: string | null
  start_et: string
  end_et: string
  needs_staffing: boolean
}

type ShowcaseData = {
  ok: boolean
  generatedAt: string
  cumulative: {
    allTimeEvents: number; ytdEvents: number; last30Events: number; last7Events: number
    venues: number; venuesWithEvents: number; states: number; markets: number; year: number
  }
  tonight: { events: number; venues: number; states: number; list: TonightEvent[] }
  topMarkets: { name: string; events: number }[]
  monthly: { mon: string; events: number }[]
  service: { ticketsTotal: number; ticketsResolved: number; ticketsOpen: number }
  mapPoints: ShowcaseMapPoint[]
}

/* ---------- primitives ---------- */

function Counter({ value, className, duration = 1500 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-12% 0px' })
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!inView) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setN(Math.round(value * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [inView, value, duration])
  return <span ref={ref} className={className}>{n.toLocaleString()}</span>
}

function Reveal({ children, y = 26, delay = 0, className }: any) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.75, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  )
}

function Slam({ children, className, delay = 0 }: any) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 1.14, filter: 'blur(10px)' }}
      whileInView={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

function ActLabel({ no, title }: { no: string; title: string }) {
  return (
    <Reveal>
      <p className="text-[11px] font-bold uppercase tracking-[0.5em]" style={{ color: CORAL }}>
        {no}
      </p>
      <h2 className="mt-4 text-5xl font-black uppercase leading-[0.9] tracking-tight sm:text-7xl kinetic-wide">
        {title}
      </h2>
    </Reveal>
  )
}

/* ---------- page ---------- */

export default function LiveShowcaseClient() {
  const [data, setData] = useState<ShowcaseData | null>(null)
  const [error, setError] = useState(false)
  const [clock, setClock] = useState('')

  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/live-showcase', { cache: 'no-store' })
        const j = await r.json()
        if (alive && j?.ok) { setData(j); setError(false) }
        else if (alive) setError(true)
      } catch { if (alive) setError(true) }
    }
    load()
    const iv = setInterval(load, 60_000)
    return () => { alive = false; clearInterval(iv) }
  }, [])

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/New_York' }))
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  })

  const c = data?.cumulative
  const resolvedPct = data?.service ? Math.round((data.service.ticketsResolved / Math.max(1, data.service.ticketsTotal)) * 100) : 0
  const monthlyMax = data ? Math.max(1, ...data.monthly.map((m) => m.events)) : 1
  const marketMax = data ? Math.max(1, ...data.topMarkets.map((m) => m.events)) : 1

  return (
    <div
      className="relative min-h-screen w-full overflow-x-clip text-white"
      style={{
        fontFamily: 'var(--font-anybody), ui-sans-serif, system-ui, sans-serif',
        background:
          'radial-gradient(1100px 620px at 18% -8%, rgba(249,97,103,0.16), transparent 55%), radial-gradient(900px 600px at 100% 4%, rgba(30,39,97,0.85), transparent 60%), linear-gradient(180deg, #070912 0%, #060810 100%)',
      }}
    >
      {/* frame chrome */}
      <div className="anc-grain" aria-hidden />
      <div className="anc-vignette" aria-hidden />

      {/* HUD */}
      <div className="pointer-events-none fixed inset-0 z-[70] mix-blend-difference">
        <div className="absolute left-5 top-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-white">
          <span>ANC · Service Operations</span>
        </div>
        <div className="absolute right-5 top-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-white kinetic-num">
          LIVE · {clock} ET
        </div>
        <div className="absolute bottom-4 left-5 hidden text-[10px] font-bold uppercase tracking-[0.28em] text-white sm:block">
          National Coverage
        </div>
        <div className="absolute bottom-4 right-5 text-[10px] font-bold uppercase tracking-[0.28em] text-white">
          Est. {c?.year ?? 2026}
        </div>
      </div>

      {/* scroll progress */}
      <motion.div className="fixed bottom-0 left-0 right-0 z-[80] h-[3px] origin-left" style={{ background: CORAL, scaleX: progress }} />

      {/* ============ 00 · LEADER ============ */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <Reveal>
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="mx-auto h-10 w-auto sm:h-12" />
        </Reveal>
        <Reveal delay={0.15}>
          <p className="mt-10 text-xs font-bold uppercase tracking-[0.6em] text-white/55">Service Operations</p>
        </Reveal>
        <motion.div
          className="mx-auto mt-7 h-[2px] w-44"
          style={{ background: CORAL }}
          initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1, delay: 0.5, ease: [0.65, 0, 0.3, 1] }}
        />
        <Reveal delay={0.5}>
          <p className="mt-7 max-w-md text-sm leading-relaxed text-white/45">
            A live national picture of what ANC runs — every event, every venue, every night.
          </p>
        </Reveal>
        <motion.div
          className="absolute bottom-10 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.34em] text-white/40">Scroll</span>
          <motion.div className="h-10 w-px" style={{ background: CORAL }}
            animate={{ scaleY: [0, 1, 0] }} transition={{ duration: 1.7, repeat: Infinity, ease: [0.7, 0, 0.3, 1] }} />
        </motion.div>
      </section>

      {/* ============ 01 · THESIS ============ */}
      <section className="relative flex min-h-screen flex-col justify-center px-6 sm:px-14">
        <Reveal>
          <p className="text-sm font-bold uppercase tracking-[0.4em]" style={{ color: YELLOW }}>
            Every night, across America
          </p>
        </Reveal>
        <h1 className="mt-7 max-w-5xl text-[3.4rem] font-black leading-[0.92] tracking-[-0.03em] sm:text-8xl md:text-9xl">
          <Slam>
            <span style={{ color: CORAL }} className="kinetic-num kinetic-wide">
              {c ? <Counter value={c.ytdEvents} /> : '—'}
            </span>
          </Slam>
          <Slam delay={0.1}>
            <span className="block kinetic-wide">events coordinated</span>
          </Slam>
          <Slam delay={0.18}>
            <span className="block kinetic-wide">in {c?.year ?? 2026}.</span>
          </Slam>
        </h1>
        <Reveal delay={0.2}>
          <p className="mt-9 max-w-2xl text-lg leading-relaxed text-white/60 sm:text-xl">
            One platform runs every game, concert, and show ANC supports — from the morning schedule to the final
            post-game close-out. This is that operation, live.
          </p>
        </Reveal>
      </section>

      {/* ============ ACT I · THE SCALE ============ */}
      <section className="relative px-6 py-28 sm:px-14">
        <ActLabel no="Act I" title="The Scale" />

        <div className="mt-20 grid grid-cols-2 gap-x-8 gap-y-16 sm:grid-cols-4">
          {[
            { v: c?.allTimeEvents ?? 0, l: 'Events all-time' },
            { v: c?.venues ?? 0, l: 'Venues in network' },
            { v: c?.states ?? 0, l: 'States covered' },
            { v: c?.markets ?? 0, l: 'Markets' },
          ].map((s, i) => (
            <Slam key={s.l} delay={i * 0.06} className="flex flex-col">
              <span className="text-5xl font-black leading-none tracking-tight sm:text-7xl kinetic-num kinetic-wide">
                <Counter value={s.v} />
              </span>
              <span className="mt-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">{s.l}</span>
            </Slam>
          ))}
        </div>

        {/* momentum curve */}
        {data && data.monthly.length > 0 && (
          <Reveal delay={0.1} className="mt-24">
            <div className="flex items-baseline justify-between">
              <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/50">
                {c?.year} momentum · events per month
              </p>
              <p className="text-[11px] font-bold uppercase tracking-[0.2em]" style={{ color: CORAL }}>
                {c ? <Counter value={c.last30Events} /> : '—'} in the last 30 days
              </p>
            </div>
            <div className="mt-6 flex h-44 items-end gap-1.5 sm:gap-3">
              {data.monthly.map((m, i) => {
                const h = Math.max(4, Math.round((m.events / monthlyMax) * 100))
                const peak = m.events === monthlyMax
                return (
                  <div key={i} className="flex flex-1 flex-col items-center justify-end gap-2">
                    <motion.div
                      className="w-full rounded-t-sm"
                      style={{ background: peak ? CORAL : 'rgba(126,136,190,0.5)' }}
                      initial={{ height: 0 }}
                      whileInView={{ height: `${h}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
                    />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white/35">{m.mon}</span>
                  </div>
                )
              })}
            </div>
          </Reveal>
        )}
      </section>

      {/* ============ ACT II · TONIGHT — THE MAP ============ */}
      <section className="relative px-6 pt-28 sm:px-14">
        <ActLabel no="Act II" title="Tonight, Live" />
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-2xl text-lg text-white/60">
            {todayLabel}. Each light is a venue ANC is running right now — drag, zoom, explore the night.
          </p>
        </Reveal>
      </section>

      <div className="relative mt-10 h-[78vh] w-full overflow-hidden border-y border-white/10">
        {data && <ShowcaseLiveMap points={data.mapPoints} interactive />}
        {/* overlay stat card — does not block map interaction */}
        <div className="pointer-events-none absolute left-5 top-5 z-[20] sm:left-10 sm:top-10">
          {data && (
            <Slam>
              <div className="flex items-end gap-3">
                <span className="text-7xl font-black leading-none kinetic-num kinetic-wide sm:text-8xl">
                  {data.tonight.events}
                </span>
                <span className="mb-2 text-base font-semibold uppercase tracking-[0.2em] text-white/70">events tonight</span>
              </div>
              <p className="mt-3 text-base text-white/65 sm:text-lg">
                across <span className="font-bold text-white">{data.tonight.states} states</span> ·{' '}
                <span className="font-bold text-white">{data.tonight.venues} venues</span>
              </p>
            </Slam>
          )}
        </div>
        <div className="pointer-events-none absolute bottom-5 left-5 z-[20] flex items-center gap-2 rounded-full bg-black/50 px-3 py-1.5 backdrop-blur sm:left-10">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CORAL }} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80">Live tonight</span>
        </div>
      </div>

      {/* ============ ACT III · THE SLATE ============ */}
      {data && data.tonight.list.length > 0 && (
        <section className="relative px-6 py-28 sm:px-14">
          <ActLabel no="Act III" title="Tonight's Slate" />
          <div className="mt-14 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.tonight.list.map((ev, i) => (
              <Reveal key={ev.id} delay={Math.min(i * 0.03, 0.4)}>
                <div className="flex h-full items-start gap-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
                  <div className="flex w-16 shrink-0 flex-col">
                    <span className="text-sm font-bold kinetic-num" style={{ color: ev.needs_staffing ? CORAL : '#8E97D6' }}>
                      {ev.start_et}
                    </span>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-white/35">
                      {ev.needs_staffing ? 'Live event' : 'Coverage'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold leading-tight text-white/90">{ev.summary}</p>
                    <p className="mt-1 truncate text-xs text-white/45">{ev.venue_name || 'ANC venue'}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ============ ACT IV · THE SERVICE DESK ============ */}
      {data && (
        <section className="relative px-6 py-28 sm:px-14">
          <ActLabel no="Act IV" title="The Service Desk" />
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-2xl text-lg text-white/60">
              When something needs attention at a venue, it's tracked, routed, and closed out — at scale.
            </p>
          </Reveal>
          <div className="mt-16 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-3">
            {[
              { v: data.service.ticketsTotal, l: 'Service tickets handled', accent: false, suffix: '' },
              { v: resolvedPct, l: 'Resolved', accent: true, suffix: '%' },
              { v: data.service.ticketsOpen, l: 'Open & actively managed', accent: false, suffix: '' },
            ].map((s, i) => (
              <Slam key={s.l} delay={i * 0.08} className="flex flex-col">
                <span className="text-6xl font-black leading-none tracking-tight sm:text-8xl kinetic-num kinetic-wide" style={{ color: s.accent ? CORAL : '#fff' }}>
                  <Counter value={s.v} />{s.suffix}
                </span>
                <span className="mt-3 text-[11px] font-bold uppercase tracking-[0.24em] text-white/50">{s.l}</span>
              </Slam>
            ))}
          </div>
        </section>
      )}

      {/* ============ REACH · MARKETS ============ */}
      {data && data.topMarkets.length > 0 && (
        <section className="relative px-6 py-28 sm:px-14">
          <ActLabel no="Reach" title="Coast to Coast" />
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-2xl text-lg text-white/60">Busiest markets this year by events coordinated.</p>
          </Reveal>
          <div className="mt-14 space-y-5">
            {data.topMarkets.map((m, i) => (
              <Reveal key={m.name} delay={i * 0.05}>
                <div className="flex items-center gap-5">
                  <span className="w-44 shrink-0 text-base font-bold uppercase tracking-wide text-white/85 sm:w-56 sm:text-lg">
                    {m.name}
                  </span>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                    <motion.div
                      className="h-full rounded-sm"
                      style={{ background: i === 0 ? CORAL : 'rgba(126,136,190,0.55)' }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${Math.round((m.events / marketMax) * 100)}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.9, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right text-base font-black kinetic-num sm:text-lg">{m.events}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* ============ CLOSE ============ */}
      <section className="relative flex min-h-[80vh] flex-col items-center justify-center px-6 text-center">
        <Reveal>
          <p className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: YELLOW }}>This runs</p>
        </Reveal>
        <Slam delay={0.1}>
          <h2 className="mt-5 text-6xl font-black uppercase leading-[0.9] tracking-tight sm:text-8xl md:text-9xl kinetic-wide">
            Every<br />night.
          </h2>
        </Slam>
        <Reveal delay={0.2}>
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="mx-auto mt-16 h-8 w-auto opacity-80" />
        </Reveal>
        <Reveal delay={0.3}>
          <p className="mt-5 text-sm text-white/45">ANC Service Operations</p>
          <p className="mt-1 text-xs text-white/30">
            {error
              ? 'Reconnecting to live operations…'
              : data
              ? `Figures update live · last refreshed ${new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
              : 'Connecting to live operations…'}
          </p>
        </Reveal>
      </section>
    </div>
  )
}
