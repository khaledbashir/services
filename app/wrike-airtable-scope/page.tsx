const migrationStats = [
  { label: 'Wrike tasks migrated', value: '23,000+' },
  { label: 'Timelog entries migrated', value: '28,000+' },
  { label: 'Walkthrough logs migrated', value: '15,465' },
  { label: 'Inventory assets migrated', value: '1,656' },
]

const meetingFlow = [
  'Launch readiness and feedback path',
  'Wrike retirement status',
  'Airtable retirement status',
  'AI layer discussion',
  'Team walkthroughs and next steps',
]

const wrikeItems = [
  'Wrike tasks migrated with history preserved.',
  'Timelog entries migrated with designer attribution and project mapping.',
  'Wrike users mapped into staff records with role and permission structure.',
  'Wrike folders mapped to venue and company records.',
  'Design Requests, Designer Time Entries, and Hours Budgets built as native operating views.',
  'Auto-tracked hours, threshold alerts, proof links, and proof view tracking.',
  'Per-designer queues so each team member sees their own work.',
  'Ad-hoc request flag for one-off paid work without a service agreement.',
  'Operator UI surfaced for designers, enterprise leads, and leadership.',
]

const airtableItems = [
  'Inventory assets migrated with full field set: asset number, location, manufacturer, display type, orientation, tri-code, IP, and render name.',
  'Walkthrough logs migrated with notes, results, and technician attribution.',
  'Maintenance logs migrated with station, asset relations, and escort details.',
  'Native UI exists for Maintenance, Walkthroughs, Inventory, RMA, Parts Catalog, Parts Orders, Stadium Prep, and the public Parts Request form.',
  'Client read-only portals give external clients a per-venue link to display health and open tickets without a login.',
  'Filter bars and per-role scoping keep technicians focused on their own venues.',
]

const aiItems = [
  'Ops assistant answers live questions from dashboard data: open tickets, tonight\'s events, overdue items, staffing, and workflow status.',
  'Ops assistant can take structured actions from natural-language requests: create tickets, log maintenance, open design requests, assign designers, update hours, change due dates, and move work through review.',
  'Design assist should focus on first drafts, proof setup, board-format reflow, and repeated game-day formats, not replacing designer judgment.',
  'Template library can be organized by client and venue so score graphics, countdowns, logos, ribbons, fascia, and recurring layouts start from the right specs.',
  'Brand inheritance can pull logos, colors, typography, and venue specs from the venue record.',
  'AI remains opt-in per request so nothing runs without someone choosing to invoke it.',
]

const rolloutItems = [
  '121 new staff accounts were created.',
  '7 existing accounts were updated with venue assignments.',
  'Venue assignments increased from 18 to 319.',
  'New staff login format is firstname.lastname@anc.com with default password anc123.',
  'Confirm who sends the staff login note before launch.',
  'Decide where staff feedback should go and what counts as urgent after launch.',
]

const workflowItems = [
  'Workflow links now send users to login first, then back to the correct workflow.',
  'Slack workflow messages keep a permanent clickable link.',
  'Post-game reports show Incident Reported: Yes or No in Slack.',
  'Matt should run through the LA game workflow to confirm the full path.',
  'ANC bot should respond only when clearly prompted, not because it sees ANC in a channel.',
]

const opsItems = [
  'Rocket Arena import was fixed.',
  'Manual events can be added from the venue page.',
  'Venue content creation guide was added.',
  'Support tickets can be created from the venue page.',
  'Staff can be linked directly to venues.',
  'My Venues filter is live.',
  'Venue notes and wall are live.',
  'Contracted services are visible to everyone, with admin-only editing.',
]

const decisionItems = [
  'Who sends the staff rollout message?',
  'Where should launch feedback go?',
  'What Slack notifications should go to venue channels versus all-alerts?',
  'When exactly should the ANC bot respond?',
  'Which Airtable team leads should walk through first: Alexis, Gianni, Nick, Chris?',
  'Do preset venue sizes and first-draft proofs save the creative team enough time to prioritize now?',
  'What should be treated as urgent after staff launch?',
  'Do Wrike and Airtable scopes fully cover what Joe wants over the proposal?',
]

function Section({
  eyebrow,
  title,
  children,
  className = '',
}: {
  eyebrow?: string
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={`rounded border border-[#2a2a2a] bg-[#151515] shadow-[0_18px_60px_rgba(0,0,0,0.28)] ${className}`}>
      <div className="border-b border-[#2a2a2a] px-5 py-4">
        {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#3b82f6]">{eyebrow}</p> : null}
        <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function CheckList({ items }: { items: string[] }) {
  return (
    <div className="grid gap-3">
      {items.map((item) => (
        <div key={item} className="flex gap-3 rounded border border-[#2a2a2a] bg-[#1a1a1a] px-4 py-3 text-sm leading-relaxed text-zinc-300">
          <span className="mt-1 h-2 w-2 flex-none rounded-full bg-[#0A52EF]" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  )
}

export default function WrikeAirtableScopePage() {
  return (
    <main className="min-h-screen bg-[#0f0f0f] px-5 py-6 text-white lg:px-10 lg:py-8">
      <div className="mx-auto max-w-[1440px] space-y-7 pb-10">
        <header className="flex items-center justify-between">
          <div>
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
            <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Services</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Screen-share deck</p>
            <p className="mt-1 text-sm text-zinc-300">No pricing shown</p>
          </div>
        </header>

        <div className="overflow-hidden rounded border border-[#2b5fff] bg-[linear-gradient(135deg,#111111_0%,#151515_45%,#0A52EF_100%)] shadow-2xl shadow-black/25">
          <div className="p-7 lg:p-9">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-100">Meeting Run-Through</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white lg:text-5xl">
                  Wrike + Airtable Retirement Scope
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-50">
                  Screen-share version for walking the team through what is already live, what needs final walkthrough sign-off, and where the AI layer fits. Commercial terms are intentionally removed from this view.
                </p>
              </div>
              <div className="rounded border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-100">Prepared for</p>
                <p className="mt-1 text-lg font-semibold text-white">ANC Sports Enterprises</p>
                <p className="text-xs text-blue-100">April 2026</p>
              </div>
            </div>

            <div className="mt-8 grid gap-3 md:grid-cols-4">
              {migrationStats.map((stat) => (
                <div key={stat.label} className="rounded border border-white/15 bg-black/20 p-4">
                  <p className="text-3xl font-semibold text-white">{stat.value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-blue-100">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
          <Section eyebrow="How to guide the call" title="Recommended Flow">
            <div className="space-y-3">
              {meetingFlow.map((item, index) => (
                <div key={item} className="flex items-center gap-4 rounded border border-[#2a2a2a] bg-[#1a1a1a] p-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-[#0A52EF] text-sm font-semibold text-white">{index + 1}</div>
                  <p className="text-sm font-medium text-zinc-100">{item}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section eyebrow="Opening point" title="One Platform ANC Owns">
            <p className="text-sm leading-6 text-zinc-300">
              The work replaces two long-running SaaS workflows with owned ANC infrastructure. Wrike is effectively complete and carrying live data. Airtable is built and needs lead walkthroughs before final sign-off. The Service Dashboard is the operating layer for staff, leadership, creative, and field teams.
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {['No spreadsheet hunting', 'Per-role views', 'Live operational data'].map((label) => (
                <div key={label} className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                  <p className="text-sm font-semibold text-zinc-100">{label}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        <div className="grid gap-7 lg:grid-cols-2">
          <Section eyebrow="Phase 4" title="Wrike Retirement - Complete and Live">
            <CheckList items={wrikeItems} />
          </Section>

          <Section eyebrow="Phase 6" title="Airtable Retirement - Built, Walkthrough Remaining">
            <CheckList items={airtableItems} />
            <div className="mt-5 rounded border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              Remaining work: short walkthroughs with Alexis, Gianni, Nick, and Chris to confirm field placement, flow, and any small adjustments before archiving the old accounts.
            </div>
          </Section>
        </div>

        <Section eyebrow="Optional layer" title="AI Across Ops and Design">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
            <CheckList items={aiItems} />
            <div className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="text-sm font-semibold text-zinc-100">How to frame this on the call</p>
              <p className="mt-3 text-sm leading-6 text-zinc-300">
                The strongest creative angle is not "AI makes the final graphic." It is that the platform already knows the venue, client, specs, screen sizes, and repeatable formats, so it can prepare a first draft or proof that designers refine.
              </p>
              <div className="mt-4 rounded bg-[#151515] p-4 text-sm text-zinc-300 ring-1 ring-[#2a2a2a]">
                Ask Alexis whether preset venue sizes and first-draft proofs would remove enough repetitive setup to save the creative team meaningful time.
              </div>
            </div>
          </div>
        </Section>

        <div className="grid gap-7 lg:grid-cols-3">
          <Section eyebrow="Launch" title="Staff Rollout">
            <CheckList items={rolloutItems} />
          </Section>

          <Section eyebrow="Workflow" title="Links, Slack, and Bot Behavior">
            <CheckList items={workflowItems} />
          </Section>

          <Section eyebrow="Ops" title="Recent Service Dashboard Wins">
            <CheckList items={opsItems} />
          </Section>
        </div>

        <Section eyebrow="Alignment" title="Decisions to Leave the Meeting With">
          <div className="grid gap-3 md:grid-cols-2">
            {decisionItems.map((item) => (
              <div key={item} className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-4">
                <p className="text-sm font-medium leading-6 text-zinc-100">{item}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="Terms without numbers" title="Ownership, Warranty, and Acceptance">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="text-sm font-semibold text-zinc-100">Ownership</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">All code, data, and infrastructure live on ANC-owned systems. No seat pricing, no vendor lock-in, and no dependency on the retired tools for day-to-day operations.</p>
            </div>
            <div className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="text-sm font-semibold text-zinc-100">Warranty</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">Each phase includes a post-delivery window for bug fixes, clarifications, and small corrections tied to the agreed scope.</p>
            </div>
            <div className="rounded border border-[#2a2a2a] bg-[#1a1a1a] p-5">
              <p className="text-sm font-semibold text-zinc-100">Acceptance</p>
              <p className="mt-2 text-sm leading-6 text-zinc-300">The only needed outcome from this call is confirmation that the scope is covered, the team walkthrough path is correct, and launch feedback has a clear owner.</p>
            </div>
          </div>
        </Section>
      </div>
    </main>
  )
}
