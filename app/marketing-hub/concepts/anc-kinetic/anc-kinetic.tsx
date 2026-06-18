'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './anc-kinetic.module.css'

const acts = [
  {
    eyebrow: '01 / Win the room',
    title: 'Proposal',
    body: 'Turn venue vision, proof, scope, pricing, and approvals into one cinematic client-facing story.',
    metric: 'Deck',
    image: '/dealdeck/anc-real/nationals-park-scoreboard.jpg',
  },
  {
    eyebrow: '02 / Hold the hand',
    title: 'Project',
    body: 'Give the client a live place to see milestones, drawings, open decisions, site notes, and launch readiness.',
    metric: 'Status',
    image: '/dealdeck/anc-real/control-room.jpg',
  },
  {
    eyebrow: '03 / Run the venue',
    title: 'Service',
    body: 'After install, the same shell becomes tickets, photo diagnosis, service health, documents, reports, and QBR proof.',
    metric: 'Portal',
    image: '/dealdeck/anc-real/wells-center-concourse.jpg',
  },
]

export function AncKineticConcept() {
  const rootRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    let raf = 0
    const update = () => {
      raf = 0
      const doc = document.documentElement
      const max = Math.max(1, doc.scrollHeight - window.innerHeight)
      const progress = Math.min(1, Math.max(0, window.scrollY / max))
      root.style.setProperty('--scroll', String(progress))

      const markers = Array.from(root.querySelectorAll<HTMLElement>('[data-act]'))
      let next = 0
      for (const marker of markers) {
        const rect = marker.getBoundingClientRect()
        if (rect.top < window.innerHeight * 0.56) next = Number(marker.dataset.act || 0)
      }
      setActive(next)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div ref={rootRef} className={styles.page}>
      <div className={styles.grain} aria-hidden="true" />
      <div className={styles.progress} aria-hidden="true" />
      <header className={styles.hud} aria-hidden="true">
        <div>ANC / Visual Output OS</div>
        <div>{acts[active]?.eyebrow ?? '01 / Win the room'}</div>
      </header>

      <main>
        <section className={`${styles.scene} ${styles.hero}`}>
          <div className={styles.brand}>
            <img src="/brand-2026/anc-logo-main-white-transparent.png" alt="" />
            <span>ANC Sports</span>
          </div>
          <p className={styles.kicker}>Marketing Hub Concept</p>
          <h1>
            <span className={styles.solidLine}>One place</span>
            <span className={styles.solidLine}>for</span>
            <span className={styles.outlineLine}>every</span>
            <span className={styles.outlineLine}>visual</span>
            <span className={styles.outlineLine}>output.</span>
          </h1>
          <p className={styles.lead}>
            Presentations, client portals, project rooms, service dashboards, QBRs, and campaign pages should not be separate inventions. They should be presets in one ANC visual system.
          </p>
          <div className={styles.scrollCue}>Scroll</div>
        </section>

        <section className={styles.splitScene}>
          <div className={styles.sticky}>
            <p>Ask what to build.</p>
            <p>Pick the client.</p>
            <p>Choose modules.</p>
            <p>Render the output.</p>
          </div>
        </section>

        {acts.map((act, index) => (
          <section key={act.title} data-act={index} className={styles.act}>
            <div className={styles.actSticky}>
              <div className={styles.actImage} style={{ backgroundImage: `url(${act.image})` }} />
              <div className={styles.actScrim} />
              <div className={styles.actCopy}>
                <p>{act.eyebrow}</p>
                <h2>{act.title}</h2>
                <span>{act.metric}</span>
                <strong>{act.body}</strong>
              </div>
            </div>
          </section>
        ))}

        <section className={styles.modules}>
          <p className={styles.kicker}>Module map</p>
          <h2>Same shell, different mode.</h2>
          <div className={styles.moduleGrid}>
            {[
              ['Deal Deck', 'Vision, proof, team, pricing, close.'],
              ['Client Portal', 'Overview, venues, requests, account context.'],
              ['Tickets', 'Issue intake, status, comments, photos, SLA.'],
              ['AI Diagnosis', 'Photo and symptom triage before support touches it.'],
              ['Documents', 'Reports, drawings, specs, proof files, downloads.'],
              ['Approvals', 'Client decisions, sign-off, proof review.'],
              ['Service Health', 'Inventory, risks, events, maintenance, watchlist.'],
              ['QBR Reports', 'Monthly proof, renewal narrative, executive summary.'],
            ].map(([title, body]) => (
              <article key={title}>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.close}>
          <p className={styles.kicker}>Builder direction</p>
          <h2>Not another deck tool. The visual layer for ANC work.</h2>
          <p>
            The prompt decides the shape. The modules decide the product. The renderer makes it feel like ANC: controlled, premium, operational, and client-ready.
          </p>
          <a href="/client-portals">Open builder</a>
        </section>
      </main>
    </div>
  )
}
