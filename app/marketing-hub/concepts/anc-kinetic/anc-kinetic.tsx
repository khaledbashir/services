'use client'

import { FormEvent, useMemo, useState } from 'react'
import styles from './anc-kinetic.module.css'

type Scenario = {
  id: string
  label: string
  prompt: string
  eyebrow: string
  title: string
  thesis: string
  image: string
  stats: string[]
  modules: { title: string; body: string; status: string }[]
  preview: {
    nav: string[]
    headline: string
    body: string
    rows: string[]
  }
  flow: string[]
  links: { label: string; href: string }[]
}

const scenarios: Scenario[] = [
  {
    id: 'deal-deck',
    label: 'Deal Deck',
    prompt: 'Build a premium pre-sale proposal for a stadium display upgrade with vision, proof, scope, pricing, and a share link.',
    eyebrow: 'Pre-sale output',
    title: 'Win the room',
    thesis: 'A proposal surface that feels like ANC is already operating inside the venue: vision, proof, scope, pricing, and next steps in one controlled client link.',
    image: '/dealdeck/anc-real/76ers-arena-centerhung.jpg',
    stats: ['Vision deck', 'Proof library', 'Share analytics'],
    modules: [
      { title: 'Vision Story', body: 'Opening narrative, venue opportunity, business outcome, and executive framing.', status: 'Core' },
      { title: 'Proof Library', body: 'Case studies, venue media, before/after moments, and approved ANC assets.', status: 'Core' },
      { title: 'Scope + Pricing', body: 'Packages, alternates, assumptions, and print-ready backup for formal submission.', status: 'Core' },
      { title: 'Share Viewer', body: 'Mobile-safe client link with analytics, sections, and follow-up prompts.', status: 'Publish' },
    ],
    preview: {
      nav: ['Vision', 'Proof', 'Scope', 'Pricing'],
      headline: 'Stadium display modernization',
      body: 'A guided proposal that pairs the venue vision with the operational proof ANC needs to close confidently.',
      rows: ['Centerhung LED concept', 'Comparable venue proof', 'Commercial summary', 'Submission PDF backup'],
    },
    flow: ['Client need', 'Deck preset', 'ANC media', 'Interactive share link', 'PDF backup'],
    links: [
      { label: 'Open deck builder', href: '/presentation/new' },
      { label: 'Open visual studio', href: '/marketing-hub/studio' },
    ],
  },
  {
    id: 'client-portal',
    label: 'Client Portal',
    prompt: 'Build a client service portal for a venue operator with tickets, display health, documents, reports, onboarding, and AI diagnosis.',
    eyebrow: 'Post-install output',
    title: 'Run the venue',
    thesis: 'A client-facing operations shell where the venue can see service status, open requests, documents, service reports, and what ANC is watching.',
    image: '/dealdeck/anc-real/control-room.jpg',
    stats: ['Live board', 'Service desk', 'Document hub'],
    modules: [
      { title: 'Live Board', body: 'Venue overview, event readiness, SLA status, and service feed in one operator view.', status: 'Core' },
      { title: 'Service Requests', body: 'Issue intake, threaded replies, photo upload, status, and escalation context.', status: 'Core' },
      { title: 'Display Health', body: 'Inventory, active risks, maintenance history, and game-night watchlist.', status: 'Core' },
      { title: 'Documents + QBR', body: 'Reports, drawings, proof assets, monthly readouts, and renewal-ready history.', status: 'Core' },
      { title: 'AI Diagnosis', body: 'Photo and symptom triage before a request reaches the ANC service desk.', status: 'Add-on' },
      { title: 'Orientation', body: 'How to use the portal, service scope, contacts, escalation paths, and account setup.', status: 'Add-on' },
    ],
    preview: {
      nav: ['Overview', 'Requests', 'Displays', 'Documents'],
      headline: 'Venue service command center',
      body: 'Tickets, health, documents, and ANC activity gathered into one client-facing workspace.',
      rows: ['2 open requests', '100% event readiness', '6 current documents', '1 risk being watched'],
    },
    flow: ['Venue account', 'Portal preset', 'Service modules', 'Client workspace', 'Ongoing reports'],
    links: [
      { label: 'Open portal builder', href: '/client-portals' },
      { label: 'Open visual studio', href: '/marketing-hub/studio' },
    ],
  },
  {
    id: 'project-room',
    label: 'Project Room',
    prompt: 'Build an active project room for an install with milestones, drawings, approvals, site notes, and launch readiness.',
    eyebrow: 'Active project output',
    title: 'Hold the hand',
    thesis: 'A live project room that gives the client calm visibility while ANC moves from kickoff to installation to launch.',
    image: '/dealdeck/anc-real/notre-dame-installation.jpg',
    stats: ['Milestones', 'Approvals', 'Launch plan'],
    modules: [
      { title: 'Milestone Timeline', body: 'Kickoff, design, fabrication, install, commissioning, and launch readiness.', status: 'Core' },
      { title: 'Drawing Room', body: 'Approved drawings, open markups, specs, renderings, and document history.', status: 'Core' },
      { title: 'Decision Queue', body: 'Scope decisions, proof sign-off, site constraints, and client approvals.', status: 'Core' },
      { title: 'Site Notes', body: 'Field updates, photos, risks, and next steps organized by venue area.', status: 'Core' },
    ],
    preview: {
      nav: ['Timeline', 'Drawings', 'Approvals', 'Site Notes'],
      headline: 'Install visibility without extra meetings',
      body: 'A client room for project status, decisions, and launch readiness from first kickoff through handoff.',
      rows: ['5 milestones tracked', '3 drawings awaiting sign-off', '2 site constraints', 'Launch checklist ready'],
    },
    flow: ['Won deal', 'Project preset', 'Milestones + docs', 'Client room', 'Handoff to service'],
    links: [
      { label: 'Open portal builder', href: '/client-portals' },
      { label: 'Open deck builder', href: '/presentation/new' },
    ],
  },
  {
    id: 'campaign',
    label: 'Marketing Campaign',
    prompt: 'Build a marketing campaign workspace for a venue story with audience, newsletter, social posts, approvals, and rendered previews.',
    eyebrow: 'Marketing output',
    title: 'Ship the story',
    thesis: 'A campaign surface that turns ANC work into a controlled marketing package: audience, copy, assets, approvals, and previews.',
    image: '/dealdeck/anc-real/wfc-concourse-atrium.jpg',
    stats: ['Audience', 'Approval', 'Preview'],
    modules: [
      { title: 'Audience Brief', body: 'Segment, goal, angle, send timing, and campaign owner context.', status: 'Core' },
      { title: 'Newsletter Draft', body: 'Subject lines, article body, CTA, and render preview.', status: 'Core' },
      { title: 'Social Kit', body: 'Platform-specific post copy, media picks, and approval status.', status: 'Add-on' },
      { title: 'Approval Queue', body: 'Review notes, requested changes, and publish readiness.', status: 'Core' },
    ],
    preview: {
      nav: ['Brief', 'Newsletter', 'Social', 'Approval'],
      headline: 'Campaign package from one request',
      body: 'Audience, copy, visual preview, and approval status without jumping across disconnected tools.',
      rows: ['Newsletter draft ready', '3 social variations', '2 assets selected', 'Approval pending'],
    },
    flow: ['Campaign idea', 'Marketing preset', 'Audience + copy', 'Rendered preview', 'Approval + send'],
    links: [
      { label: 'Open visual studio', href: '/marketing-hub/studio' },
      { label: 'Open concepts', href: '/marketing-hub/concepts' },
    ],
  },
  {
    id: 'venue-vision',
    label: 'Venue Vision',
    prompt: 'Build a venue vision workspace with a 3D model, screen locations, content zones, approval notes, and client-facing presentation mode.',
    eyebrow: 'Vision output',
    title: 'Make it visible',
    thesis: 'A visual planning room for screen placement, content zones, walkthroughs, and stakeholder approval before the proposal becomes abstract.',
    image: '/dealdeck/anc-real/anc-approved-render.png',
    stats: ['3D model', 'Screen map', 'Approval notes'],
    modules: [
      { title: 'Venue Model', body: '3D walkthrough, screen locations, camera points, and venue zones.', status: 'Core' },
      { title: 'Display Map', body: 'LED inventory, proposed placements, technical notes, and status.', status: 'Core' },
      { title: 'Content Zones', body: 'What plays where: sponsorship, wayfinding, IPTV, concourse, and bowl moments.', status: 'Add-on' },
      { title: 'Presentation Mode', body: 'Guided client view that can become a Deal Deck section or portal tab.', status: 'Publish' },
    ],
    preview: {
      nav: ['Model', 'Displays', 'Zones', 'Notes'],
      headline: 'See the system before it is built',
      body: 'A 3D-backed concept room that turns venue imagination into shareable ANC proof.',
      rows: ['18 display locations', '4 content zones', '7 approval notes', 'Presentation mode ready'],
    },
    flow: ['Venue photo/model', 'Vision preset', '3D + modules', 'Review room', 'Deck or portal'],
    links: [
      { label: 'Open venue vision', href: '/venue-vision' },
      { label: 'Open deck builder', href: '/presentation/new' },
    ],
  },
]

const moduleMap = [
  'Deal Deck',
  'Client Portal',
  'Project Room',
  'Live Board',
  'Tickets',
  'Display Health',
  'Documents',
  'Reports / QBR',
  'Onboarding',
  'Approvals',
  'Marketing Campaign',
  'Venue Vision',
  'AI Diagnosis',
]

const productionRecord = [
  ['25+', 'years defining venues'],
  ['5', 'major leagues: NFL, NBA, MLB, MLS, NCAA'],
  ['100s', 'venues delivered nationwide'],
  ['Millions', 'fans reached every season'],
  ['1', 'accountable team from design to service'],
  ['24/7', 'live service and support posture'],
]

const workModes = [
  {
    title: 'Design & engineering',
    body: 'Vision, drawings, scope, screen systems, content zones, and proof before a client signs.',
  },
  {
    title: 'Fabrication & install',
    body: 'Project rooms, approvals, site notes, milestones, and launch readiness while the work is moving.',
  },
  {
    title: 'Live service & support',
    body: 'Portals, tickets, venue health, reports, QBR proof, and the client record after install.',
  },
]

function selectScenario(input: string) {
  const value = input.toLowerCase()
  if (/(campaign|newsletter|social|audience|marketing|approval)/.test(value)) return 'campaign'
  if (/(3d|vision|model|walkthrough|screen location|content zone|render)/.test(value)) return 'venue-vision'
  if (/(project|install|milestone|drawing|site|kickoff|launch)/.test(value)) return 'project-room'
  if (/(ticket|service|portal|qbr|document|display health|client|venue operator|diagnosis)/.test(value)) return 'client-portal'
  return 'deal-deck'
}

export function AncKineticConcept() {
  const [selectedId, setSelectedId] = useState('client-portal')
  const [draft, setDraft] = useState(scenarios[1].prompt)
  const [buildCount, setBuildCount] = useState(1)

  const selected = useMemo(
    () => scenarios.find((scenario) => scenario.id === selectedId) ?? scenarios[0],
    [selectedId],
  )

  function chooseScenario(id: string) {
    const scenario = scenarios.find((item) => item.id === id)
    if (!scenario) return
    setSelectedId(id)
    setDraft(scenario.prompt)
    setBuildCount((count) => count + 1)
  }

  function assemble(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSelectedId(selectScenario(draft))
    setBuildCount((count) => count + 1)
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMedia} aria-hidden="true">
          <img src="/dealdeck/anc-real/commanders-stadium-led.jpg" alt="" />
        </div>
        <nav className={styles.topbar} aria-label="Concept navigation">
          <a className={styles.brand} href="/marketing-hub/concepts">
            <img src="/brand-2026/anc-logo-main-white-transparent.png" alt="" />
            <span>ANC Visual Studio</span>
          </a>
          <div className={styles.topLinks}>
            <a href="/client-portals">Portal Builder</a>
            <a href="/presentation/new">Deck Builder</a>
            <a href="/marketing-hub/studio">Studio</a>
          </div>
        </nav>

        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Concept system / DealDeck + client portal layer</p>
            <h1>We build the output that defines the venue.</h1>
            <p className={styles.lead}>
              From the center-hung display to the control room behind it, every ANC job needs a client-facing surface. Describe the deal, project, service account, campaign, or venue vision. The studio assembles the right modules and renders the workspace.
            </p>
            <p className={styles.sourceNote}>
              Visual benchmark: the ANC kinetic reel. Product layer: the builder below.
            </p>
            <div className={styles.heroStats} aria-label="Supported output modes">
              {['Proposal', 'Portal', 'Project', 'Campaign', 'Vision'].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </div>

          <form className={styles.builder} onSubmit={assemble}>
            <label htmlFor="conceptPrompt">What do you need to build?</label>
            <textarea
              id="conceptPrompt"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={6}
            />
            <div className={styles.chips}>
              {scenarios.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  onClick={() => chooseScenario(scenario.id)}
                  className={selected.id === scenario.id ? styles.activeChip : ''}
                >
                  {scenario.label}
                </button>
              ))}
            </div>
            <button className={styles.buildButton} type="submit">Assemble workspace</button>
          </form>
        </div>
      </section>

      <section className={styles.reel}>
        <div className={styles.reelIntro}>
          <p className={styles.eyebrow}>A venue in three acts</p>
          <h2>If it does not perform on gameday, it does not count.</h2>
          <p>
            The source film already proves the tone: cinematic, direct, ANC-first. This concept adds the product system underneath it: every visual output starts from the same studio and becomes the right client surface.
          </p>
        </div>
        <div className={styles.recordGrid}>
          {productionRecord.map(([value, label], index) => (
            <article key={label}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{value}</strong>
              <p>{label}</p>
            </article>
          ))}
        </div>
        <div className={styles.workModes}>
          {workModes.map((mode) => (
            <article key={mode.title}>
              <h3>{mode.title}</h3>
              <p>{mode.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.outputShell} aria-live="polite">
        <div className={styles.outputHeader}>
          <div>
            <p className={styles.eyebrow}>{selected.eyebrow}</p>
            <h2>{selected.title}</h2>
          </div>
          <div className={styles.buildId}>Build {String(buildCount).padStart(2, '0')}</div>
        </div>

        <div className={styles.assemblyGrid}>
          <aside className={styles.modulePanel}>
            <p className={styles.panelTitle}>Selected modules</p>
            <div className={styles.moduleList}>
              {selected.modules.map((module) => (
                <article key={module.title} className={styles.moduleCard}>
                  <div>
                    <h3>{module.title}</h3>
                    <span>{module.status}</span>
                  </div>
                  <p>{module.body}</p>
                </article>
              ))}
            </div>
          </aside>

          <div className={styles.previewStage}>
            <div className={styles.previewWindow}>
              <div className={styles.previewHero} style={{ backgroundImage: `url(${selected.image})` }}>
                <div className={styles.previewBrand}>
                  <img src="/dealdeck/anc-brand/asset35-logo.svg" alt="" />
                  <span>ANC</span>
                </div>
              </div>
              <div className={styles.previewBody}>
                <div className={styles.previewNav}>
                  {selected.preview.nav.map((item, index) => (
                    <span key={item} className={index === 0 ? styles.previewActive : ''}>{item}</span>
                  ))}
                </div>
                <h3>{selected.preview.headline}</h3>
                <p>{selected.preview.body}</p>
                <div className={styles.previewStats}>
                  {selected.stats.map((stat) => (
                    <strong key={stat}>{stat}</strong>
                  ))}
                </div>
                <div className={styles.previewRows}>
                  {selected.preview.rows.map((row) => (
                    <span key={row}>{row}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className={styles.reasoningPanel}>
            <p className={styles.panelTitle}>Assembly path</p>
            <ol>
              {selected.flow.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
            <p>{selected.thesis}</p>
            <div className={styles.actionLinks}>
              {selected.links.map((link) => (
                <a key={link.href} href={link.href}>{link.label}</a>
              ))}
            </div>
          </aside>
        </div>
      </section>

      <section className={styles.systemMap}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>What the module map really means</p>
          <h2>One renderer. Different presets. Real ANC surfaces.</h2>
          <p>
            The point is not one more isolated page. It is a visual output engine that can become a proposal, a client portal, a project room, a marketing preview, or a venue vision surface from the same building blocks.
          </p>
        </div>
        <div className={styles.moduleMap}>
          {moduleMap.map((module) => (
            <span key={module}>{module}</span>
          ))}
        </div>
      </section>

      <section className={styles.portalDeepDive}>
        <div className={styles.sectionIntro}>
          <p className={styles.eyebrow}>Client portal mode</p>
          <h2>The service portal is one preset, not the whole product.</h2>
        </div>
        <div className={styles.portalGrid}>
          <article>
            <span>01</span>
            <h3>Live Board</h3>
            <p>Venue readiness, events, active requests, service feed, and account status in one command view.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Request Intake</h3>
            <p>Client-visible tickets with photo upload, threaded replies, status, SLA, and escalation context.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Display Health</h3>
            <p>Inventory, risks, maintenance history, and what ANC is watching before game night.</p>
          </article>
          <article>
            <span>04</span>
            <h3>Documents</h3>
            <p>Reports, drawings, proof assets, approvals, QBR packets, and renewal history organized by venue.</p>
          </article>
        </div>
      </section>

      <section className={styles.close}>
        <div>
          <p className={styles.eyebrow}>Next build direction</p>
          <h2>Make every ANC visual output start from the same studio.</h2>
          <p>
            The user asks what they want to build. The studio chooses the preset, shows modules, renders the workspace, and publishes the right link. Deal Deck and Client Portal are two modes of the same idea.
          </p>
        </div>
        <div className={styles.closeActions}>
          <a href="/marketing-hub/studio">Open studio</a>
          <a href="/client-portals">Open portal builder</a>
          <a href="/presentation/new">Open deck builder</a>
        </div>
      </section>
    </main>
  )
}
