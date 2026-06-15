import type { Metadata } from 'next'
import Image from 'next/image'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'ANC Live Command | Sports Display Operations',
  description:
    'An ANC-branded story page for Technology, Venue Services, Media & Sponsorship, LiveSync, and the embedded AI chat experience.',
}

const proof = [
  { value: '3', label: 'business verticals' },
  { value: 'LiveSync', label: 'display software layer' },
  { value: '24/7', label: 'venue ops mindset' },
  { value: 'AI', label: 'guided support' },
]

const verticals = [
  {
    no: '01',
    title: 'Technology',
    body:
      'LED displays, control systems, LiveSync, portables, products, and the software layer that helps venues manage what appears on the boards.',
  },
  {
    no: '02',
    title: 'Venue Services',
    body:
      'Service contracts, installation support, event readiness, maintenance, ticket intake, and the operational work that keeps systems performing.',
  },
  {
    no: '03',
    title: 'Media & Sponsorship',
    body:
      'Sponsor activations, content, graphics, feeds, proof of performance, and the commercial programs that make the display network valuable.',
  },
]

const story = [
  {
    label: 'DISPLAY SOFTWARE',
    title: 'LiveSync is the operating layer behind the display.',
    body:
      'A display is only the surface. The real system is the software and workflow behind scheduling, playback, sponsor content, approvals, live changes, and venue confidence.',
  },
  {
    label: 'VENUE OPERATIONS',
    title: 'The relationship does not end after install.',
    body:
      'ANC keeps the venue live: game-day support, service tickets, field teams, readiness, maintenance, and escalation when a screen matters most.',
  },
  {
    label: 'COMMERCIAL CONTEXT',
    title: 'Every request belongs to a business lane.',
    body:
      'A client question may be Technology, Venue Services, or Media & Sponsorship. The AI assistant should understand the lane before it routes, answers, or captures next steps.',
  },
]

const chatPrompts = [
  'What are ANC’s three business verticals?',
  'What kind of software category is LiveSync?',
  'A venue display is black during an event. What should ANC capture first?',
  'Is sponsorship proof of performance Technology, Venue Services, or Media & Sponsorship?',
]

export default function AncLiveCommandPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#F7F8FC] text-[#1E2761]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.18]"
        style={{
          backgroundImage:
            'linear-gradient(to right, #1E2761 1px, transparent 1px), linear-gradient(to bottom, #1E2761 1px, transparent 1px)',
          backgroundSize: '92px 92px',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(circle at 80% 5%, rgba(249, 231, 149, 0.82), transparent 28%), radial-gradient(circle at 8% 18%, rgba(249, 97, 103, 0.18), transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.72), rgba(247,248,252,0.96) 520px)',
        }}
      />

      <nav className="sticky top-0 z-40 border-b border-[#1E2761]/10 bg-white/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 md:px-8">
          <a href="#top" className="flex items-center gap-3">
            <Image src="/anc-logo.svg" alt="ANC" width={82} height={26} priority />
            <span className="hidden h-5 w-px bg-[#1E2761]/20 sm:block" />
            <span className="hidden text-xs font-black uppercase tracking-[0.2em] text-[#1E2761]/60 sm:block">
              Live Command
            </span>
          </a>
          <div className="hidden items-center gap-7 text-xs font-black uppercase tracking-[0.18em] text-[#1E2761]/55 md:flex">
            <a className="transition hover:text-[#1E2761]" href="#verticals">
              Verticals
            </a>
            <a className="transition hover:text-[#1E2761]" href="#story">
              Story
            </a>
            <a className="transition hover:text-[#1E2761]" href="#chat">
              Chat Test
            </a>
          </div>
        </div>
      </nav>

      <section id="top" className="relative z-10 pt-28 md:pt-40">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="mb-10 flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#F96167]">
            <span className="h-2 w-2 rounded-full bg-[#F96167]" />
            <span className="h-px w-10 bg-[#1E2761]/25" />
            <span>Sports entertainment agency · venue display systems</span>
          </div>

          <div className="grid items-end gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <h1 className="max-w-5xl font-serif text-[3.25rem] font-black leading-[0.92] tracking-[-0.055em] text-[#1E2761] sm:text-7xl md:text-8xl lg:text-[7.8rem]">
                The story behind
                <br />
                <span className="text-[#F96167]">what lights up</span>
                <br />
                the venue.
              </h1>
              <p className="mt-9 max-w-2xl text-lg font-medium leading-8 text-[#4B557E] md:text-xl">
                ANC is not just selling LED displays. It is selling the full operating layer around live
                sports entertainment: hardware, LiveSync software, services, sponsor content, and the teams
                that keep everything running.
              </p>
              <div className="mt-10 flex flex-wrap gap-4">
                <a
                  href="#chat"
                  className="rounded-md bg-[#1E2761] px-6 py-3 text-sm font-black text-white shadow-lg shadow-[#1E2761]/20 transition hover:-translate-y-0.5 hover:bg-[#2d3a7a]"
                >
                  Test embedded chat
                </a>
                <a
                  href="#verticals"
                  className="rounded-md border-2 border-[#1E2761] px-6 py-3 text-sm font-black text-[#1E2761] transition hover:-translate-y-0.5 hover:bg-[#1E2761] hover:text-white"
                >
                  See the verticals
                </a>
              </div>
            </div>

            <div className="relative rounded-[28px] bg-[#1E2761] p-5 shadow-2xl shadow-[#1E2761]/30">
              <div
                aria-hidden
                className="absolute inset-0 rounded-[28px] opacity-30"
                style={{
                  backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.34) 1px, transparent 1px)',
                  backgroundSize: '22px 22px',
                }}
              />
              <div className="relative rounded-[22px] border border-white/16 bg-white/8 p-6 text-white backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/15 pb-4">
                  <span className="text-xs font-black uppercase tracking-[0.2em] text-[#F9E795]">
                    Live venue stack
                  </span>
                  <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-emerald-100">
                    online
                  </span>
                </div>
                <div className="space-y-4 py-6">
                  {['Display hardware', 'LiveSync software', 'Venue services', 'Sponsor content', 'AI support'].map(
                    (item, index) => (
                      <div key={item} className="grid grid-cols-[1fr_90px] items-center gap-4">
                        <span className="text-sm font-bold text-white/88">{item}</span>
                        <span className="h-2 rounded-full bg-white/15">
                          <span
                            className="block h-2 rounded-full bg-[#F9E795]"
                            style={{ width: `${92 - index * 9}%` }}
                          />
                        </span>
                      </div>
                    ),
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3 border-t border-white/15 pt-4">
                  <MiniStat value="CRM" label="context" />
                  <MiniStat value="Ops" label="routing" />
                  <MiniStat value="AI" label="intake" />
                </div>
              </div>
            </div>
          </div>

          <dl className="mt-20 grid grid-cols-2 border-y border-[#1E2761]/10 bg-white/55 backdrop-blur md:mt-28 lg:grid-cols-4">
            {proof.map((stat, index) => (
              <div
                key={stat.label}
                className={[
                  'p-6 md:p-8',
                  index > 0 ? 'lg:border-l lg:border-[#1E2761]/10' : '',
                  index % 2 === 1 ? 'border-l border-[#1E2761]/10 lg:border-l' : '',
                  index > 1 ? 'border-t border-[#1E2761]/10 lg:border-t-0' : '',
                ].join(' ')}
              >
                <dd className="font-serif text-3xl font-black tracking-tight text-[#1E2761]">{stat.value}</dd>
                <dt className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">
                  {stat.label}
                </dt>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="verticals" className="relative z-10 border-b border-[#1E2761]/10 py-28 md:py-36">
        <div className="mx-auto grid max-w-7xl grid-cols-12 gap-8 px-5 md:px-8">
          <div className="col-span-12 md:sticky md:top-28 md:col-span-5 md:self-start">
            <SectionLabel number="01" label="ANC verticals" />
            <h2 className="mt-8 max-w-lg font-serif text-5xl font-black leading-[1] tracking-[-0.045em] text-[#1E2761] md:text-7xl">
              Three ways ANC
              <br />
              goes to market.
            </h2>
          </div>
          <div className="col-span-12 md:col-span-7">
            <div className="divide-y divide-[#1E2761]/10 border-y border-[#1E2761]/10 bg-white/62 backdrop-blur">
              {verticals.map((vertical) => (
                <article key={vertical.title} className="grid grid-cols-12 gap-5 p-6 md:p-8">
                  <div className="col-span-2 text-xs font-black uppercase tracking-[0.2em] text-[#F96167]">
                    {vertical.no}
                  </div>
                  <div className="col-span-10">
                    <h3 className="font-serif text-3xl font-black tracking-tight text-[#1E2761]">{vertical.title}</h3>
                    <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[#4B557E]">{vertical.body}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="story" className="relative z-10 py-28 md:py-36">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <SectionLabel number="02" label="The operating story" />
          <h2 className="mt-8 max-w-5xl font-serif text-5xl font-black leading-[1] tracking-[-0.045em] text-[#1E2761] md:text-7xl">
            The display is the surface.
            <br />
            <span className="text-[#F96167]">The workflow underneath is the product.</span>
          </h2>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-[#1E2761]/12 md:grid-cols-3">
            {story.map((item) => (
              <article key={item.title} className="bg-white/76 p-7 backdrop-blur transition hover:bg-white">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F96167]">{item.label}</p>
                <h3 className="mt-8 font-serif text-3xl font-black leading-tight tracking-tight text-[#1E2761]">
                  {item.title}
                </h3>
                <p className="mt-5 text-[15px] font-medium leading-7 text-[#4B557E]">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="chat" className="relative z-10 border-t border-[#1E2761]/10 bg-white/52 py-28 backdrop-blur md:py-36">
        <div className="mx-auto grid max-w-7xl grid-cols-12 gap-8 px-5 md:px-8">
          <div className="col-span-12 lg:col-span-6">
            <SectionLabel number="03" label="AI chat test" />
            <h2 className="mt-8 font-serif text-5xl font-black leading-[1] tracking-[-0.045em] text-[#1E2761] md:text-7xl">
              Ask ANC
              <br />
              like a client would.
            </h2>
            <p className="mt-8 max-w-xl text-lg font-medium leading-8 text-[#4B557E]">
              The embedded assistant should understand the ANC story: LiveSync as display software, the three
              commercial verticals, and how to capture the next step for a venue, service, or sponsorship request.
            </p>
            <div className="mt-10 rounded-2xl border border-[#1E2761]/10 bg-[#1E2761] p-6 text-white shadow-xl shadow-[#1E2761]/15">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#F9E795]">Try asking</p>
              <ul className="mt-5 space-y-3 text-sm font-semibold leading-6 text-white/88">
                {chatPrompts.map((prompt) => (
                  <li key={prompt}>“{prompt}”</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-6">
            <div className="min-h-[745px] rounded-3xl border border-[#1E2761]/10 bg-white p-5 shadow-2xl shadow-[#1E2761]/12">
              <div className="mb-5 flex items-center justify-between border-b border-[#1E2761]/10 pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#6B7280]">Embedded widget</p>
                  <h3 className="mt-1 font-serif text-3xl font-black text-[#1E2761]">ANC Assistant</h3>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                  script loaded
                </span>
              </div>
              <p className="text-sm font-medium leading-6 text-[#6B7280]">
                The chat launcher loads from the script you provided. If the vendor widget opens as a floating
                launcher, use that button to test the assistant.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[#1E2761]/10 bg-[#1E2761] py-10 text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 text-xs font-black uppercase tracking-[0.18em] md:flex-row md:items-center md:justify-between md:px-8">
          <span>ANC Sports · Live display operating layer</span>
          <a href="#top" className="text-[#F9E795]">
            Back to top
          </a>
        </div>
      </footer>

      <Script
        defer
        src="https://ai.basheer.app/vendor/chatbot/js/external-chatbot.js"
        data-chatbot-uuid="85f621b7-1f00-48f7-bf69-e11b34276482"
        data-iframe-width="420"
        data-iframe-height="745"
        data-language="en"
        strategy="afterInteractive"
      />
    </main>
  )
}

function SectionLabel({ number, label }: { number: string; label: string }) {
  return (
    <div className="flex items-center gap-4 text-[11px] font-black uppercase tracking-[0.2em] text-[#F96167]">
      <span>{number}</span>
      <span className="h-px w-8 bg-[#1E2761]/25" />
      <span>{label}</span>
    </div>
  )
}

function MiniStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/8 p-3">
      <b className="block font-serif text-xl text-[#F9E795]">{value}</b>
      <span className="text-[10px] font-black uppercase tracking-[0.16em] text-white/55">{label}</span>
    </div>
  )
}
