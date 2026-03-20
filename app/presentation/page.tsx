'use client'

import { useState } from 'react'

interface MindMapNode {
  id: string
  label: string
  description: string
  children?: MindMapNode[]
  color: string
  icon: string
}

const mindMapData: MindMapNode = {
  id: 'root',
  label: 'ANC Service Dashboard',
  description: 'Unified operations platform for 43+ venues across 15 markets',
  color: '#0A52EF',
  icon: '🏟️',
  children: [
    {
      id: 'events',
      label: 'Event Management',
      description: 'Auto-syncs 250+ events from Google Calendar every 15 minutes',
      color: '#f97316',
      icon: '📅',
      children: [
        { id: 'cal', label: 'Calendar View', description: 'Weekly grid with league-colored event cards and assigned staff names', color: '#f97316', icon: '📆' },
        { id: 'list', label: 'List View', description: 'Searchable table with date, time, venue, league, assigned techs, status', color: '#f97316', icon: '📋' },
        { id: 'workflow', label: '3-Stage Workflow', description: 'Check-in → Game Ready → Post-Game Report. Mobile-friendly — techs tap through on their phone', color: '#f97316', icon: '⚡' },
        { id: 'assign', label: 'Smart Assignment', description: 'Assign techs with weekly hours visibility. Green under 30h, amber under 40h, red over 40h', color: '#f97316', icon: '👤' },
      ],
    },
    {
      id: 'venues',
      label: 'Venue Operations',
      description: '43+ venues with assignment tracking, specs, and contracted services',
      color: '#3b82f6',
      icon: '🏢',
      children: [
        { id: 'tracker', label: 'Assignment Tracker', description: 'Red/green indicators showing "4/6 assigned" per venue. Filter by day, week, month', color: '#3b82f6', icon: '🎯' },
        { id: 'specs', label: 'Display Specs', description: 'Installed LED specs auto-populated from Proposal Engine: manufacturer, model, pixel pitch, dimensions', color: '#3b82f6', icon: '🖥️' },
        { id: 'services', label: 'Contracted Services', description: 'Toggle services per venue: Full Service, On-Call Support, LED Maintenance, Content Management', color: '#3b82f6', icon: '🔧' },
        { id: 'portal-link', label: 'Client Portal Link', description: 'Unique shareable URL per venue for client self-service access', color: '#3b82f6', icon: '🔗' },
      ],
    },
    {
      id: 'staff',
      label: 'Staff Management',
      description: '150+ technicians with profiles, workload tracking, and bulk import',
      color: '#10b981',
      icon: '👥',
      children: [
        { id: 'profiles', label: 'Profile Cards', description: 'Card and list views with photos, title, role, contact info. Click for full detail page', color: '#10b981', icon: '🪪' },
        { id: 'detail', label: 'Staff Detail Page', description: 'Hours this week/month, completion rate ring, markets covered, upcoming events, activity timeline', color: '#10b981', icon: '📊' },
        { id: 'import', label: 'Bulk Import', description: 'Download CSV template, fill in 150 techs, upload. Or paste messy data into Slack — AI handles it', color: '#10b981', icon: '📥' },
        { id: 'labor', label: 'Labor Budget', description: 'Estimated hours per league (NBA=7.5h). Dashboard shows weekly hours per staff with progress bars', color: '#10b981', icon: '💰' },
      ],
    },
    {
      id: 'tickets',
      label: 'Enterprise Ticketing',
      description: 'Full ticket lifecycle with SLA tracking, auto-assignment, and Slack integration',
      color: '#8b5cf6',
      icon: '🎟️',
      children: [
        { id: 'sla', label: 'SLA Tracking', description: 'Critical: 1h response / 4h resolution. Auto-applied on creation. Visual indicators: met, overdue, breached', color: '#8b5cf6', icon: '⏱️' },
        { id: 'auto-assign', label: 'Auto-Assignment', description: 'Route by category and venue. Hardware → Chris D. Most specific rule wins', color: '#8b5cf6', icon: '🔀' },
        { id: 'comments', label: 'Internal / External', description: 'Toggle between client-visible and internal-only comments. Amber border for internal. Clients never see behind the curtain', color: '#8b5cf6', icon: '💬' },
        { id: 'canned', label: 'Quick Replies', description: '8 templates: Acknowledged, Dispatched, Resolved, Escalated. One click, professional response', color: '#8b5cf6', icon: '⚡' },
        { id: 'slack-tix', label: 'Slack Notifications', description: 'Ticket created → posts to venue channel. Status changed → update. Resolved → confirmation', color: '#8b5cf6', icon: '💬' },
      ],
    },
    {
      id: 'portal',
      label: 'Client Portal',
      description: 'Unique per-venue link. No login. The thing that makes ANC look Fortune 500',
      color: '#ec4899',
      icon: '🌐',
      children: [
        { id: 'live', label: 'Live Game Day', description: 'Real-time workflow timeline like FedEx tracking. "6:00 PM — Tech checked in on site"', color: '#ec4899', icon: '📡' },
        { id: 'team', label: 'Your ANC Team', description: 'Profile photos, names, titles of assigned techs. Puts a face to the service', color: '#ec4899', icon: '👤' },
        { id: 'ai-tix', label: 'AI Ticket Creation', description: '"The scoreboard went dark" → AI categorizes, sets priority, writes clean title, creates ticket', color: '#ec4899', icon: '🤖' },
        { id: 'report', label: 'Monthly Report PDF', description: 'Branded PDF: coverage rate, events, tickets, team deployed. The doc that justifies the contract', color: '#ec4899', icon: '📄' },
        { id: 'svc-level', label: 'Service Level Banner', description: 'Completion rate, events covered, avg resolution time. The numbers that matter at budget review', color: '#ec4899', icon: '📈' },
      ],
    },
    {
      id: 'dashboard',
      label: 'Smart Dashboard',
      description: 'Surfaces problems, not just data. Alerts, trends, drill-downs',
      color: '#dc2626',
      icon: '📊',
      children: [
        { id: 'alerts', label: '5 Alert Types', description: 'Unassigned events, missed check-ins, not game ready, overdue reports, upcoming gaps. Color-coded severity', color: '#dc2626', icon: '🚨' },
        { id: 'stats', label: 'Clickable Stats', description: 'Every number is a link. Click "Open Tickets" → tickets page. Click a market → that market\'s events', color: '#dc2626', icon: '🔢' },
        { id: 'charts', label: 'Workflow Charts', description: 'Donut chart: completed vs in progress vs pending. Labor budget bars per staff member', color: '#dc2626', icon: '📉' },
      ],
    },
    {
      id: 'reports',
      label: 'Executive Reports',
      description: 'C-level PDF reports with trends, SLA compliance, and action items',
      color: '#0891b2',
      icon: '📑',
      children: [
        { id: 'exec', label: 'Executive Summary', description: '"This week ANC covered 7 of 9 events across 4 markets with 2 technicians..."', color: '#0891b2', icon: '📝' },
        { id: 'trends', label: 'Trend Arrows', description: 'Coverage ▲ +5% vs last week. Workflow completion ▼ -3%. Instant context', color: '#0891b2', icon: '📈' },
        { id: 'actions', label: 'Action Items', description: '"5 events next week need staff assignment" — amber callout box. Impossible to miss', color: '#0891b2', icon: '⚠️' },
      ],
    },
    {
      id: 'integrations',
      label: 'Integrations',
      description: 'Connected to Google Calendar, Slack, Proposal Engine, and PDF generation',
      color: '#64748b',
      icon: '🔌',
      children: [
        { id: 'gcal', label: 'Google Calendar', description: '15-minute auto-sync. 250+ events. No manual entry', color: '#64748b', icon: '📅' },
        { id: 'slack-bot', label: 'AI Slack Bot', description: '"What games tonight?" — answers from live data. Daily digests, escalation alerts, weekly reports', color: '#64748b', icon: '🤖' },
        { id: 'proposal', label: 'Proposal Engine', description: 'Deal signed → venue auto-created → screens imported → portal link generated → Slack notified', color: '#64748b', icon: '🤝' },
        { id: 'rbac', label: 'Role-Based Access', description: 'Admin, Manager, Technician. Every API enforced server-side. Client portal fully isolated', color: '#64748b', icon: '🔐' },
      ],
    },
  ],
}

export default function PresentationPage() {
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [activeSlide, setActiveSlide] = useState(0)

  const toggleNode = (node: MindMapNode) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(node.id)) {
      newExpanded.delete(node.id)
    } else {
      newExpanded.add(node.id)
    }
    setExpandedNodes(newExpanded)
    setSelectedNode(node)
  }

  const slides = [
    { title: 'ANC Service Dashboard', subtitle: 'Unified Operations Platform', bg: 'from-[#001845] to-[#0A52EF]' },
    { title: 'The Problem', subtitle: 'Disconnected tools. Manual processes. No visibility.', bg: 'from-[#7f1d1d] to-[#dc2626]',
      bullets: ['Google Calendar → Slack bot → nothing happens after', 'Excel + SharePoint for staff schedules', 'Salesforce for tickets that doesn\'t talk to Slack', 'Managers manually chasing techs for check-ins and reports'] },
    { title: 'The Solution', subtitle: 'One platform. Everything connected.', bg: 'from-[#064e3b] to-[#059669]',
      bullets: ['Events auto-sync, staff get assigned, workflows fire automatically', 'Dashboard alerts surface problems — you don\'t hunt for them', 'Tickets with SLA tracking, auto-assignment, Slack notifications', 'Client portal with live tracking and AI-powered ticket creation'] },
    { title: 'By The Numbers', subtitle: '', bg: 'from-[#1e1b4b] to-[#4f46e5]',
      stats: [
        { num: '43+', label: 'Venues' }, { num: '15', label: 'Markets' },
        { num: '150+', label: 'Technicians' }, { num: '250+', label: 'Events' },
      ] },
  ]

  const MindMapBranch = ({ node, depth = 0 }: { node: MindMapNode; depth?: number }) => {
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedNode?.id === node.id
    const hasChildren = node.children && node.children.length > 0

    return (
      <div className={`${depth > 0 ? 'ml-6' : ''}`}>
        <button
          onClick={() => toggleNode(node)}
          className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
            isSelected
              ? 'bg-white shadow-lg ring-2'
              : 'bg-white/80 hover:bg-white hover:shadow-md'
          }`}
          style={{ borderColor: isSelected ? node.color : 'transparent' }}
        >
          <span className="text-xl flex-shrink-0">{node.icon}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900">{node.label}</p>
            {depth === 0 && <p className="text-xs text-zinc-500 mt-0.5 truncate">{node.description}</p>}
          </div>
          {hasChildren && (
            <span className={`text-xs text-zinc-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
          )}
        </button>

        {isExpanded && hasChildren && (
          <div className="mt-2 space-y-2 relative">
            <div className="absolute left-7 top-0 bottom-4 w-px bg-zinc-200"></div>
            {node.children!.map(child => (
              <MindMapBranch key={child.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-7" />
            <div className="h-5 w-px bg-zinc-200"></div>
            <span className="text-sm font-semibold text-zinc-900">Service Dashboard — Platform Overview</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSlide(0)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${activeSlide >= 0 ? 'bg-zinc-100 text-zinc-700' : 'text-zinc-400'}`}
            >
              Slides
            </button>
            <a href="/api/showcase" download className="px-3 py-1.5 text-xs font-medium bg-[#0A52EF] text-white rounded-lg hover:bg-[#0840C0] transition-colors">
              Download PDF
            </a>
          </div>
        </div>
      </header>

      {/* Slides */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Slide Navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {slides.map((slide, i) => (
            <button key={i} onClick={() => setActiveSlide(i)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeSlide === i ? 'bg-[#0A52EF] text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
              {slide.title}
            </button>
          ))}
          <button onClick={() => setActiveSlide(-1)}
            className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeSlide === -1 ? 'bg-[#0A52EF] text-white' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'}`}>
            Interactive Mind Map
          </button>
        </div>

        {/* Active Slide */}
        {activeSlide >= 0 && (
          <div className={`bg-gradient-to-br ${slides[activeSlide].bg} rounded-2xl p-16 text-white min-h-[500px] flex flex-col justify-center relative overflow-hidden`}>
            {/* Brand slashes */}
            <div className="absolute top-0 right-0 opacity-[0.04]">
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} className="inline-block w-[80px] h-[600px] bg-white transform skew-x-[-35deg] ml-4" />
              ))}
            </div>

            <div className="relative z-10">
              <h1 className="text-5xl font-bold tracking-tight">{slides[activeSlide].title}</h1>
              {slides[activeSlide].subtitle && (
                <p className="text-xl opacity-75 mt-4 max-w-2xl">{slides[activeSlide].subtitle}</p>
              )}

              {slides[activeSlide].bullets && (
                <ul className="mt-8 space-y-4 max-w-2xl">
                  {slides[activeSlide].bullets!.map((b, i) => (
                    <li key={i} className="flex items-start gap-3 text-lg">
                      <span className="w-2 h-2 rounded-full bg-white/50 mt-2.5 flex-shrink-0"></span>
                      <span className="opacity-90">{b}</span>
                    </li>
                  ))}
                </ul>
              )}

              {slides[activeSlide].stats && (
                <div className="flex gap-12 mt-12">
                  {slides[activeSlide].stats!.map((s, i) => (
                    <div key={i} className="text-center">
                      <p className="text-6xl font-bold">{s.num}</p>
                      <p className="text-sm opacity-60 mt-2 uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Slide navigation */}
            <div className="absolute bottom-8 right-8 flex gap-2">
              <button onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                ←
              </button>
              <button onClick={() => activeSlide < slides.length - 1 ? setActiveSlide(activeSlide + 1) : setActiveSlide(-1)}
                className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                →
              </button>
            </div>
            <div className="absolute bottom-8 left-16 flex gap-1.5">
              {[...slides, { title: 'map' }].map((_, i) => (
                <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === activeSlide || (i === slides.length && activeSlide === -1) ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </div>
          </div>
        )}

        {/* Interactive Mind Map */}
        {activeSlide === -1 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Mind Map Tree */}
            <div className="lg:col-span-2 space-y-3">
              <div className="bg-white rounded-2xl border border-zinc-200 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">{mindMapData.icon}</span>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">{mindMapData.label}</h2>
                    <p className="text-sm text-zinc-500">{mindMapData.description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {mindMapData.children?.map(node => (
                    <MindMapBranch key={node.id} node={node} />
                  ))}
                </div>
              </div>
            </div>

            {/* Detail Panel */}
            <div className="lg:col-span-1">
              <div className="sticky top-20">
                {selectedNode ? (
                  <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                    <div className="h-2" style={{ backgroundColor: selectedNode.color }}></div>
                    <div className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-3xl">{selectedNode.icon}</span>
                        <h3 className="text-lg font-bold text-zinc-900">{selectedNode.label}</h3>
                      </div>
                      <p className="text-sm text-zinc-600 leading-relaxed">{selectedNode.description}</p>

                      {selectedNode.children && selectedNode.children.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-zinc-100">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Includes</p>
                          <div className="space-y-2">
                            {selectedNode.children.map(child => (
                              <button key={child.id} onClick={() => toggleNode(child)}
                                className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-zinc-50 transition-colors">
                                <span className="text-sm">{child.icon}</span>
                                <span className="text-xs font-medium text-zinc-700">{child.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-50 rounded-2xl border border-zinc-200 p-8 text-center">
                    <p className="text-zinc-400 text-sm">Click any node to see details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-16">
        <div className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-5 opacity-40" />
            <span className="text-xs text-zinc-400">ANC Sports — Operations & Venue Services</span>
          </div>
          <span className="text-xs text-zinc-400">Built by Ahmad Basheer</span>
        </div>
      </footer>
    </div>
  )
}
