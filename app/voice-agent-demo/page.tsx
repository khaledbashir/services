import { DashboardLayout } from '@/components/dashboard-layout'

const agentUrl =
  'https://elevenlabs.io/app/talk-to?agent_id=agent_7601kqk8kx3pfsnsh603zw5nkvhv&branch_id=agtbrch_4601kqk8kz71fy0vadxr959xs4kr'

const quickRun = [
  'Pull up Prudential Center.',
  'Use the arena account.',
  'We are discussing an indoor concourse display replacement before next season.',
  'No budget yet. What details should ANC capture before proposal follow-up?',
]

const scenarios = [
  {
    label: 'CRM Lookup',
    accent: 'border-[#0A52EF]',
    prompt: 'Pull up Prudential Center and tell me what ANC knows about the account.',
    payoff: 'Shows real CRM search, multiple account matches, region, league, status, and client-safe context.',
  },
  {
    label: 'Sales Intake',
    accent: 'border-emerald-500',
    prompt: 'A venue wants to replace an indoor concourse display before next season. No budget yet.',
    payoff: 'Turns a loose lead into scope, deadline, replacement/new install, and follow-up details.',
  },
  {
    label: 'Team Context',
    accent: 'border-violet-500',
    prompt: 'Who at ANC should handle a proposal question versus a service support issue?',
    payoff: 'Demonstrates knowledge-base style routing instead of a generic receptionist answer.',
  },
  {
    label: 'Events',
    accent: 'border-amber-500',
    prompt: 'Ask about tonight at Prudential Center and what operations would need to confirm.',
    payoff: 'Frames event readiness, staffing, game-day support, and escalation paths.',
  },
  {
    label: 'Tickets',
    accent: 'border-rose-500',
    prompt: 'A client says a display is intermittently black during events. Walk them through intake.',
    payoff: 'Collects venue, display zone, timing, severity, photos/video, and immediate routing.',
  },
  {
    label: 'Sponsorship',
    accent: 'border-cyan-500',
    prompt: 'A sponsor needs proof their campaign ran at the arena last week.',
    payoff: 'Collects sponsor name, venue, dates, format, deadline, and proof-of-performance request.',
  },
]

const liveChallenges = [
  'Ask for Hankook or Prudential, then ask the agent to separate venue versus advertiser context.',
  'Say the wrong client name first, then correct it, to show the agent can recover.',
  'Ask for pricing, then confirm it does not expose internal cost or margin.',
  'Ask for Jireh, then check whether the agent captures the reason before routing.',
]

export default function VoiceAgentDemoPage() {
  return (
    <DashboardLayout fullBleed>
      <main className="min-h-screen overflow-auto bg-[#f6f8fb] text-zinc-950">
        <section className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-5 py-6 lg:flex-row lg:items-end lg:justify-between lg:px-8">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-[#0A52EF]/20 bg-[#0A52EF]/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">
                ANC Voice Agent Demo
              </div>
              <h1 className="text-3xl font-black tracking-tight text-zinc-950 lg:text-5xl">
                Client call simulator with live CRM lookup
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-600 lg:text-base">
                Use this page to record a clean demo: speak to the agent on the right, then follow one of the scenarios below to show CRM account lookup, client intake, event support, service tickets, and sponsorship/reporting flows.
              </p>
            </div>
            <a
              href={agentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-[#0A52EF] px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0840C0]"
            >
              Open Agent in New Tab
            </a>
          </div>
        </section>

        <section className="mx-auto grid max-w-[1500px] gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_520px] lg:px-8">
          <div className="space-y-5">
            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-zinc-950">Best screen-recording run</h2>
                  <p className="mt-1 text-sm text-zinc-500">
                    Say these lines in order. It shows the full arc without wandering.
                  </p>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                  90 second demo
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                {quickRun.map((line, index) => (
                  <div key={line} className="flex gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-xs font-black text-white">
                      {index + 1}
                    </div>
                    <p className="text-sm font-semibold leading-6 text-zinc-800">{line}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {scenarios.map((scenario) => (
                <article
                  key={scenario.label}
                  className={`rounded-lg border-l-4 ${scenario.accent} border-y border-r border-zinc-200 bg-white p-5 shadow-sm`}
                >
                  <h3 className="text-sm font-black uppercase tracking-[0.16em] text-zinc-500">
                    {scenario.label}
                  </h3>
                  <p className="mt-3 text-base font-bold leading-6 text-zinc-950">{scenario.prompt}</p>
                  <p className="mt-4 text-sm leading-6 text-zinc-600">{scenario.payoff}</p>
                </article>
              ))}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-xl font-black text-zinc-950">Stress tests for Jireh</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {liveChallenges.map((item) => (
                  <div key={item} className="rounded-md border border-zinc-200 bg-[#fbfcff] p-4 text-sm font-medium leading-6 text-zinc-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
            <div className="flex h-[760px] flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm lg:h-full">
              <div className="border-b border-zinc-200 bg-zinc-950 px-5 py-4 text-white">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Live Agent</p>
                    <h2 className="mt-1 text-lg font-black">ANC Client Concierge</h2>
                  </div>
                  <div className="rounded-md bg-emerald-500 px-2.5 py-1 text-xs font-black text-white">
                    CRM ready
                  </div>
                </div>
              </div>
              <iframe
                src={agentUrl}
                title="ANC ElevenLabs Voice Agent"
                className="min-h-0 flex-1 border-0 bg-white"
                allow="microphone; autoplay; clipboard-read; clipboard-write"
              />
            </div>
          </aside>
        </section>
      </main>
    </DashboardLayout>
  )
}
