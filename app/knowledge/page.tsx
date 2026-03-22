'use client'

import { useState, useRef, useEffect } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  sources?: any[]
}

const TOPIC_CARDS = [
  {
    title: 'Operations',
    description: 'Game day procedures, workflows, escalation protocols',
    icon: '⚡',
    color: 'from-blue-500/10 to-blue-600/5 border-blue-200',
    iconBg: 'bg-blue-100',
    questions: [
      'What is the standard game day workflow?',
      'What are the escalation procedures?',
      'How do staff check in on site?',
    ],
  },
  {
    title: 'Venues & Displays',
    description: 'LED specs, installation details, venue configurations',
    icon: '🏟',
    color: 'from-emerald-500/10 to-emerald-600/5 border-emerald-200',
    iconBg: 'bg-emerald-100',
    questions: [
      'What displays does ANC typically install?',
      'What is LiveSync?',
      'What venues does ANC operate in?',
    ],
  },
  {
    title: 'Company & Leadership',
    description: 'ANC history, team structure, strategic direction',
    icon: '🏢',
    color: 'from-purple-500/10 to-purple-600/5 border-purple-200',
    iconBg: 'bg-purple-100',
    questions: [
      'Who is on ANC\'s leadership team?',
      'What is ANC\'s history?',
      'Who owns ANC?',
    ],
  },
  {
    title: 'Services & Support',
    description: 'SLAs, ticket management, maintenance schedules',
    icon: '🛠',
    color: 'from-amber-500/10 to-amber-600/5 border-amber-200',
    iconBg: 'bg-amber-100',
    questions: [
      'What services does ANC provide venues?',
      'How does the ticket system work?',
      'What are ANC\'s SLA tiers?',
    ],
  },
  {
    title: 'Products & Technology',
    description: 'LED products, pixel pitch, manufacturers, specifications',
    icon: '📡',
    color: 'from-rose-500/10 to-rose-600/5 border-rose-200',
    iconBg: 'bg-rose-100',
    questions: [
      'What LED manufacturers does ANC work with?',
      'What pixel pitches are available?',
      'What is the difference between indoor and outdoor displays?',
    ],
  },
  {
    title: 'Clients & Projects',
    description: 'Notable installations, partnerships, case studies',
    icon: '🤝',
    color: 'from-cyan-500/10 to-cyan-600/5 border-cyan-200',
    iconBg: 'bg-cyan-100',
    questions: [
      'Who are ANC\'s major clients?',
      'Tell me about the Fenway Park project',
      'What transit projects has ANC done?',
    ],
  },
]

export default function KnowledgePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeView, setActiveView] = useState<'explore' | 'chat'>('explore')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (activeView === 'chat') inputRef.current?.focus()
  }, [activeView])

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim(), timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setActiveView('chat')
    setLoading(true)

    try {
      const res = await fetch('/api/knowledge/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim() }),
      })
      const data = await res.json()
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || 'No response received.',
        timestamp: Date.now(),
        sources: data.sources,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(), role: 'assistant',
        content: 'Something went wrong. Please try again.', timestamp: Date.now(),
      }])
    } finally {
      setLoading(false)
    }
  }

  const clearChat = () => {
    setMessages([])
    setActiveView('explore')
  }

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center shadow-lg shadow-[#0A52EF]/20">
                  <img src="/ANC_Logo_2023_white.png" alt="" className="h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-zinc-900">Knowledge Base</h1>
                  <p className="text-xs text-zinc-400">ANC Operations Intelligence</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button onClick={clearChat} className="text-xs text-zinc-400 hover:text-zinc-600 px-3 py-1.5 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors">
                  New conversation
                </button>
              )}
              <div className="flex bg-zinc-100 rounded-lg p-0.5">
                <button
                  onClick={() => setActiveView('explore')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${activeView === 'explore' ? 'bg-white text-zinc-900 shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Explore
                </button>
                <button
                  onClick={() => setActiveView('chat')}
                  className={`text-xs px-3 py-1.5 rounded-md transition-all ${activeView === 'chat' ? 'bg-white text-zinc-900 shadow-sm font-medium' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  Chat {messages.length > 0 && `(${messages.filter(m => m.role === 'user').length})`}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search / Input Bar — Always visible */}
        <div className="mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A52EF]/5 to-[#002C73]/5 rounded-2xl blur-xl" />
            <div className="relative bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
              <div className="flex items-center px-5 py-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center mr-3 flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') sendMessage(input) }}
                  placeholder="Ask anything about ANC — operations, venues, products, procedures..."
                  className="flex-1 text-sm text-zinc-900 placeholder-zinc-400 outline-none bg-transparent"
                  disabled={loading}
                />
                <button
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  className="ml-3 px-5 py-2 bg-[#0A52EF] text-white rounded-xl text-sm font-medium hover:bg-[#0840C0] disabled:opacity-30 transition-all flex-shrink-0 shadow-sm shadow-[#0A52EF]/20"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  ) : 'Ask'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* EXPLORE VIEW */}
        {activeView === 'explore' && (
          <div className="space-y-6">
            {/* Topic Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {TOPIC_CARDS.map((card, i) => (
                <div key={i} className={`bg-gradient-to-br ${card.color} rounded-xl border p-5 hover:shadow-md transition-all group`}>
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg ${card.iconBg} flex items-center justify-center text-lg`}>
                      {card.icon}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">{card.title}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{card.description}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {card.questions.map((q, qi) => (
                      <button
                        key={qi}
                        onClick={() => sendMessage(q)}
                        className="w-full text-left text-xs text-zinc-600 hover:text-[#0A52EF] py-1.5 px-3 rounded-lg hover:bg-white/80 transition-all flex items-center gap-2 group/q"
                      >
                        <span className="text-zinc-300 group-hover/q:text-[#0A52EF] transition-colors">→</span>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* What this can do */}
            <div className="bg-white rounded-xl border border-zinc-200 p-6">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">What the Knowledge Base can do</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                    <span className="text-blue-500 text-sm">Q&A</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-800">Instant Answers</p>
                  <p className="text-xs text-zinc-400 mt-1">Ask about any ANC procedure, product, venue, or policy and get an immediate answer sourced from official documentation.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center mb-2">
                    <span className="text-emerald-500 text-sm">🎓</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-800">New Hire Onboarding</p>
                  <p className="text-xs text-zinc-400 mt-1">New technicians and managers can get up to speed by asking questions instead of reading 50-page manuals.</p>
                </div>
                <div>
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center mb-2">
                    <span className="text-purple-500 text-sm">📊</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-800">Operations Lookup</p>
                  <p className="text-xs text-zinc-400 mt-1">Field techs can quickly find specs, troubleshooting steps, and emergency contacts without calling engineering.</p>
                </div>
              </div>
            </div>

            {/* Data sources */}
            <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Knowledge Sources</p>
                  <p className="text-xs text-zinc-400 mt-1">The AI draws from these sources to answer your questions</p>
                </div>
                <span className="text-xs text-zinc-400 bg-white border border-zinc-200 rounded-full px-3 py-1">Expandable</span>
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                {['ANC Company Overview', 'Services & Capabilities', 'Venue Portfolio', 'Project History', 'Leadership & Structure', 'Product Specifications'].map((source, i) => (
                  <span key={i} className="text-xs bg-white border border-zinc-200 rounded-full px-3 py-1.5 text-zinc-600">
                    {source}
                  </span>
                ))}
                <span className="text-xs bg-[#0A52EF]/5 border border-[#0A52EF]/20 rounded-full px-3 py-1.5 text-[#0A52EF] font-medium">
                  + Add your docs
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CHAT VIEW */}
        {activeView === 'chat' && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Messages */}
            <div className="h-[500px] overflow-y-auto px-6 py-5 space-y-5">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#0A52EF]/10 to-[#002C73]/10 flex items-center justify-center mb-4">
                    <img src="/ANC_Logo_2023_blue.png" alt="" className="h-8" />
                  </div>
                  <p className="text-sm font-medium text-zinc-700">Start a conversation</p>
                  <p className="text-xs text-zinc-400 mt-1 max-w-sm">Type a question above or go back to Explore to pick a topic.</p>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] ${msg.role === 'user' ? '' : ''}`}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center">
                          <img src="/ANC_Logo_2023_white.png" alt="" className="h-3" />
                        </div>
                        <span className="text-[11px] font-semibold text-zinc-500">ANC Knowledge Base</span>
                        <span className="text-[10px] text-zinc-300">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 ${
                      msg.role === 'user'
                        ? 'bg-[#0A52EF] text-white rounded-br-md'
                        : 'bg-zinc-50 border border-zinc-200 text-zinc-800 rounded-bl-md'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    {msg.role === 'user' && (
                      <p className="text-[10px] text-zinc-300 text-right mt-1 mr-1">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
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

            {/* Quick follow-ups */}
            {messages.length > 0 && !loading && (
              <div className="px-6 py-3 border-t border-zinc-100 bg-zinc-50/50">
                <p className="text-[10px] text-zinc-400 mb-2 font-medium uppercase tracking-wider">Follow up</p>
                <div className="flex flex-wrap gap-1.5">
                  {['Tell me more', 'What else should I know?', 'How does this affect operations?', 'Who should I contact about this?'].map((q, i) => (
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
