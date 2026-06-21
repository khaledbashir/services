'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import type { ShowcaseMapPoint } from '@/components/showcase-live-map'

// Map is leaflet-based — must only render client-side.
const ShowcaseLiveMap = dynamic(() => import('@/components/showcase-live-map'), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-3xl bg-white/[0.03]" />,
})

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
    allTimeEvents: number
    ytdEvents: number
    last30Events: number
    venues: number
    venuesWithEvents: number
    states: number
    markets: number
    year: number
  }
  tonight: { events: number; venues: number; states: number; list: TonightEvent[] }
  mapPoints: ShowcaseMapPoint[]
}

const NAVY = '#1E2761'
const CORAL = '#F96167'
const YELLOW = '#F9E795'

function useCountUp(target: number, duration = 1400) {
  const [value, setValue] = useState(0)
  const started = useRef(false)
  useEffect(() => {
    if (started.current) {
      setValue(target)
      return
    }
    started.current = true
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      // easeOutExpo
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p)
      setValue(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  const n = useCountUp(value)
  return (
    <div className="flex flex-col">
      <span
        className="font-serif text-5xl font-black leading-none tracking-tight sm:text-6xl"
        style={{ color: accent ? CORAL : '#fff' }}
      >
        {n.toLocaleString()}
      </span>
      <span className="mt-2 text-xs font-bold uppercase tracking-[0.22em] text-white/55">{label}</span>
    </div>
  )
}

export default function LiveShowcaseClient() {
  const [data, setData] = useState<ShowcaseData | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    const load = async () => {
      try {
        const r = await fetch('/api/live-showcase', { cache: 'no-store' })
        const j = await r.json()
        if (alive && j?.ok) {
          setData(j)
          setError(false)
        } else if (alive) {
          setError(true)
        }
      } catch {
        if (alive) setError(true)
      }
    }
    load()
    const iv = setInterval(load, 60_000) // keep the page live without a reload
    return () => {
      alive = false
      clearInterval(iv)
    }
  }, [])

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  })

  return (
    <div
      className="min-h-screen w-full text-white"
      style={{
        background: `radial-gradient(1200px 600px at 20% -10%, rgba(249,97,103,0.18), transparent 55%),
                     radial-gradient(1000px 700px at 100% 0%, rgba(30,39,97,0.9), transparent 60%),
                     linear-gradient(180deg, #0B0E24 0%, #0A0C1C 100%)`,
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-10 sm:py-12">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7 w-auto" />
            <span className="hidden text-xs font-bold uppercase tracking-[0.25em] text-white/45 sm:inline">
              Service Operations
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ background: CORAL }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: CORAL }} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">Live</span>
          </div>
        </div>

        {/* Hero — cumulative scale */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="mt-16 sm:mt-24"
        >
          <p className="text-sm font-bold uppercase tracking-[0.35em]" style={{ color: YELLOW }}>
            Every night, across America
          </p>
          <h1 className="mt-5 max-w-4xl font-serif text-[3.25rem] font-black leading-[0.95] tracking-[-0.04em] sm:text-7xl md:text-8xl">
            {data ? (
              <>
                <span style={{ color: CORAL }}>{data.cumulative.ytdEvents.toLocaleString()}</span> events
                <br />
                coordinated in {data.cumulative.year}.
              </>
            ) : (
              <span className="opacity-40">Loading the national slate…</span>
            )}
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/65 sm:text-xl">
            One platform runs every game, concert, and show ANC supports — from the morning schedule to
            the final post-game close-out. This is that operation, live.
          </p>

          {data && (
            <div className="mt-12 grid grid-cols-2 gap-8 sm:flex sm:flex-wrap sm:gap-16">
              <Stat value={data.cumulative.allTimeEvents} label="Events all-time" />
              <Stat value={data.cumulative.venues} label="Venues in network" />
              <Stat value={data.cumulative.states} label="States covered" />
              <Stat value={data.cumulative.markets} label="Markets" />
            </div>
          )}
        </motion.section>

        {/* Live tonight band */}
        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="mt-24 grid grid-cols-1 gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center"
        >
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: YELLOW }}>
              Live right now · {todayLabel}
            </p>
            {data ? (
              <>
                <div className="mt-6 flex items-end gap-4">
                  <span className="font-serif text-7xl font-black leading-none" style={{ color: '#fff' }}>
                    {data.tonight.events}
                  </span>
                  <span className="mb-2 text-xl font-semibold text-white/70">
                    events tonight
                  </span>
                </div>
                <p className="mt-4 text-lg text-white/60">
                  across <span className="font-bold text-white">{data.tonight.states} states</span> and{' '}
                  <span className="font-bold text-white">{data.tonight.venues} venues</span> — coordinated
                  in real time.
                </p>
              </>
            ) : (
              <div className="mt-6 h-24 w-48 animate-pulse rounded-2xl bg-white/[0.04]" />
            )}
          </div>

          <div className="relative h-[340px] overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] sm:h-[440px]">
            {data && <ShowcaseLiveMap points={data.mapPoints} />}
            <div className="pointer-events-none absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 backdrop-blur">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: CORAL }} />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80">
                Live tonight
              </span>
            </div>
          </div>
        </motion.section>

        {/* Tonight's slate — the proof */}
        {data && data.tonight.list.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mt-24"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif text-3xl font-black tracking-tight sm:text-4xl">Tonight’s slate</h2>
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">
                {data.tonight.list.length} events
              </span>
            </div>
            <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {data.tonight.list.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <div className="mt-0.5 flex w-20 shrink-0 flex-col">
                    <span className="text-sm font-bold" style={{ color: ev.needs_staffing ? CORAL : '#8E97D6' }}>
                      {ev.start_et}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                      {ev.needs_staffing ? 'Live event' : 'Coverage'}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-white/90">{ev.summary}</p>
                    <p className="mt-0.5 truncate text-sm text-white/50">{ev.venue_name || 'ANC venue'}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Footer */}
        <footer className="mt-24 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-5 w-auto opacity-70" />
            <span className="text-sm text-white/45">ANC Service Operations</span>
          </div>
          <span className="text-xs text-white/35">
            {error
              ? 'Reconnecting to live operations…'
              : data
              ? `Figures update live · last refreshed ${new Date(data.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET`
              : 'Connecting to live operations…'}
          </span>
        </footer>
      </div>
    </div>
  )
}
