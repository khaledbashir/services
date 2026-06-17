'use client'

import { modulesForRecipe } from '@/lib/proposal-portal/recipes'
import {
  DEFAULT_PORTAL_DATA,
  type PortalDocument,
  type PortalModuleId,
} from '@/lib/proposal-portal/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clamp01, eo3, lerp, sm, type PortalTheme } from './scroll-math'
import './portal.css'

type PortalViewerProps = {
  document?: Partial<PortalDocument>
  embedded?: boolean
  showHud?: boolean
}

type SceneMeta = {
  el: HTMLElement
  start: number
  end: number
  theme: PortalTheme
  label: string
  prev: number
  update: (p: number) => void
}

function splitClientName(name: string) {
  const parts = name.trim().split(/\s+/)
  return { first: parts[0] ?? name, rest: parts.slice(1).join(' ') || 'Arena' }
}

export function PortalViewer({
  document: doc,
  embedded = false,
  showHud = true,
}: PortalViewerProps) {
  const merged = useMemo<PortalDocument>(() => {
    const recipe = doc?.recipe ?? 'natalia'
    return {
      title: doc?.title ?? 'Client Portal',
      mode: doc?.mode ?? 'PROPOSAL',
      recipe,
      enabledModules:
        doc?.enabledModules?.length ? doc.enabledModules : modulesForRecipe(recipe),
      data: { ...DEFAULT_PORTAL_DATA, ...doc?.data },
      isPublic: doc?.isPublic,
      id: doc?.id,
    }
  }, [doc])

  const enabled = useMemo(
    () => new Set(merged.enabledModules),
    [merged.enabledModules],
  )
  const has = (id: PortalModuleId) => enabled.has(id)
  const d = merged.data
  const names = splitClientName(d.clientName)
  const moduleKey = merged.enabledModules.join(',')

  const rootRef = useRef<HTMLDivElement>(null)
  const progRef = useRef<HTMLDivElement>(null)
  const actRef = useRef<HTMLDivElement>(null)
  const pctRef = useRef<HTMLDivElement>(null)
  const heroBgRef = useRef<HTMLDivElement>(null)
  const heroEyebrowRef = useRef<HTMLParagraphElement>(null)
  const heroTitleRef = useRef<HTMLHeadingElement>(null)
  const heroLeadRef = useRef<HTMLParagraphElement>(null)
  const heroPlateRef = useRef<HTMLDivElement>(null)
  const heroCueRef = useRef<HTMLDivElement>(null)
  const baWrapRef = useRef<HTMLDivElement>(null)
  const baBeforeRef = useRef<HTMLDivElement>(null)
  const baHandleRef = useRef<HTMLDivElement>(null)
  const baCopyRef = useRef<HTMLDivElement>(null)
  const stingerKickerRef = useRef<HTMLParagraphElement>(null)
  const stingerPriceRef = useRef<HTMLDivElement>(null)
  const stingerLabelRef = useRef<HTMLParagraphElement>(null)
  const stingerCtaRef = useRef<HTMLAnchorElement>(null)
  const river1Ref = useRef<HTMLElement>(null)
  const river2Ref = useRef<HTMLElement>(null)

  const [kinetic, setKinetic] = useState(false)

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduced) {
      setKinetic(true)
      if (!embedded) document.documentElement.classList.add('portal-kinetic-root')
    }
    return () => {
      if (!embedded) document.documentElement.classList.remove('portal-kinetic-root')
    }
  }, [embedded])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !kinetic) return

    let raf = 0
    let vh = window.innerHeight
    let docH = 1
    let curTheme: PortalTheme | '' = ''
    let scenes: SceneMeta[] = []

    const updateHero = (p: number) => {
      const bg = heroBgRef.current
      const eyebrow = heroEyebrowRef.current
      const title = heroTitleRef.current
      const lead = heroLeadRef.current
      const plate = heroPlateRef.current
      const cue = heroCueRef.current
      if (!bg || !eyebrow || !title || !lead || !plate) return
      const zoom = lerp(1.18, 1, eo3(sm(p, 0, 0.45)))
      const pan = lerp(-4, 0, eo3(sm(p, 0, 0.55)))
      bg.style.transform = `scale(${zoom}) translate3d(${pan}%, 0, 0)`
      eyebrow.style.opacity = String(eo3(sm(p, 0.08, 0.28)))
      eyebrow.style.transform = `translateY(${lerp(24, 0, eo3(sm(p, 0.08, 0.28)))}px)`
      const t2 = eo3(sm(p, 0.18, 0.42))
      title.style.opacity = String(t2)
      title.style.transform = `translateY(${lerp(40, 0, t2)}px) scale(${lerp(0.94, 1, t2)})`
      const t3 = eo3(sm(p, 0.32, 0.52))
      lead.style.opacity = String(t3)
      lead.style.transform = `translateY(${lerp(28, 0, t3)}px)`
      plate.style.opacity = String(eo3(sm(p, 0.48, 0.62)) * 0.7)
      if (cue) cue.style.opacity = String(1 - eo3(sm(p, 0.55, 0.72)))
    }

    const updateBa = (p: number) => {
      const before = baBeforeRef.current
      const handle = baHandleRef.current
      const copy = baCopyRef.current
      const wrap = baWrapRef.current
      if (!before || !handle || !copy || !wrap) return
      const cut = lerp(78, 22, eo3(sm(p, 0.12, 0.88)))
      wrap.style.setProperty('--ba-cut', `${cut}%`)
      before.style.clipPath = `inset(0 ${cut}% 0 0)`
      const copyIn = eo3(sm(p, 0.05, 0.25))
      copy.style.opacity = String(copyIn)
      copy.style.transform = `translateY(${lerp(32, 0, copyIn)}px)`
    }

    const updateStinger = (p: number) => {
      const kicker = stingerKickerRef.current
      const price = stingerPriceRef.current
      const label = stingerLabelRef.current
      const cta = stingerCtaRef.current
      if (!kicker || !price || !label || !cta) return
      const k = eo3(sm(p, 0.18, 0.32))
      kicker.style.opacity = String(k)
      const priceP = eo3(sm(p, 0.28, 0.52))
      price.style.opacity = String(priceP)
      price.style.transform = `scale(${lerp(1.35, 1, priceP)}) translateZ(0)`
      const l = eo3(sm(p, 0.48, 0.64))
      label.style.opacity = String(l)
      const c = eo3(sm(p, 0.62, 0.78))
      cta.style.opacity = String(c)
      cta.style.transform = `translateY(${lerp(30, 0, c)}px)`
      cta.style.pointerEvents = c > 0.5 ? 'auto' : 'none'
    }

    const updateRiver = (el: HTMLElement | null, p: number) => {
      if (!el) return
      const copy = el.querySelector('.portal-river-copy') as HTMLElement | null
      if (!copy) return
      const t = eo3(clamp01(p))
      copy.style.opacity = String(lerp(0.35, 0.92, t))
      copy.style.transform = `translateY(${lerp(24, 0, t)}px)`
    }

    const measure = () => {
      vh = window.innerHeight
      const y = window.scrollY
      const defs: Omit<SceneMeta, 'start' | 'end' | 'prev'>[] = []
      if (has('venue-hero')) {
        defs.push({
          el: root.querySelector('#portal-sc-hero') as HTMLElement,
          theme: 'dark',
          label: '01 — VENUE HERO',
          update: updateHero,
        })
      }
      if (has('solution-story')) {
        defs.push({
          el: root.querySelector('#portal-sc-river-1') as HTMLElement,
          theme: 'dark',
          label: 'THE VISION',
          update: (p) => updateRiver(river1Ref.current, p),
        })
      }
      if (has('before-after')) {
        defs.push({
          el: root.querySelector('#portal-sc-ba') as HTMLElement,
          theme: 'light',
          label: '02 — BEFORE / AFTER',
          update: updateBa,
        })
      }
      if (has('pricing')) {
        defs.push({
          el: root.querySelector('#portal-sc-river-2') as HTMLElement,
          theme: 'light',
          label: 'THE PROGRAM',
          update: (p) => updateRiver(river2Ref.current, p),
        })
        defs.push({
          el: root.querySelector('#portal-sc-stinger') as HTMLElement,
          theme: 'void',
          label: '03 — INVESTMENT',
          update: updateStinger,
        })
      }
      scenes = defs
        .filter((s) => s.el)
        .map((s) => ({ ...s, start: 0, end: 0, prev: -1 }))
      for (const s of scenes) {
        const r = s.el.getBoundingClientRect()
        s.start = r.top + y
        s.end = s.start + Math.max(1, s.el.offsetHeight - vh)
      }
      docH = Math.max(1, document.documentElement.scrollHeight - vh)
    }

    const setTheme = (theme: PortalTheme) => {
      if (theme === curTheme) return
      curTheme = theme
      root.dataset.theme = theme
    }

    const render = (y: number) => {
      const global = clamp01(y / docH)
      if (progRef.current) progRef.current.style.transform = `scaleX(${global})`
      if (pctRef.current) pctRef.current.textContent = `${String(Math.round(global * 100)).padStart(3, '0')}%`
      let active = scenes[0]
      for (const s of scenes) {
        if (y >= s.start - 2) active = s
        const p = clamp01((y - s.start) / Math.max(1, s.end - s.start))
        if (Math.abs(p - s.prev) > 0.0008 || y === 0) {
          s.prev = p
          s.update(p)
        }
      }
      if (active) {
        setTheme(active.theme)
        if (actRef.current) actRef.current.textContent = active.label
      }
    }

    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => render(window.scrollY))
    }
    const onResize = () => {
      measure()
      render(window.scrollY)
    }

    measure()
    render(0)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [kinetic, moduleKey])

  const kineticClass = kinetic ? 'portal-kinetic' : ''

  return (
    <div ref={rootRef} className={`portal-demo ${kineticClass}`} data-theme="dark">
      <div className="portal-grain" aria-hidden="true" />
      <div className="portal-brand-mark" aria-hidden="true">
        <img src="/ANC_Logo_2023_white.png" alt="" />
        <span>ANC / Venue Technology</span>
      </div>
      {showHud && (
        <>
          <header className="portal-hud" aria-hidden="true">
            <div className="portal-hud-tl">ANC Client Portal</div>
            <div className="portal-hud-tr">{d.clientName}</div>
            <div className="portal-hud-bl" ref={actRef}>01 — VENUE HERO</div>
            <div className="portal-hud-br" ref={pctRef}>000%</div>
          </header>
          <div className="portal-prog" ref={progRef} aria-hidden="true" />
        </>
      )}
      <main>
        {has('venue-hero') && (
          <section className="portal-pin" id="portal-sc-hero" style={kinetic ? { ['--track-vh' as string]: '340vh' } : undefined}>
            <div className={kinetic ? 'portal-pin-track' : undefined}>
              <div className={kinetic ? 'portal-pin-sticky' : undefined}>
                <div className="portal-pin-stage" style={{ minHeight: kinetic ? undefined : '100vh' }}>
                  <div ref={heroBgRef} className="portal-hero-bg" style={{ backgroundImage: `url(${d.heroImage})` }} />
                  <div className="portal-hero-scrim" />
                  <div className="portal-hero-content">
                    <p ref={heroEyebrowRef} className="portal-hero-eyebrow">ANC · Venue Transformation</p>
                    <h1 ref={heroTitleRef} className="portal-hero-title">
                      <span className="outline">{names.first}</span>
                      <br />
                      {names.rest}
                    </h1>
                    <p ref={heroLeadRef} className="portal-hero-lead">
                      {d.subtitle}. Designed, built and owned by ANC — engineered to make every seat the best seat in the house.
                    </p>
                  </div>
                  <div ref={heroPlateRef} className="portal-hero-plate">{d.clientName} · {d.league}</div>
                  {kinetic && (
                    <div ref={heroCueRef} className="portal-scroll-cue" aria-hidden="true">
                      <span className="portal-scroll-cue-line" />
                      <span>Scroll to explore</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
        {has('solution-story') && (
          <section className="portal-river" id="portal-sc-river-1" ref={river1Ref}>
            <p className="portal-river-eyebrow">The vision</p>
            <p className="portal-river-copy">{d.visionCopy}</p>
          </section>
        )}
        {has('before-after') && (
          <section className="portal-pin" id="portal-sc-ba" style={kinetic ? { ['--track-vh' as string]: '420vh' } : undefined}>
            <div className={kinetic ? 'portal-pin-track' : undefined}>
              <div className={kinetic ? 'portal-pin-sticky' : undefined}>
                <div className={`portal-pin-stage ${kinetic ? 'portal-ba-stage' : ''}`}>
                  <div ref={baCopyRef} className="portal-ba-copy">
                    <h2 className="portal-ba-headline">Centerhung</h2>
                    <p className="portal-ba-sub">Scroll to reveal the transformation — from house lights to game live.</p>
                  </div>
                  <div ref={baWrapRef} className="portal-ba-wrap" style={{ ['--ba-cut' as string]: '50%' }}>
                    <div className="portal-ba-layer portal-ba-after" style={{ backgroundImage: `url(${d.afterImage})` }} />
                    <div ref={baBeforeRef} className="portal-ba-layer portal-ba-before" style={{ backgroundImage: `url(${d.beforeImage})` }} />
                    <div ref={baHandleRef} className="portal-ba-handle" />
                    <span className="portal-ba-pill portal-ba-pill-l">Before</span>
                    <span className="portal-ba-pill portal-ba-pill-r">After · Live</span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {has('pricing') && (
          <section className="portal-river" id="portal-sc-river-2" ref={river2Ref}>
            <p className="portal-river-eyebrow">The program</p>
            <p className="portal-river-copy">{d.subtitle}. {d.programCopy}</p>
          </section>
        )}
        {has('pricing') && (
          <section className="portal-pin" id="portal-sc-stinger" style={kinetic ? { ['--track-vh' as string]: '360vh' } : undefined}>
            <div className={kinetic ? 'portal-pin-track' : undefined}>
              <div className={kinetic ? 'portal-pin-sticky' : undefined}>
                <div className="portal-pin-stage" style={{ minHeight: kinetic ? undefined : '80vh' }}>
                  <div className="portal-stinger-inner">
                    <p ref={stingerKickerRef} className="portal-stinger-kicker">Investment summary · {d.clientName}</p>
                    <div ref={stingerPriceRef} className="portal-stinger-price">{d.investment}</div>
                    <p ref={stingerLabelRef} className="portal-stinger-label">{d.investmentLabel}</p>
                    <a ref={stingerCtaRef} className="portal-stinger-cta" href="mailto:proposals@ancsports.net">Schedule executive review</a>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}