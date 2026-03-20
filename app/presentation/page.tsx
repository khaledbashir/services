'use client'

import { useState, useEffect } from 'react'

const TOTAL_SLIDES = 15

export default function PresentationPage() {
  const [slide, setSlide] = useState(0)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); setSlide(s => Math.min(s + 1, TOTAL_SLIDES - 1)) }
      if (e.key === 'ArrowLeft') setSlide(s => Math.max(s - 1, 0))
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const Slide = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`w-full h-screen bg-[#f0f2f5] flex flex-col justify-center items-center relative overflow-hidden ${className}`}>
      {children}
      {/* Nav */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center items-center gap-4 z-50">
        <button onClick={() => setSlide(s => Math.max(s - 1, 0))} className="w-8 h-8 rounded-full bg-white/80 shadow text-zinc-500 hover:bg-white flex items-center justify-center text-sm">←</button>
        <div className="flex gap-1.5">{Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button key={i} onClick={() => setSlide(i)} className={`w-2 h-2 rounded-full transition-colors ${i === slide ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`} />
        ))}</div>
        <button onClick={() => setSlide(s => Math.min(s + 1, TOTAL_SLIDES - 1))} className="w-8 h-8 rounded-full bg-white/80 shadow text-zinc-500 hover:bg-white flex items-center justify-center text-sm">→</button>
      </div>
      <div className="absolute bottom-6 right-8 text-[10px] text-zinc-400">{slide + 1} / {TOTAL_SLIDES}</div>
    </div>
  )

  const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
    <div className={`bg-white rounded-2xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] border border-zinc-200/60 ${className}`}>{children}</div>
  )

  const slides = [
    // SLIDE 1: COVER
    <Slide key={0}>
      <div className="text-center max-w-4xl px-8">
        <div className="mb-8">
          <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-10 mx-auto opacity-60" />
        </div>
        <h1 className="text-6xl font-black text-[#0f172a] tracking-tight leading-[1.1]">The ANC Service<br/>Dashboard</h1>
        <p className="text-2xl text-zinc-500 mt-6 font-light">The Next-Generation<br/>Operations Nerve Center</p>
        <div className="mt-10 inline-block bg-[#0A52EF] text-white text-sm font-medium px-6 py-3 rounded-full">
          End-to-end automation from signed proposal to live game-day operations.
        </div>
      </div>
    </Slide>,

    // SLIDE 2: SCALE
    <Slide key={1}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-12">Scale Managed Without Friction</h2>
        <div className="grid grid-cols-2 gap-6">
          {[
            { num: '43+', label: 'Venues across 15 national markets', icon: '📍' },
            { num: '150+', label: 'Field Technicians deployed and tracked', icon: '👤' },
            { num: '250+', label: 'Events auto-syncing seamlessly via Google Calendar API', icon: '📅' },
            { num: '12', label: 'Configured LED Specifications continuously synced directly from sales platforms', icon: '🖥️' },
          ].map((s, i) => (
            <Card key={i} className="p-8 flex items-center gap-6">
              <span className="text-5xl font-black text-[#0A52EF]">{s.num}</span>
              <p className="text-sm text-zinc-600 leading-relaxed">{s.label}</p>
            </Card>
          ))}
        </div>
      </div>
    </Slide>,

    // SLIDE 3: SEAMLESS HANDOFF
    <Slide key={2}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-12">The Seamless Handoff: Sales to Operations</h2>
        <div className="flex items-center gap-8">
          <Card className="p-6 bg-[#0A52EF] text-white flex-shrink-0">
            <p className="font-bold text-lg">Proposal Engine</p>
            <p className="text-sm opacity-75 mt-1">Status: Closed Won</p>
            <p className="text-xs opacity-50 mt-0.5">(Webhook Fired)</p>
          </Card>
          <div className="flex-1 space-y-3">
            {[
              { title: 'Venue Profile Created', desc: 'Links to existing or spins up new' },
              { title: 'LED Specs Imported', desc: 'Manufacturer, pixel pitch, and dimensions flow in automatically' },
              { title: 'Client Portal Token Generated', desc: 'Instant access granted' },
              { title: 'Deal Won Alert Fired', desc: 'Real-time Slack notification mapping to the correct channel' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="w-12 h-px bg-[#0A52EF]"></div>
                <div className="text-[#0A52EF]">→</div>
                <Card className="p-4 flex-1">
                  <p className="font-bold text-sm text-[#0f172a]">{item.title}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{item.desc}</p>
                </Card>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-8 bg-[#059669] text-white text-center py-3 rounded-lg text-sm font-medium">
          Zero manual data entry. Operations is instantly prepared the moment a deal closes.
        </div>
      </div>
    </Slide>,

    // SLIDE 4: COMMAND CENTER
    <Slide key={3}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">The Command Center: Orchestrating the Chaos</h2>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="border-2 border-[#0A52EF]/20 rounded-full p-6 inline-block">
              <div className="space-y-2">
                {['Today\'s Events', 'Staff Assigned', 'Open Tickets', 'Pending Workflows', 'Estimated Labor Hours'].map((item, i) => (
                  <Card key={i} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-zinc-400 text-sm">{['📅', '👥', '🎟️', '⚙️', '⏱️'][i]}</span>
                    <span className="text-sm font-semibold text-[#0f172a]">{item}</span>
                  </Card>
                ))}
              </div>
            </div>
          </div>
          <div className="flex-1 space-y-4">
            {[
              { level: 'Critical', desc: 'Unassigned events requiring immediate staffing.', color: '#dc2626' },
              { level: 'Warning', desc: 'Missing check-ins for events starting within an hour.', color: '#d97706' },
              { level: 'Informational', desc: 'Forward-looking assignments needed.', color: '#2563eb' },
            ].map((alert, i) => (
              <Card key={i} className="p-5 flex items-start gap-4">
                <div className="w-1 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: alert.color }}></div>
                <div>
                  <p className="font-bold text-sm" style={{ color: alert.color }}>{alert.level}:</p>
                  <p className="text-sm text-zinc-600 mt-0.5">{alert.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
        <div className="mt-8 bg-zinc-200/60 text-center py-3 rounded-lg text-sm text-zinc-600 font-medium">
          The system does not wait for you to find problems; it illuminates them automatically.
        </div>
      </div>
    </Slide>,

    // SLIDE 5: SCHEDULING & CAPACITY
    <Slide key={4}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">Smarter Scheduling and Capacity Control</h2>
        <div className="grid grid-cols-2 gap-8">
          <div>
            <h3 className="text-lg font-bold text-[#0f172a] mb-4">Scheduling Automation</h3>
            <Card className="p-5 space-y-4">
              <div className="flex gap-2">
                <span className="px-4 py-2 bg-zinc-100 rounded-lg text-xs font-semibold border border-zinc-200">📅 Calendar</span>
                <span className="px-4 py-2 bg-white rounded-lg text-xs text-zinc-500 border border-zinc-200">☰ List</span>
              </div>
              <div className="bg-zinc-50 rounded-lg p-4 space-y-2">
                <p className="text-xs text-zinc-500">Technician: <strong className="text-[#0f172a]">John Doe</strong></p>
                <p className="text-xs text-zinc-500">Event: NBA Game 123 <span className="text-[#0A52EF] font-semibold">(7.5 hrs)</span></p>
                <p className="text-xs text-zinc-500">Event: NHL Match 456 <span className="text-[#0A52EF] font-semibold">(7.0 hrs)</span></p>
              </div>
              <p className="text-xs text-zinc-600"><strong>League-Specific Automation:</strong> Dropdown assignments auto-calculate estimated hours based on dynamic league settings.</p>
            </Card>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#0f172a] mb-4">Visual Workload Tracking</h3>
            <Card className="p-5">
              <div className="flex gap-1 h-10 rounded-full overflow-hidden mb-4">
                <div className="bg-emerald-500 flex-[3]"></div>
                <div className="bg-amber-400 flex-[2]"></div>
                <div className="bg-red-500 flex-1"></div>
              </div>
              <div className="flex justify-between text-xs text-center">
                <div><p className="font-bold text-emerald-600">Green &lt;30h</p><p className="text-zinc-500">(Optimal capacity)</p></div>
                <div><p className="font-bold text-amber-600">Amber &lt;40h</p><p className="text-zinc-500">(Nearing overtime)</p></div>
                <div><p className="font-bold text-red-600">Red &gt;40h</p><p className="text-zinc-500">(Overloaded)</p></div>
              </div>
              <p className="text-xs text-zinc-600 text-center mt-4">Instantly see technician capacity at a glance before assigning them to an event.</p>
            </Card>
            <Card className="p-4 mt-4 bg-zinc-50">
              <p className="text-xs text-zinc-600 text-center">Result: Labor budget tracking that actively prevents burnout and controls overtime costs.</p>
            </Card>
          </div>
        </div>
      </div>
    </Slide>,

    // SLIDE 6: VENUE INTELLIGENCE
    <Slide key={5}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">Venue Intelligence & Automated Hardware Specs</h2>
        <div className="flex gap-8 items-start">
          <div className="flex-1">
            <Card className="overflow-hidden">
              <div className="flex border-b border-zinc-200">
                {['Events', 'Staff', 'Specs', 'Settings'].map((tab, i) => (
                  <div key={i} className={`px-6 py-3 text-sm font-medium ${i === 2 ? 'text-[#0A52EF] border-b-2 border-[#0A52EF]' : 'text-zinc-400'}`}>{tab}</div>
                ))}
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-4 gap-3 text-xs">
                  {[['Venue ID', 'Arena A'], ['Display Zone', 'Center Court Main Scoreboard'], ['Model Number', 'LED-X-5000'], ['Model', 'LED-X-5000']].map(([k, v], i) => (
                    <div key={i}><p className="text-zinc-400">{k}</p><p className="font-medium text-[#0f172a] mt-0.5">{v}</p></div>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  {[['Brightness (Nits)', '2000'], ['Pixel Pitch (mm)', '3.9'], ['Dimensions', '20\' x 40\''], ['Status', 'Active']].map(([k, v], i) => (
                    <div key={i}><p className="text-zinc-400">{k}</p><p className={`font-medium mt-0.5 ${v === 'Active' ? 'text-emerald-600' : 'text-[#0f172a]'}`}>{v}</p></div>
                  ))}
                </div>
              </div>
              <div className="px-5 pb-4">
                <Card className="p-3 bg-zinc-50 border-zinc-200">
                  <p className="text-xs text-zinc-600"><strong>Auto-Populated Details:</strong> Exact hardware specifications are sourced continuously from original proposals.</p>
                </Card>
              </div>
            </Card>
          </div>
          <div className="w-64 space-y-4">
            <Card className="p-4">
              <p className="font-bold text-sm text-[#0f172a]">Venue Readiness</p>
              <p className="text-xs text-zinc-500 mt-1">Red/Green Status Bars provide instant cues for staffing completion.</p>
              <div className="mt-3 space-y-2">
                <div className="h-2 bg-emerald-500 rounded-full w-full"></div>
                <div className="h-2 bg-red-500 rounded-full w-3/4"></div>
              </div>
            </Card>
            <Card className="p-4">
              <p className="font-bold text-sm text-[#0f172a]">Configuration Logic</p>
              <p className="text-xs text-zinc-500 mt-1">Toggle 'Full Service' vs 'Support Only' assignment requirements.</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-[#0A52EF] bg-blue-50 px-3 py-1 rounded-full">Full Service</span>
                <div className="w-10 h-5 bg-[#0A52EF] rounded-full relative"><div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full"></div></div>
                <span className="text-xs text-zinc-400">Support Only</span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Slide>,

    // SLIDE 7: TECHNICIAN RELIABILITY
    <Slide key={6}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">Technician Reliability & Frictionless Onboarding</h2>
        <Card className="p-6 flex items-center gap-8 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-zinc-200 rounded-full flex items-center justify-center text-2xl">👤</div>
            <div>
              <p className="font-bold text-[#0f172a]">Player Card</p>
              <p className="text-xs text-zinc-500">Field Technician: Alex Chen</p>
              <p className="text-xs text-zinc-500">Status: Active</p>
            </div>
          </div>
          <div className="flex-1"></div>
          <svg viewBox="0 0 100 100" className="w-24 h-24">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#10b981" strokeWidth="8" strokeDasharray="251 264" strokeLinecap="round" transform="rotate(-90 50 50)" />
            <text x="50" y="50" textAnchor="middle" dy="0.35em" className="text-lg font-bold fill-[#0f172a]" style={{ fontSize: '20px' }}>95%</text>
          </svg>
          <p className="text-xs text-zinc-600 max-w-48"><strong>The Reliability Metric:</strong> A 3-stage workflow completion percentage ring tracks exact compliance.</p>
        </Card>
        <div className="grid grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2">Instant Onboarding</h3>
            <p className="text-xs text-zinc-600 mb-4">Paste a messy text list of 150+ technicians directly into the Slack AI bot for instant parsing and account creation.</p>
            <div className="flex items-center gap-3">
              <div className="bg-zinc-100 rounded-lg px-3 py-2 text-xs text-zinc-500">Paste messy list...</div>
              <div className="text-lg">→</div>
              <div className="text-2xl">💬</div>
              <div className="text-lg">→</div>
              <div className="space-y-1 text-xs text-zinc-600">
                <p>→ User 001 ✓</p>
                <p>→ User 002 ✓</p>
                <p>→ User 003 ✓</p>
              </div>
            </div>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2">Comprehensive Profiles</h3>
            <p className="text-xs text-zinc-600 mb-4">Instantly access active status, top venues worked, and historical timeline of recent activity.</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-zinc-200 rounded-full flex items-center justify-center">👤</div>
              <div className="text-xs text-zinc-600">
                <p className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Active Status</p>
                <p className="mt-1"><strong>Top Venues:</strong> Stadium A (5), Arena B (3)</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 ml-auto">
                {['Check-in', 'Game Ready', 'Post-Game'].map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <div className={`w-3 h-3 rounded-full ${i < 3 ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Slide>,

    // SLIDE 8: TICKETING & SLA
    <Slide key={7}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">Enterprise Ticketing & SLA Automation</h2>
        <Card className="overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead><tr className="bg-zinc-50 border-b border-zinc-200">
              <th className="py-4 px-6 text-left font-bold">Priority Level</th>
              <th className="py-4 px-6 text-center font-bold">Response Time</th>
              <th className="py-4 px-6 text-center font-bold">Resolution Time</th>
            </tr></thead>
            <tbody>
              {[
                { level: 'Critical', resp: '1 hr', res: '4 hr', color: '#dc2626' },
                { level: 'High', resp: '2 hr', res: '8 hr', color: '#f97316' },
                { level: 'Medium', resp: '4 hr', res: '24 hr', color: '#eab308' },
                { level: 'Low', resp: '8 hr', res: '72 hr', color: '#3b82f6' },
              ].map((r, i) => (
                <tr key={i} className="border-b border-zinc-100">
                  <td className="py-4 px-6 flex items-center gap-3"><div className="w-4 h-4 rounded" style={{ backgroundColor: r.color }}></div><span className="font-semibold">{r.level}</span></td>
                  <td className="py-4 px-6 text-center text-zinc-600">{r.resp}</td>
                  <td className="py-4 px-6 text-center text-zinc-600">{r.res}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <div className="grid grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2 flex items-center gap-2">🔀 Smart Routing</h3>
            <p className="text-xs text-zinc-600">Auto-assignment rules by category or venue ensure tickets bypass dispatchers and hit the right engineer instantly.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2 flex items-center gap-2">💬 Communication Siloes</h3>
            <p className="text-xs text-zinc-600">1-click toggles separate internal troubleshooting discussions (amber) from client-facing updates (blue). 8 pre-loaded quick replies ensure professional responses.</p>
          </Card>
        </div>
      </div>
    </Slide>,

    // SLIDE 9: MOBILE WORKFLOW
    <Slide key={8}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">The Edge: Mobile-First Technician Workflow</h2>
        <div className="flex gap-12 items-start">
          <div className="flex-1 space-y-6">
            <div>
              <h3 className="font-bold text-[#0f172a] mb-2">Zero Friction Access:</h3>
              <p className="text-sm text-zinc-600">No app store downloads required. Secure magic-link access directly to the browser.</p>
            </div>
            <div>
              <h3 className="font-bold text-[#0f172a] mb-2">The 3-Tap Shift:</h3>
              <ul className="space-y-2 text-sm text-zinc-600">
                <li>• <strong>1. Check-In:</strong> Geolocation and time stamped.</li>
                <li>• <strong>2. Confirm Game Ready:</strong> Systems confirmed operational.</li>
                <li>• <strong>3. Submit Post-Game:</strong> Final report submitted.</li>
              </ul>
            </div>
            <Card className="p-4 bg-zinc-50">
              <p className="text-xs text-zinc-600"><strong>The Result:</strong> 100% compliance achieved through minimal effort, pushing flawless data back up to the Command Center.</p>
            </Card>
          </div>
          <div className="flex gap-4">
            {['1. Check-In', '2. Game Ready', '3. Post-Game'].map((label, i) => (
              <div key={i} className="flex flex-col items-center">
                <div className="w-28 h-48 bg-[#0f172a] rounded-3xl border-4 border-zinc-700 flex flex-col items-center justify-center relative">
                  <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center text-white text-xl mb-2">
                    {['📍', '✓', '📋'][i]}
                  </div>
                </div>
                {i < 2 && <div className="w-8 h-0.5 bg-emerald-500 my-2 rotate-0"></div>}
                <div className="bg-emerald-500 text-white text-[10px] font-semibold px-3 py-1 rounded-full mt-2">{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Slide>,

    // SLIDE 10: CLIENT PORTAL
    <Slide key={9}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">The Client Portal: Delivering the "Wow" Factor</h2>
        <Card className="bg-gradient-to-r from-[#002C73] to-[#0A52EF] p-6 text-white mb-8">
          <p className="text-center font-semibold mb-4">Live Game Day</p>
          <div className="flex items-center justify-center gap-6">
            {['Tech Check-in', 'Readiness', 'Completion'].map((s, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${i < 2 ? 'bg-white/50' : 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.6)]'}`}></div>
                <span className="text-sm">{s}</span>
                {i < 2 && <div className="w-16 h-0.5 bg-white/30"></div>}
              </div>
            ))}
          </div>
        </Card>
        <div className="grid grid-cols-3 gap-6">
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2">Frictionless Access</h3>
            <p className="text-xs text-zinc-600">Token-gated URLs mean no passwords to remember for VP-level venue clients.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2">Live Game Day Tracking</h3>
            <p className="text-xs text-zinc-600">FedEx-style real-time event timelines. Clients watch the green pulsing "Live" dot as techs check in, confirm readiness, and submit reports.</p>
          </Card>
          <Card className="p-6">
            <h3 className="font-bold text-[#0f172a] mb-2">Face to the Name</h3>
            <p className="text-xs text-zinc-600">Profiles, titles, and photos of the exact ANC personnel arriving at their building, elevating the service from anonymous to premium.</p>
          </Card>
        </div>
      </div>
    </Slide>,

    // SLIDE 11: AI TICKET RESOLUTION
    <Slide key={10}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-12">AI-Powered Issue Resolution</h2>
        <div className="flex items-center gap-8">
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-500 mb-3">Client Input</p>
            <Card className="p-6 bg-zinc-100 border-zinc-200">
              <p className="text-sm text-zinc-700 italic">"The left LED panel on the scoreboard went dark during the third quarter."</p>
            </Card>
          </div>
          <div className="text-4xl text-[#0A52EF]">→</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-zinc-500 mb-3">The AI Transformation</p>
            <Card className="p-6">
              <p className="font-bold text-sm mb-3">Ticket card</p>
              <div className="space-y-2 text-sm">
                <div className="flex gap-3"><span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-semibold">Categorizes:</span><span>Hardware</span></div>
                <div className="flex gap-3"><span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-semibold">Prioritizes:</span><span>High</span></div>
                <div className="flex gap-3"><span className="text-xs font-semibold text-zinc-500">Standardizes:</span><span>"LED panel failure — scoreboard section"</span></div>
                <div className="flex gap-3"><span className="text-xs font-semibold text-zinc-500">Routes:</span><span>Immediately to the correct engineer</span></div>
              </div>
            </Card>
          </div>
        </div>
        <p className="text-center text-sm text-zinc-600 mt-8">Result: Clients report issues naturally; the AI enforces enterprise structure invisibly.</p>
      </div>
    </Slide>,

    // SLIDE 12: CLAW AI
    <Slide key={11}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">'Claw' — The AI Slack Architect</h2>
        <div className="flex gap-8">
          <div className="flex-1 space-y-6">
            <div>
              <h3 className="font-bold text-lg text-[#0f172a]">Real-Time Querying</h3>
              <p className="text-sm text-zinc-600 mt-1">Instead of digging through menus, staff ask: 'Who's working TD Garden tonight?'<br/>→ Returns instant, accurate assigned tech lists.</p>
            </div>
            <div>
              <h3 className="font-bold text-lg text-[#0f172a]">Autonomous Workflows</h3>
              <ul className="text-sm text-zinc-600 mt-1 space-y-1">
                <li>• 8 AM Daily Event Slate Digests</li>
                <li>• 30-minute automated escalation alerts</li>
                <li>• Hourly post-game operational summaries</li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold text-lg text-[#0f172a]">Design Philosophy</h3>
              <p className="text-sm text-zinc-600 mt-1">Silent when operations are flawless; loud when attention is required.</p>
            </div>
          </div>
          <div className="flex-1">
            <Card className="p-1 bg-zinc-100">
              <div className="bg-white rounded-lg p-4 mb-2 text-right">
                <p className="inline-block bg-zinc-100 rounded-2xl px-4 py-2 text-sm">Who's working TD Garden tonight?</p>
              </div>
              <div className="bg-white rounded-lg p-4">
                <p className="text-xs text-zinc-400 mb-2">Claw</p>
                <div className="bg-blue-50 rounded-lg p-4 text-sm">
                  <p className="font-bold mb-2">TD Garden Staffing - Tonight's Event</p>
                  <p>1. <strong>Alex Chen</strong> - Lead AV Tech (<span className="text-emerald-600">Active</span>)</p>
                  <p>2. <strong>Maria Rodriguez</strong> - Lighting Specialist (<span className="text-emerald-600">Active</span>)</p>
                  <p>3. <strong>David Kim</strong> - Network Engineer (<span className="text-emerald-600">Active</span>)</p>
                </div>
                <p className="text-xs text-zinc-400 mt-2 text-center">Instant generation from live data.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </Slide>,

    // SLIDE 13: EXECUTIVE REPORTING
    <Slide key={12}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-10">Executive Reporting & Operations Oversight</h2>
        <div className="flex gap-6 items-start">
          <div className="space-y-4 flex-1">
            <div><h3 className="font-bold text-sm">Server-Side Generation</h3><p className="text-xs text-zinc-600 mt-1">Flawless, branded PDFs generated directly via headless Chrome (eliminating messy print-to-screen hacks).</p></div>
            <div><h3 className="font-bold text-sm">SLA Justification</h3><p className="text-xs text-zinc-600 mt-1">Explicit metrics on SLA response and resolution compliance prove system efficacy at budget review time.</p></div>
          </div>
          <Card className="p-6 flex-1">
            <p className="font-black text-sm mb-4">WEEKLY EXECUTIVE SUMMARY</p>
            <div className="flex gap-6 mb-4">
              <div><p className="text-2xl font-black text-[#0A52EF]">98.5%</p><p className="text-[9px] text-zinc-500 uppercase font-semibold">Coverage Rate</p></div>
              <div><p className="text-2xl font-black text-[#0A52EF]">92%</p><p className="text-[9px] text-zinc-500 uppercase font-semibold">Workflow Completion</p></div>
              <div><p className="text-2xl font-black text-[#0A52EF]">4,500</p><p className="text-[9px] text-zinc-500 uppercase font-semibold">Total Labor Hours</p></div>
            </div>
            <table className="w-full text-[10px]">
              <thead><tr className="border-b"><th className="py-1 text-left text-zinc-500">SLA Metric</th><th className="text-center text-zinc-500">Target</th><th className="text-center text-zinc-500">Actual</th><th className="text-center text-zinc-500">Status</th></tr></thead>
              <tbody>
                {[['Response (P1)', '<15 min', '12 min'], ['Response (P2)', '<15 min', '12 min'], ['Response (P3)', '<15 min', '8 min']].map(([m, t, a], i) => (
                  <tr key={i} className="border-b border-zinc-100"><td className="py-1">{m}</td><td className="text-center">{t}</td><td className="text-center">{a}</td><td className="text-center">✅</td></tr>
                ))}
              </tbody>
            </table>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-3">
              <p className="text-[10px] font-bold text-amber-900">CRITICAL ATTENTION AREAS</p>
              <p className="text-[10px] text-amber-800">→ Network Latency Spike (Zone 3)</p>
              <p className="text-[10px] text-amber-800">→ Staffing Shortage (Night Shift)</p>
            </div>
          </Card>
          <div className="space-y-4 flex-1">
            <div><h3 className="font-bold text-sm">C-Level Clarity</h3><p className="text-xs text-zinc-600 mt-1">Automated executive summaries instantly highlight Coverage Rates, Workflow Completion, and Total Labor Hours.</p></div>
            <div><h3 className="font-bold text-sm">Actionable Intelligence</h3><p className="text-xs text-zinc-600 mt-1">Trend arrows and amber callout boxes highlight exact attention areas for the coming week.</p></div>
          </div>
        </div>
      </div>
    </Slide>,

    // SLIDE 14: SECURITY
    <Slide key={13}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-12">Enterprise Security & Access Control</h2>
        <div className="max-w-2xl mx-auto space-y-4">
          {[
            { layer: 'Layer 1 (Admin)', desc: 'Universal access, system settings, global user management.', color: '#0A52EF', icon: '✅' },
            { layer: 'Layer 2 (Manager)', desc: 'Event assignments, ticket routing, and client portal management.', color: '#f59e0b', icon: '⚠️' },
            { layer: 'Layer 3 (Technician)', desc: 'Confined strictly to personal event workflows and check-ins.', color: '#3b82f6', icon: 'ℹ️' },
          ].map((l, i) => (
            <div key={i}>
              <Card className="p-6 flex items-center gap-4 relative">
                <div className="w-1 h-full absolute left-0 top-0 rounded-l-2xl" style={{ backgroundColor: l.color }}></div>
                <div className="flex-1 ml-2">
                  <p className="font-bold text-[#0f172a]">{l.layer}:</p>
                  <p className="text-sm text-zinc-600 mt-0.5">{l.desc}</p>
                </div>
                <span className="text-xl">{l.icon}</span>
              </Card>
              {i < 2 && <div className="flex justify-center py-1"><div className="w-px h-6 bg-zinc-300"></div><span className="text-xs text-zinc-400 mx-2">🔒</span><div className="w-px h-6 bg-zinc-300"></div></div>}
            </div>
          ))}
        </div>
        <div className="mt-8 bg-[#0f172a] text-center py-4 rounded-lg max-w-2xl mx-auto">
          <p className="text-sm text-white"><strong>Backend Enforcement:</strong> <span className="text-emerald-400">Strict server-side route protection (403 Forbidden)</span> <span className="text-red-400">rejects unauthorized API calls.</span></p>
          <p className="text-xs text-zinc-400 mt-1">Distinct siloes guarantee internal comments are never exposed to client portals.</p>
        </div>
      </div>
    </Slide>,

    // SLIDE 15: TECH FOUNDATION
    <Slide key={14}>
      <div className="max-w-5xl px-8 w-full">
        <h2 className="text-5xl font-black text-[#0f172a] mb-12">The Technological Foundation</h2>
        <div className="grid grid-cols-2 gap-6">
          {[
            { title: 'Frontend Architecture', desc: 'Next.js 14, React, Tailwind CSS for a seamless, mobile-responsive UI.' },
            { title: 'Backend & Data', desc: 'PostgreSQL 17 database coupled with Google Calendar API (running on a 15-minute sync cycle).' },
            { title: 'AI & Automation', desc: 'AI for semantic parsing, Slack framework for real-time internal communications.' },
            { title: 'Infrastructure', desc: 'Dedicated VPS hosted via Docker + EasyPanel, supported by frictionless GitHub auto-deploy pipelines.' },
          ].map((t, i) => (
            <Card key={i} className="p-8">
              <h3 className="font-black text-lg text-[#0f172a]">{t.title}</h3>
              <p className="text-sm text-zinc-600 mt-2">{t.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </Slide>,
  ]

  return slides[slide]
}
