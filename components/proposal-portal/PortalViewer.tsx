'use client'

import { modulesForRecipe } from '@/lib/proposal-portal/recipes'
import {
  DEFAULT_PORTAL_DATA,
  type PortalDocument,
  type PortalModuleId,
} from '@/lib/proposal-portal/types'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { clamp01, eo3, lerp, sm, type PortalTheme } from './scroll-math'
import './portal.css'

type PortalViewerProps = {
  document?: Partial<PortalDocument>
  embedded?: boolean
  showHud?: boolean
  focusModule?: PortalModuleId
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

type PortalExperienceSection = {
  id: PortalModuleId
  label: string
}

function splitClientName(name: string) {
  const parts = name.trim().split(/\s+/)
  return { first: parts[0] ?? name, rest: parts.slice(1).join(' ') || 'Arena' }
}

export function PortalViewer({
  document: doc,
  embedded = false,
  showHud = true,
  focusModule,
}: PortalViewerProps) {
  const merged = useMemo<PortalDocument>(() => {
    const recipe = doc?.recipe ?? 'service-portal'
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
  const portalStyle = useMemo(
    () => ({
      '--blue': d.brandPrimary || '#0a52eb',
      '--bright': d.brandAccent || '#2f74ff',
      '--cyan': d.brandAccent || '#03b4ff',
      '--glow': d.brandAccent || '#5b97ff',
      '--acc': d.brandAccent || 'var(--cyan)',
    }) as CSSProperties,
    [d.brandPrimary, d.brandAccent],
  )
  const names = splitClientName(d.clientName)
  const moduleKey = merged.enabledModules.join(',')
  const hasDealDeck = has('deal-deck')
  const experienceSections = useMemo<PortalExperienceSection[]>(
    () => ([
      { id: 'customer-portal', label: 'Overview' },
      { id: 'tickets', label: 'Requests' },
      { id: 'service-health', label: 'Service Health' },
      { id: 'ai-diagnosis', label: 'AI Diagnosis' },
      { id: 'documents', label: 'Documents' },
      { id: 'approvals', label: 'Approvals' },
      { id: 'reports-qbr', label: 'Reports' },
      { id: 'onboarding', label: 'Orientation' },
    ] satisfies PortalExperienceSection[]).filter((section) => has(section.id)),
    [moduleKey],
  )
  const [activeSection, setActiveSection] = useState<PortalModuleId>('customer-portal')

  useEffect(() => {
    if (!experienceSections.some((section) => section.id === activeSection)) {
      setActiveSection(experienceSections[0]?.id ?? 'customer-portal')
    }
  }, [activeSection, experienceSections])

  useEffect(() => {
    if (focusModule && experienceSections.some((section) => section.id === focusModule)) {
      setActiveSection(focusModule)
    }
  }, [focusModule, experienceSections])

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
      if (hasDealDeck) {
        defs.push({
          el: root.querySelector('#portal-sc-hero') as HTMLElement,
          theme: 'dark',
          label: '01 — DEAL DECK',
          update: updateHero,
        })
        defs.push({
          el: root.querySelector('#portal-sc-river-1') as HTMLElement,
          theme: 'dark',
          label: 'THE VISION',
          update: (p) => updateRiver(river1Ref.current, p),
        })
        defs.push({
          el: root.querySelector('#portal-sc-ba') as HTMLElement,
          theme: 'light',
          label: '02 — PROOF',
          update: updateBa,
        })
        defs.push({
          el: root.querySelector('#portal-sc-river-2') as HTMLElement,
          theme: 'light',
          label: 'THE PROGRAM',
          update: (p) => updateRiver(river2Ref.current, p),
        })
        defs.push({
          el: root.querySelector('#portal-sc-stinger') as HTMLElement,
          theme: 'void',
          label: '03 — CLOSE',
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
  const embeddedClass = embedded ? 'portal-embedded' : ''

  return (
    <div ref={rootRef} className={`portal-demo ${kineticClass} ${embeddedClass}`} data-theme="dark" style={portalStyle}>
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
            <div className="portal-hud-bl" ref={actRef}>01 — CLIENT PORTAL</div>
            <div className="portal-hud-br" ref={pctRef}>000%</div>
          </header>
          <div className="portal-prog" ref={progRef} aria-hidden="true" />
        </>
      )}
      <main>
        {hasDealDeck && (
          <section className="portal-pin" id="portal-sc-hero" style={kinetic ? { ['--track-vh' as string]: '340vh' } : undefined}>
            <div className={kinetic ? 'portal-pin-track' : undefined}>
              <div className={kinetic ? 'portal-pin-sticky' : undefined}>
                <div className="portal-pin-stage" style={{ minHeight: kinetic ? undefined : '100vh' }}>
                  <div ref={heroBgRef} className="portal-hero-bg" style={{ backgroundImage: `url(${d.heroImage})` }} />
                  <div className="portal-hero-scrim" />
                  <div className="portal-hero-content">
                    <p ref={heroEyebrowRef} className="portal-hero-eyebrow">ANC · Deal Deck</p>
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
        {hasDealDeck && (
          <section className="portal-river" id="portal-sc-river-1" ref={river1Ref}>
            <p className="portal-river-eyebrow">The vision</p>
            <p className="portal-river-copy">{d.visionCopy}</p>
          </section>
        )}
        {hasDealDeck && (
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
        {hasDealDeck && (
          <section className="portal-river" id="portal-sc-river-2" ref={river2Ref}>
            <p className="portal-river-eyebrow">The program</p>
            <p className="portal-river-copy">{d.subtitle}. {d.programCopy}</p>
          </section>
        )}
        {hasDealDeck && (
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
        {experienceSections.length > 0 && (
          <section className="portal-app-section">
            <div className="portal-app-shell">
              <aside className="portal-app-side">
                <div className="portal-app-side-brand">
                  <img src="/ANC_Logo_2023_white.png" alt="" />
                  <span>ANC Portal</span>
                </div>
                <div className="portal-app-side-client">{d.clientName}</div>
                <nav className="portal-app-nav" aria-label="Client portal preview sections">
                  {experienceSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className={activeSection === section.id ? 'is-active' : ''}
                      onClick={() => setActiveSection(section.id)}
                    >
                      {section.label}
                    </button>
                  ))}
                </nav>
                <div className="portal-app-support">
                  <span>Service contact</span>
                  <strong>ANC Support Desk</strong>
                  <a href="mailto:support@ancsports.net">support@ancsports.net</a>
                </div>
              </aside>
              <div className="portal-app-main">
                <header className="portal-app-topbar">
                  <div>
                    <p>{merged.recipe === 'issue-intake' ? 'Issue intake portal' : 'Client service portal'}</p>
                    <h2>{activeSection === 'customer-portal' ? `Welcome back, ${names.first}` : experienceSections.find((section) => section.id === activeSection)?.label}</h2>
                  </div>
                  <button type="button" onClick={() => setActiveSection(has('tickets') ? 'tickets' : 'customer-portal')}>
                    New request
                  </button>
                </header>
                <PortalExperiencePanel
                  active={activeSection}
                  clientName={d.clientName}
                  hasModule={has}
                  setActive={setActiveSection}
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

function PortalExperiencePanel({
  active,
  clientName,
  hasModule,
  setActive,
}: {
  active: PortalModuleId
  clientName: string
  hasModule: (id: PortalModuleId) => boolean
  setActive: (id: PortalModuleId) => void
}) {
  if (active === 'tickets') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-grid two">
          <div className="portal-app-card accent">
            <p className="portal-app-kicker">New request</p>
            <h3>Tell ANC what is happening</h3>
            <label>
              Issue summary
              <input value="North ribbon board has intermittent black panels" readOnly />
            </label>
            <label>
              Location
              <input value="Main bowl / north end" readOnly />
            </label>
            <div className="portal-app-upload">
              <span>Photo attached</span>
              <strong>display-panel-photo.jpg</strong>
            </div>
            <button type="button">Submit to ANC</button>
          </div>
          <div className="portal-app-card">
            <p className="portal-app-kicker">Open cases</p>
            <TicketRow title="North ribbon board intermittent panels" status="In progress" tone="work" />
            <TicketRow title="Content playback timing question" status="Waiting on client" tone="wait" />
            <TicketRow title="Suite fascia calibration" status="Resolved" tone="done" />
          </div>
        </div>
      </div>
    )
  }

  if (active === 'service-health') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-health">
          <div>
            <p className="portal-app-kicker">Venue status</p>
            <h3>{clientName} systems are service-ready</h3>
            <p>ANC is tracking open requests, display health, maintenance history, and event-readiness in one place.</p>
          </div>
          <div className="portal-app-score">96%</div>
        </div>
        <div className="portal-app-grid three">
          <Metric label="Displays monitored" value="18" />
          <Metric label="Open risks" value="2" />
          <Metric label="Last inspection" value="Jun 14" />
        </div>
        <div className="portal-app-card">
          <p className="portal-app-kicker">Active watchlist</p>
          <TicketRow title="Ribbon board cabinet temperature trending high" status="Watching" tone="wait" />
          <TicketRow title="Control-room processor firmware review" status="Scheduled" tone="work" />
        </div>
      </div>
    )
  }

  if (active === 'ai-diagnosis') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-grid two">
          <div className="portal-app-card accent">
            <p className="portal-app-kicker">First line of defense</p>
            <h3>Upload a display photo</h3>
            <div className="portal-app-drop">
              <span>Drop photo here</span>
              <strong>or choose from device</strong>
            </div>
            <button type="button">Run diagnosis</button>
          </div>
          <div className="portal-app-card">
            <p className="portal-app-kicker">AI readout</p>
            <h3>Likely LED module data issue</h3>
            <p className="portal-app-muted">Matched against prior service notes and common display symptoms before the ticket reaches the ANC team.</p>
            <ul className="portal-app-checks">
              <li>Check cabinet receiving card</li>
              <li>Attach photo and venue location</li>
              <li>Route to service support with high priority</li>
            </ul>
          </div>
        </div>
      </div>
    )
  }

  if (active === 'documents') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-grid three">
          <DocumentCard title="Monthly Service Report" meta="PDF · Jun 2026" />
          <DocumentCard title="Display Layout Drawings" meta="Package · Current" />
          <DocumentCard title="Approved Creative Specs" meta="Reference · Updated" />
        </div>
      </div>
    )
  }

  if (active === 'approvals') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-card">
          <p className="portal-app-kicker">Approval queue</p>
          <TicketRow title="Main concourse proof package" status="Needs review" tone="wait" />
          <TicketRow title="LED ribbon creative template" status="Approved" tone="done" />
          <TicketRow title="Scope change: sponsor rotation" status="ANC review" tone="work" />
        </div>
      </div>
    )
  }

  if (active === 'reports-qbr') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-grid three">
          <Metric label="Requests resolved" value="24" />
          <Metric label="Avg response" value="1.8h" />
          <Metric label="Events supported" value="12" />
        </div>
        <div className="portal-app-card">
          <p className="portal-app-kicker">Executive summary</p>
          <h3>Service volume is stable and response time is ahead of target.</h3>
          <p className="portal-app-muted">The monthly readout combines ticket trends, completed work, open risks, and renewal-ready proof.</p>
        </div>
      </div>
    )
  }

  if (active === 'onboarding') {
    return (
      <div className="portal-app-panel">
        <div className="portal-app-grid three">
          <DocumentCard title="How to file a request" meta="Portal guide" />
          <DocumentCard title="Service scope" meta="What ANC covers" />
          <DocumentCard title="Escalation path" meta="Who gets notified" />
        </div>
      </div>
    )
  }

  return (
    <div className="portal-app-panel">
      <div className="portal-app-hero">
        <div>
          <p className="portal-app-kicker">Overview</p>
          <h3>{clientName}</h3>
          <p>Requests, venue health, documents, and ANC service activity are together in one client-facing workspace.</p>
        </div>
        <button type="button" onClick={() => setActive(hasModule('tickets') ? 'tickets' : 'documents')}>Create request</button>
      </div>
      <div className="portal-app-grid three">
        <Metric label="Open requests" value={hasModule('tickets') ? '2' : '0'} />
        <Metric label="Venues" value="2" />
        <Metric label="Service status" value="Green" />
      </div>
      <div className="portal-app-grid two">
        <div className="portal-app-card">
          <p className="portal-app-kicker">Recent activity</p>
          <TicketRow title="ANC reviewed north ribbon board photo" status="Today" tone="work" />
          <TicketRow title="June service report posted" status="Yesterday" tone="done" />
          <TicketRow title="Event readiness check completed" status="Jun 14" tone="done" />
        </div>
        <div className="portal-app-card">
          <p className="portal-app-kicker">Your ANC team</p>
          <h3>Support Desk</h3>
          <p className="portal-app-muted">Service support, venue operations, and escalation contacts stay visible without digging through email.</p>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="portal-app-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

function TicketRow({ title, status, tone }: { title: string; status: string; tone: 'work' | 'wait' | 'done' }) {
  return (
    <div className="portal-app-row">
      <span className={`portal-app-dot ${tone}`} />
      <strong>{title}</strong>
      <em>{status}</em>
    </div>
  )
}

function DocumentCard({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="portal-app-card doc">
      <p className="portal-app-kicker">{meta}</p>
      <h3>{title}</h3>
      <button type="button">Open</button>
    </div>
  )
}
