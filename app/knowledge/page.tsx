'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface Article {
  id: string
  title: string
  category: string
  content: string
  tags: string[]
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '📚' },
  { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
  { id: 'operations', label: 'Operations', icon: '⚡' },
  { id: 'technical', label: 'Technical', icon: '📡' },
  { id: 'venues', label: 'Venues & Clients', icon: '🏟' },
  { id: 'policies', label: 'Policies & SLAs', icon: '📋' },
  { id: 'company', label: 'Company', icon: '🏢' },
]

const ARTICLES: Article[] = [
  // Getting Started
  {
    id: 'what-is-anc',
    title: 'What is ANC?',
    category: 'getting-started',
    tags: ['overview', 'about', 'company'],
    content: `# What is ANC?

ANC (formerly ANC Sports Enterprises LLC) is a dynamic, independent sports entertainment agency providing integrated digital display solutions, operational services, and media sponsorships for venues worldwide.

## Key Facts

- **Founded:** 1997 by Jerry Cifarelli Sr.
- **Headquarters:** 2 Manhattanville Rd, Suite 402, Purchase, NY 10577
- **Owner:** C10 Media (acquired from Learfield in January 2023)
- **Industries:** Sports, Entertainment, Transit, Retail, Commercial, Education

## Brand Names
- **ANC** — Core brand for venue technology
- **ANC Experiences** — Fan experience division
- **ANC Studios** — Creative services

## What We Do
ANC designs, installs, and operates LED display systems in major sports venues, entertainment facilities, and transit hubs. We don't just install screens — we provide full-service operations including on-site technicians, 24/7 support, and media sponsorship sales.`
  },
  {
    id: 'your-first-game-day',
    title: 'Your First Game Day — What to Expect',
    category: 'getting-started',
    tags: ['onboarding', 'workflow', 'new hire'],
    content: `# Your First Game Day

Welcome to ANC! Here's what a typical game day looks like for our on-site technicians.

## Before the Game (3-4 hours prior)

1. **Check In** — Log your arrival in the ANC Service Dashboard
2. **Systems Check** — Power on all displays, verify LiveSync connectivity
3. **Pre-Game Content** — Confirm sponsor content, team graphics, and animations are loaded
4. **Sound Check** — Verify audio systems if applicable
5. **Communication** — Connect with venue operations manager

## During the Game

- **Monitor all displays** for issues (dead pixels, signal loss, content errors)
- **Respond to real-time requests** from venue ops (score corrections, emergency messages)
- **Document any issues** in the ticketing system with photos

## Post-Game

1. **Post-Game Report** — Submit workflow completion in the dashboard
2. **Power Down** — Follow venue-specific shutdown procedures
3. **Issue Logging** — Create tickets for any hardware issues discovered
4. **Check Out** — Log departure time

## Key Contacts
- **24/7 Support Hotline** — For critical issues during events
- **Your Market Lead** — For scheduling and assignment questions
- **Venue Operations Manager** — Your on-site point of contact`
  },
  {
    id: 'emergency-contacts',
    title: 'Emergency Contacts & Escalation',
    category: 'getting-started',
    tags: ['emergency', 'contacts', 'escalation', 'support'],
    content: `# Emergency Contacts & Escalation

## Escalation Tiers

| Tier | Response Time | When to Use |
|------|--------------|-------------|
| **Critical** | 1 hour response / 4 hour resolution | Total system failure during live event |
| **High** | 2 hour response / 8 hour resolution | Major display malfunction, multiple screens down |
| **Medium** | 4 hour response / 24 hour resolution | Single screen issue, intermittent problems |
| **Low** | 8 hour response / 72 hour resolution | Cosmetic issues, minor software glitches |

## Who to Call

- **During a live event:** Call the 24/7 support hotline immediately for Critical/High issues
- **Non-game day:** Create a ticket in the ANC Service Dashboard
- **Hardware failure:** Document with photos, create ticket, contact your market lead

## Escalation Path
1. On-site technician attempts fix
2. If unresolved → Contact 24/7 support hotline
3. If still unresolved → Market Lead is notified
4. If critical → Operations management (Joe Occhipinti's team) is paged`
  },
  // Operations
  {
    id: 'game-day-checklist',
    title: 'Game Day Operations Checklist',
    category: 'operations',
    tags: ['checklist', 'workflow', 'game day', 'procedures'],
    content: `# Game Day Operations Checklist

## Pre-Event (T-3 hours)
- [ ] Arrive at venue, check in via ANC Dashboard
- [ ] Power on all LED displays and verify boot sequence
- [ ] Confirm LiveSync connection to all displays
- [ ] Test scoreboard functionality (score, time, period)
- [ ] Verify ribbon board content rotation
- [ ] Check courtside/field-level displays
- [ ] Confirm sponsor content is loaded and scheduled
- [ ] Test emergency messaging capability
- [ ] Verify audio system integration (if applicable)
- [ ] Contact venue ops manager — confirm event details

## Event Start (T-0)
- [ ] Confirm "Game Ready" status in ANC Dashboard
- [ ] Monitor all displays for first 15 minutes
- [ ] Verify live scoring data feed
- [ ] Confirm replay system connectivity

## During Event
- [ ] Continuous monitoring of all display systems
- [ ] Respond to venue ops requests within 5 minutes
- [ ] Document any issues with timestamp and photos
- [ ] Coordinate with broadcast team as needed

## Post-Event
- [ ] Submit post-game report in ANC Dashboard
- [ ] Power down displays per venue SOP
- [ ] Log any maintenance issues as tickets
- [ ] Secure equipment and check out`
  },
  {
    id: 'workflow-states',
    title: 'Event Workflow States Explained',
    category: 'operations',
    tags: ['workflow', 'status', 'check-in', 'game ready'],
    content: `# Event Workflow States

Every event in the ANC Service Dashboard moves through a defined lifecycle:

## 1. Scheduled (Pending)
- Event is on the calendar
- Staff may or may not be assigned
- No on-site activity yet

## 2. Staff On Site (Checked In)
- Technician has arrived and checked in via the dashboard
- Triggers notification to operations team
- If no check-in 2 hours before event start → escalation alert fires

## 3. Game Ready
- All systems verified operational
- Scoreboard, ribbons, courtside, concourse displays confirmed
- LiveSync connectivity verified
- Submitted by tech after systems check

## 4. Completed (Post-Game Submitted)
- Post-game report filed
- Any issues documented
- Power-down confirmed
- Event lifecycle complete

## What Happens If Steps Are Missed?
- **No check-in:** Automated escalation alert sent to market lead and ops team
- **No game ready:** Dashboard shows amber warning, ops manager notified
- **No post-game report:** Flagged in daily digest, affects completion rate metrics`
  },
  // Technical
  {
    id: 'livesync-overview',
    title: 'LiveSync — What It Is and How It Works',
    category: 'technical',
    tags: ['livesync', 'software', 'control', 'displays'],
    content: `# LiveSync Operating System

LiveSync is ANC's proprietary software platform for unified venue-wide control and content synchronization across all digital displays.

## What It Does
- **Centralized Control** — Manage every screen in the venue from one interface
- **Content Synchronization** — Keep scoreboard, ribbons, fascia, and concourse displays in sync
- **Real-Time Updates** — Push content changes instantly across all displays
- **Scheduling** — Pre-program content rotations for sponsors, team graphics, and game-day sequences
- **Emergency Override** — Instantly push emergency messaging to all screens

## Key Features
- Multi-zone content management
- Live scoring data integration
- Sponsor rotation scheduling
- Replay and highlight integration
- Remote monitoring and diagnostics

## Venues Using LiveSync
LiveSync is deployed at all ANC-operated venues including:
- Levi's Stadium (SF 49ers) — NFL's largest 4K video boards
- Fenway Park (Red Sox) — Center field videoboard + full signage network
- Gainbridge Fieldhouse (Pacers) — "Fieldhouse of the Future" renovation

## For Technicians
LiveSync is your primary tool on game day. If you experience connectivity issues:
1. Check network connection between control room and display processors
2. Restart the LiveSync client application
3. If unresolved, contact 24/7 support hotline with the venue name and error message`
  },
  {
    id: 'led-products',
    title: 'LED Display Products & Specifications',
    category: 'technical',
    tags: ['LED', 'displays', 'pixel pitch', 'specifications', 'products'],
    content: `# LED Display Products

ANC works with leading LED manufacturers to install best-in-class display systems.

## Display Types

### Center-Hung Scoreboards
- Primary game information display
- Typically 4K resolution with 4mm-6mm pixel pitch
- Includes front, back, side, and bottom panels
- Suspended from arena ceiling with steel cables

### Ribbon Boards
- Long, narrow displays around the seating bowl
- 10mm-16mm pixel pitch for distance viewing
- Used primarily for sponsor rotation and game stats
- Can scroll content continuously

### Fascia Displays
- Mounted on upper deck fascia/railing
- Medium pixel pitch (6mm-10mm)
- Sponsor and directional content

### Courtside/Field-Level LEDs
- Closest to the playing surface
- High resolution (2.5mm-6mm) for camera visibility
- Broadcast-visible sponsor placements
- Highest value advertising inventory

### Concourse Displays
- Wayfinding, sponsor content, and venue information
- Indoor fine-pitch (2.5mm-4mm)
- Located at gates, food courts, and corridors

## Key Specifications
| Spec | What It Means |
|------|--------------|
| **Pixel Pitch** | Distance between LED pixels in mm — lower = higher resolution |
| **Brightness (nits)** | How bright the display is — outdoor needs 5,000+ nits |
| **Refresh Rate** | How often the image updates — higher = smoother for cameras |
| **Viewing Angle** | How far off-center you can be and still see the image clearly |
| **IP Rating** | Weather protection — outdoor displays need IP65+ |

## Manufacturer Partners
- **LG** — Official digital signage partner (e.g., Fenway Park center field board)
- Product lines include indoor fine-pitch, outdoor stadium, and specialty displays`
  },
  // Venues & Clients
  {
    id: 'venue-portfolio',
    title: 'ANC Venue Portfolio',
    category: 'venues',
    tags: ['venues', 'clients', 'stadiums', 'arenas'],
    content: `# ANC Venue Portfolio

ANC operates display systems at 43+ venues across major sports leagues, entertainment, transit, and commercial sectors.

## Major League Sports

### MLB
- **LA Dodgers** — Dodger Stadium
- **Boston Red Sox** — Fenway Park (partner since 2011)
- **Milwaukee Brewers** — American Family Field

### NFL
- **SF 49ers** — Levi's Stadium (NFL's largest 4K video boards)
- **Baltimore Ravens** — M&T Bank Stadium
- **Washington Commanders** — Northwest Stadium

### NBA / NHL
- **Indiana Pacers** — Gainbridge Fieldhouse ("Fieldhouse of the Future")
- **Cleveland Cavaliers** — Rocket Mortgage FieldHouse
- **Philadelphia 76ers / Flyers** — Wells Fargo Center

## Transit & Commercial
- **Moynihan Train Hall (NYC)** — 1,700 sq ft of 4mm LED, real-time transit updates
- **Westfield World Trade Center** — 19-screen digital media network
- **JP Morgan Chase Flagship (NYC)** — Custom LED system with twin giant LED rings

## College / University
- University of Texas, Notre Dame, Oregon State, University of Arkansas

## Strategic Partners
- **LG** — Official digital signage partner
- **Learfield** — Former parent company, current partner`
  },
  {
    id: 'project-highlights',
    title: 'Notable Project Case Studies',
    category: 'venues',
    tags: ['projects', 'case studies', 'installations'],
    content: `# Notable ANC Projects

## Levi's Stadium — SF 49ers
- Installed the **NFL's largest 4K video boards** (unveiled 2025 season)
- Unified stadium-wide control via **LiveSync**
- Full LED fascia, ribbon, and concourse network

## Fenway Park — Boston Red Sox
- Long-term partner since **2011**
- Installed new **LG main LED videoboard** in center field (2025)
- Comprehensive digital signage network
- Full LiveSync integration

## Gainbridge Fieldhouse — Indiana Pacers
- Part of the **"Fieldhouse of the Future"** renovation
- New center-hung LED scoreboard
- Complete concourse display upgrade
- Ascension St. Vincent Entry Pavilion digital experience

## Moynihan Train Hall — NYC
- **1,700 square feet** of 4mm LED displays
- Live video capability + real-time transit updates
- Integrated modern AV into historic building (former post office)

## Rocket Mortgage FieldHouse — Cleveland Cavaliers
- **"Power Portal"** LED entryway
- Full arena digital signage network
- Concourse activation displays`
  },
  // Policies & SLAs
  {
    id: 'sla-tiers',
    title: 'SLA Tiers & Response Times',
    category: 'policies',
    tags: ['SLA', 'response time', 'resolution', 'support'],
    content: `# Service Level Agreement (SLA) Tiers

ANC commits to defined response and resolution times based on issue severity.

## Tier Definitions

### Critical (Tier 1)
- **Response:** 1 hour
- **Resolution:** 4 hours
- **Examples:** Complete scoreboard failure during live event, all displays dark, safety-related display malfunction
- **Escalation:** Immediate page to operations management

### High (Tier 2)
- **Response:** 2 hours
- **Resolution:** 8 hours
- **Examples:** Multiple screens down, LiveSync system offline, broadcast-visible display failure
- **Escalation:** Market lead notified within 30 minutes

### Medium (Tier 3)
- **Response:** 4 hours
- **Resolution:** 24 hours
- **Examples:** Single screen malfunction, content scheduling error, intermittent connectivity
- **Escalation:** Standard ticket workflow

### Low (Tier 4)
- **Response:** 8 hours
- **Resolution:** 72 hours
- **Examples:** Cosmetic pixel defects, minor software bugs, non-urgent maintenance
- **Escalation:** Included in daily digest

## How SLA Is Tracked
- **Response time** starts when ticket is created
- **First response** is measured when an ANC team member first comments
- **Resolution time** is measured when ticket status changes to "Resolved"
- All metrics are visible on the Reports page and Monthly Service Reports`
  },
  // Company
  {
    id: 'leadership',
    title: 'ANC Leadership Team',
    category: 'company',
    tags: ['leadership', 'executives', 'management', 'team'],
    content: `# ANC Leadership

## Executive Team

| Name | Title | Focus Area |
|------|-------|-----------|
| **Jerry Cifarelli Jr.** | President & CEO | Overall strategy, bought ANC back from Learfield via C10 Media |
| **Joseph Occhipinti** | President, Operations & Venue Services | 150+ person field tech team, venue operations, service delivery |
| **Jireh Billings** | President, Venue Partnerships | New venue acquisition, partnership development |
| **John Obropta** | President, Media & Sponsorships | Advertising sales, sponsor relationships, revenue generation |
| **Steven Myrick** | Chief People Officer | HR, talent, workforce management |
| **Kirsten Savage** | Chief of Staff | Cross-functional coordination, executive operations |

## Corporate History
- **1997:** Founded by Jerry Cifarelli Sr.
- **2009:** Celeritas Management acquired majority stake
- **2015:** Acquired by Learfield
- **2023:** Jerry Cifarelli Jr. and C10 Media bought ANC back from Learfield
- **Today:** Independent, privately held under C10 Media`
  },
  {
    id: 'company-history',
    title: 'ANC History & Timeline',
    category: 'company',
    tags: ['history', 'timeline', 'milestones'],
    content: `# ANC History

## Timeline

### 1997 — Founded
Jerry Cifarelli Sr. establishes ANC Sports Enterprises LLC, focused on sports venue technology and display solutions.

### 2000s — Growth
ANC expands into major league sports venues, establishing partnerships with MLB, NFL, NBA, and NHL teams. Develops expertise in LED scoreboard installation and operations.

### 2009 — Investment
Celeritas Management acquires a majority stake, providing capital for expansion into new markets and technologies.

### 2011 — Fenway Park Partnership
Begins long-term relationship with the Boston Red Sox — a partnership that continues today.

### 2015 — Learfield Acquisition
Learfield acquires ANC, integrating it into a larger sports media and technology portfolio.

### 2023 — Return to Independence
Jerry Cifarelli Jr. and C10 Media purchase ANC back from Learfield. ANC returns to its founding family's ownership with renewed focus on innovation and growth.

### 2025 — Modern Era
- NFL's largest 4K video boards installed at Levi's Stadium
- New LG center field videoboard at Fenway Park
- LiveSync platform deployed across all venues
- Launch of ANC Service Dashboard for operations management

### Today
ANC operates in 43+ venues across sports, entertainment, transit, retail, and education sectors. The company employs 150+ field technicians and serves clients including the Dodgers, 49ers, Pacers, and Cavaliers.`
  },
]

export default function KnowledgePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<'articles' | 'chat'>('articles')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: Date.now() }])
    setInput('')
    setActiveView('chat')
    setLoading(true)
    try {
      const res = await fetch('/api/knowledge/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text.trim() }) })
      const data = await res.json()
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: data.response || 'No response.', timestamp: Date.now() }])
    } catch {
      setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: 'assistant', content: 'Something went wrong.', timestamp: Date.now() }])
    } finally { setLoading(false) }
  }

  const filteredArticles = ARTICLES.filter(a => {
    const matchesCat = selectedCategory === 'all' || a.category === selectedCategory
    const matchesSearch = !searchQuery || a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.tags.some(t => t.includes(searchQuery.toLowerCase()))
    return matchesCat && matchesSearch
  })

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center shadow-lg shadow-[#0A52EF]/20">
              <img src="/ANC_Logo_2023_white.png" alt="" className="h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">Knowledge Base <span className="ml-2 text-[10px] bg-[#0A52EF]/10 text-[#0A52EF] px-2 py-0.5 rounded-full font-medium align-middle">Preview</span></h1>
              <p className="text-xs text-zinc-400">Browse articles or ask the AI anything</p>
            </div>
          </div>
          <div className="flex bg-zinc-100 rounded-lg p-0.5">
            <button onClick={() => { setActiveView('articles'); setSelectedArticle(null) }}
              className={`text-xs px-4 py-1.5 rounded-md transition-all ${activeView === 'articles' ? 'bg-white text-zinc-900 shadow-sm font-medium' : 'text-zinc-500'}`}>
              Articles
            </button>
            <button onClick={() => setActiveView('chat')}
              className={`text-xs px-4 py-1.5 rounded-md transition-all ${activeView === 'chat' ? 'bg-white text-zinc-900 shadow-sm font-medium' : 'text-zinc-500'}`}>
              Ask AI {messages.length > 0 && `(${messages.filter(m => m.role === 'user').length})`}
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="mb-6">
          <div className="relative bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="flex items-center px-4 py-3">
              <svg className="w-4 h-4 text-zinc-400 mr-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              <input
                ref={inputRef}
                type="text"
                value={activeView === 'chat' ? input : searchQuery}
                onChange={e => activeView === 'chat' ? setInput(e.target.value) : setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && activeView === 'chat') sendMessage(input) }}
                placeholder={activeView === 'chat' ? 'Ask anything about ANC...' : 'Search articles...'}
                className="flex-1 text-sm text-zinc-900 placeholder-zinc-400 outline-none"
                disabled={loading}
              />
              {activeView === 'chat' && (
                <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()}
                  className="ml-3 px-4 py-1.5 bg-[#0A52EF] text-white rounded-lg text-xs font-medium hover:bg-[#0840C0] disabled:opacity-30 transition-all">
                  {loading ? 'Thinking...' : 'Ask'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ARTICLES VIEW */}
        {activeView === 'articles' && !selectedArticle && (
          <div className="flex gap-6">
            {/* Category sidebar */}
            <div className="w-48 flex-shrink-0">
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden sticky top-4">
                <div className="px-4 py-3 border-b border-zinc-100">
                  <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Categories</p>
                </div>
                <div className="p-2">
                  {CATEGORIES.map(cat => (
                    <button key={cat.id} onClick={() => setSelectedCategory(cat.id)}
                      className={`w-full text-left text-xs px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${selectedCategory === cat.id ? 'bg-[#0A52EF]/10 text-[#0A52EF] font-medium' : 'text-zinc-600 hover:bg-zinc-50'}`}>
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                      <span className="ml-auto text-[10px] text-zinc-300">{cat.id === 'all' ? ARTICLES.length : ARTICLES.filter(a => a.category === cat.id).length}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Articles grid */}
            <div className="flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filteredArticles.map(article => {
                  const cat = CATEGORIES.find(c => c.id === article.category)
                  return (
                    <button key={article.id} onClick={() => setSelectedArticle(article)}
                      className="bg-white rounded-xl border border-zinc-200 p-5 text-left hover:shadow-md hover:border-zinc-300 transition-all group">
                      <div className="flex items-start gap-3">
                        <span className="text-lg mt-0.5">{cat?.icon}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-zinc-900 group-hover:text-[#0A52EF] transition-colors">{article.title}</h3>
                          <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider">{cat?.label}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {article.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[10px] bg-zinc-100 text-zinc-500 rounded px-1.5 py-0.5">{tag}</span>
                            ))}
                          </div>
                        </div>
                        <span className="text-zinc-300 group-hover:text-[#0A52EF] transition-colors">→</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              {filteredArticles.length === 0 && (
                <div className="bg-white rounded-xl border border-zinc-200 p-12 text-center">
                  <p className="text-zinc-400 text-sm">No articles found</p>
                  <button onClick={() => { setActiveView('chat'); setInput(searchQuery) }} className="text-xs text-[#0A52EF] mt-2 hover:underline">
                    Ask AI instead →
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ARTICLE DETAIL VIEW */}
        {activeView === 'articles' && selectedArticle && (
          <div>
            <button onClick={() => setSelectedArticle(null)} className="text-xs text-zinc-500 hover:text-zinc-700 mb-4 flex items-center gap-1">
              ← Back to articles
            </button>
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-8 py-6 border-b border-zinc-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">{CATEGORIES.find(c => c.id === selectedArticle.category)?.label}</span>
                </div>
                <h1 className="text-xl font-bold text-zinc-900">{selectedArticle.title}</h1>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {selectedArticle.tags.map(tag => (
                    <span key={tag} className="text-[10px] bg-zinc-100 text-zinc-500 rounded-full px-2.5 py-0.5">{tag}</span>
                  ))}
                </div>
              </div>
              <div className="px-8 py-6 prose prose-sm prose-zinc max-w-none [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-sm [&>table]:text-xs">
                <ReactMarkdown>{selectedArticle.content}</ReactMarkdown>
              </div>
              <div className="px-8 py-4 border-t border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
                <p className="text-xs text-zinc-400">Have a question about this topic?</p>
                <button onClick={() => { setActiveView('chat'); sendMessage(`Tell me more about: ${selectedArticle.title}`) }}
                  className="text-xs text-[#0A52EF] font-medium hover:underline">
                  Ask AI →
                </button>
              </div>
            </div>
          </div>
        )}

        {/* CHAT VIEW */}
        {activeView === 'chat' && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="h-[500px] overflow-y-auto px-6 py-5 space-y-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A52EF]/10 to-[#002C73]/10 flex items-center justify-center mb-4">
                    <img src="/ANC_Logo_2023_blue.png" alt="" className="h-8" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">Ask me anything about ANC</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm mb-6">I have access to product specs, venue info, company history, operational procedures, and more.</p>
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                    {['What LED products does ANC offer?', 'How does LiveSync work?', 'Walk me through a game day', 'What are the SLA tiers?', 'Tell me about Fenway Park'].map((q, i) => (
                      <button key={i} onClick={() => sendMessage(q)}
                        className="text-xs bg-zinc-50 border border-zinc-200 rounded-full px-3.5 py-1.5 text-zinc-600 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%]`}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center">
                          <img src="/ANC_Logo_2023_white.png" alt="" className="h-3" />
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-500">ANC Knowledge Base</span>
                        <span className="text-[10px] text-zinc-300">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 ${msg.role === 'user' ? 'bg-[#0A52EF] text-white rounded-br-md' : 'bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-bl-md'}`}>
                      {msg.role === 'user' ? (
                        <p className="text-sm">{msg.content}</p>
                      ) : (
                        <div className="text-sm leading-relaxed prose prose-sm prose-zinc max-w-none [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>li]:ml-4 [&>table]:text-xs">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center">
                        <img src="/ANC_Logo_2023_white.png" alt="" className="h-3" />
                      </div>
                      <span className="text-[11px] font-semibold text-zinc-500">ANC Knowledge Base</span>
                    </div>
                    <div className="bg-zinc-50 border border-zinc-200 rounded-2xl rounded-bl-md px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#0A52EF] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[#0A52EF] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 rounded-full bg-[#0A52EF] animate-bounce" style={{ animationDelay: '300ms' }} />
                        <span className="text-xs text-zinc-400 ml-2">Searching knowledge base...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {messages.length > 0 && !loading && (
              <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50">
                <div className="flex flex-wrap gap-1.5">
                  {['Tell me more', 'What else should I know?', 'Give me the technical details', 'Who handles this?'].map((q, i) => (
                    <button key={i} onClick={() => sendMessage(q)} disabled={loading}
                      className="text-[11px] bg-white border border-zinc-200 rounded-full px-3 py-1.5 text-zinc-500 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors disabled:opacity-40">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
