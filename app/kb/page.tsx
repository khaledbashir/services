'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface KBEntry {
  id: string
  title: string
  description: string
  issue_type: string
  suggested_fix: string
  similarity?: number
  image_url?: string
  created_at: string
}

interface Diagnosis {
  title: string
  issue_type: string
  description: string
  likely_cause: string
  suggested_fix: string
  urgency: string
}

const ISSUE_TYPES = ['Dead Pixels', 'Brightness Mismatch', 'Color Shift', 'Signal Loss', 'Config Loss', 'Cable Failure', 'Module Failure', 'Power Issue', 'Software Glitch', 'Scrambled Content', 'Other']

const URGENCY_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  'Low': { bg: 'bg-zinc-50', text: 'text-zinc-600', dot: 'bg-zinc-400', label: 'Low' },
  'Medium': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Medium' },
  'High': { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'High' },
  'Critical': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical' },
}

export default function KBPage() {
  const router = useRouter()

  // Main input state
  const [inputText, setInputText] = useState('')
  const [inputImage, setInputImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Results state
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [similarResults, setSimilarResults] = useState<KBEntry[]>([])
  const [searchingKB, setSearchingKB] = useState(false)
  const [resolvedTickets, setResolvedTickets] = useState<Array<{ id: string; ticket_number: number; title: string; venue_name: string; resolution_notes: string; resolved_date: string; category: string }>>([])
  const [searchingTickets, setSearchingTickets] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [creatingTicket, setCreatingTicket] = useState(false)

  // Browse state
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)
  const [browseFilter, setBrowseFilter] = useState('')

  // Venues for ticket creation
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([])
  const [ticketVenue, setTicketVenue] = useState('')
  const [showVenuePicker, setShowVenuePicker] = useState(false)

  // Manual add accordion
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [addForm, setAddForm] = useState({ title: '', description: '', issue_type: '', suggested_fix: '' })
  const [addImage, setAddImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState('')
  const addFileRef = useRef<HTMLInputElement>(null)

  // Trending counts
  const [trending, setTrending] = useState<Array<{ type: string; count: number }>>([])

  // Load entries + trending + venues on mount
  useEffect(() => {
    fetch('/api/venues').then(r => r.json()).then(d => {
      setVenues((d.venues || []).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '')))
    }).catch(() => {})
    fetch('/api/kb').then(r => r.json()).then(d => {
      const ents = d.entries || []
      setEntries(ents)
      // Compute trending
      const counts: Record<string, number> = {}
      ents.forEach((e: KBEntry) => {
        if (e.issue_type) counts[e.issue_type] = (counts[e.issue_type] || 0) + 1
      })
      setTrending(Object.entries(counts).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count).slice(0, 6))
    }).catch(() => {})
  }, [])

  const processFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setInputImage({ data: reader.result as string, mimeType: file.type, name: file.name })
      setDiagnosis(null)
      setSimilarResults([])
      setSaved(false)
      setError('')
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) processFile(file)
  }, [])

  // Unified AI action — diagnose image and/or search text
  const handleAnalyze = async () => {
    if (!inputImage && !inputText) return
    setDiagnosing(true)
    setDiagnosis(null)
    setSimilarResults([])
    setResolvedTickets([])
    setError('')
    setSaved(false)

    try {
      // If image present, diagnose with AI
      if (inputImage) {
        const res = await fetch('/api/kb/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: { data: inputImage.data, mimeType: inputImage.mimeType },
            context: inputText || undefined,
          }),
        })
        const data = await res.json()
        if (!res.ok) { setError(data.error || `Failed (${res.status})`); return }
        if (data.diagnosis) {
          setDiagnosis(data.diagnosis)
          // Auto-search KB for similar
          // Search KB + resolved tickets in parallel
          setSearchingKB(true)
          setSearchingTickets(true)
          const searchText = `${data.diagnosis.title}. ${data.diagnosis.issue_type}. ${data.diagnosis.description}`
          try {
            const [kbRes, ticketRes] = await Promise.all([
              fetch('/api/kb/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  text: searchText,
                  image: { data: inputImage.data, mimeType: inputImage.mimeType },
                }),
              }).then(r => r.json()).catch(() => ({ matches: [] })),
              fetch('/api/tickets/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: searchText, limit: 5 }),
              }).then(r => r.json()).catch(() => ({ matches: [] })),
            ])
            setSimilarResults(kbRes.matches || [])
            setResolvedTickets(ticketRes.matches || [])
          } catch {} finally { setSearchingKB(false); setSearchingTickets(false) }
        } else {
          setError(data.error || 'No diagnosis returned')
        }
      } else {
        // Text-only search — KB + resolved tickets
        setSearchingKB(true)
        setSearchingTickets(true)
        try {
          const [kbRes, ticketRes] = await Promise.all([
            fetch('/api/kb/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: inputText }),
            }).then(r => r.json()).catch(() => ({ matches: [] })),
            fetch('/api/tickets/search', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: inputText, limit: 5 }),
            }).then(r => r.json()).catch(() => ({ matches: [] })),
          ])
          setSimilarResults(kbRes.matches || [])
          setResolvedTickets(ticketRes.matches || [])
        } catch {} finally { setSearchingKB(false); setSearchingTickets(false) }
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setDiagnosing(false)
    }
  }

  const handleSaveToDB = async () => {
    if (!diagnosis) return
    await fetch('/api/kb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: diagnosis.title,
        description: diagnosis.description,
        issue_type: diagnosis.issue_type,
        suggested_fix: diagnosis.suggested_fix,
        image: inputImage ? { data: inputImage.data, mimeType: inputImage.mimeType } : undefined,
      }),
    })
    setSaved(true)
  }

  const handleCreateTicket = async () => {
    if (!diagnosis) return
    if (!ticketVenue) { setShowVenuePicker(true); return }
    setCreatingTicket(true)
    setShowVenuePicker(false)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: ticketVenue,
          title: diagnosis.title,
          description: `${diagnosis.description}\n\nLikely Cause: ${diagnosis.likely_cause}\n\nSuggested Fix: ${diagnosis.suggested_fix}`,
          priority: diagnosis.urgency === 'Critical' ? 'critical' : diagnosis.urgency === 'High' ? 'high' : diagnosis.urgency === 'Medium' ? 'medium' : 'low',
          category: diagnosis.issue_type.toLowerCase().includes('hardware') || diagnosis.issue_type.includes('Module') || diagnosis.issue_type.includes('Cable') || diagnosis.issue_type.includes('Power') ? 'hardware' : 'general',
          source: 'web',
        }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/tickets/${data.ticket?.id || data.id}`)
      }
    } catch {} finally { setCreatingTicket(false); setTicketVenue('') }
  }

  const handleManualAdd = async () => {
    if (!addForm.title) return
    setAdding(true)
    setAddSuccess('')
    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          image: addImage ? { data: addImage.data, mimeType: addImage.mimeType } : undefined,
        }),
      })
      if (res.ok) {
        setAddSuccess('Added to knowledge base')
        setAddForm({ title: '', description: '', issue_type: '', suggested_fix: '' })
        setAddImage(null)
        // Refresh entries
        const r = await fetch('/api/kb')
        const d = await r.json()
        setEntries(d.entries || [])
      }
    } catch {} finally { setAdding(false) }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/kb?id=${id}`, { method: 'DELETE' })
    setEntries(entries.filter(e => e.id !== id))
  }

  const urg = diagnosis ? (URGENCY_CONFIG[diagnosis.urgency] || URGENCY_CONFIG['Medium']) : null

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-blue-500 rounded-xl flex items-center justify-center">
              <span className="text-white text-base">✦</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900">AI Diagnostics</h1>
              <p className="text-xs text-zinc-500">Describe an issue or drop a photo — AI handles the rest</p>
            </div>
          </div>
        </div>

        {/* Trending strip */}
        {trending.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider flex-shrink-0">Trending:</span>
            {trending.map(t => (
              <button
                key={t.type}
                onClick={() => { setInputText(t.type); setBrowseFilter(t.type) }}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600 hover:bg-zinc-200 transition-colors flex-shrink-0"
              >
                {t.type}
                <span className="text-zinc-400">{t.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ═══ MAIN INPUT ═══ */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`bg-white rounded-2xl border-2 transition-all overflow-hidden ${
            dragOver ? 'border-[#0A52EF] shadow-lg shadow-[#0A52EF]/10' : 'border-zinc-200 shadow-sm'
          }`}
        >
          {/* Image preview */}
          {inputImage && (
            <div className="relative border-b border-zinc-100 bg-zinc-50 p-3">
              <div className="flex items-center gap-3">
                <img src={inputImage.data} alt="" className="h-20 w-32 object-cover rounded-lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-700 truncate">{inputImage.name}</p>
                  <p className="text-[10px] text-zinc-400 mt-0.5">Ready for AI analysis</p>
                </div>
                <button
                  onClick={() => { setInputImage(null); setDiagnosis(null); setSimilarResults([]) }}
                  className="p-1.5 rounded-lg hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          )}

          {/* Text input + actions */}
          <div className="p-4">
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              placeholder={inputImage ? 'Add context (optional)... e.g. "happened after power surge, section 4A"' : 'Describe the issue or drop a photo here...'}
              className="w-full text-sm text-zinc-800 placeholder:text-zinc-400 resize-none border-0 outline-none bg-transparent"
              rows={inputImage ? 2 : 3}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && (inputText || inputImage)) { e.preventDefault(); handleAnalyze() } }}
            />
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = '' }} />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-500 hover:bg-zinc-100 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  Photo
                </button>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={diagnosing || (!inputText && !inputImage)}
                className="px-5 py-2 bg-gradient-to-r from-violet-500 to-blue-500 text-white text-xs font-semibold rounded-lg hover:shadow-lg hover:shadow-violet-500/25 disabled:opacity-40 transition-all flex items-center gap-2"
              >
                {diagnosing ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Analyzing...</>
                ) : inputImage ? (
                  <><span>✦</span> Diagnose</>
                ) : (
                  <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg> Search</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
            <span className="text-red-500">!</span> {error}
          </div>
        )}

        {/* ═══ DIAGNOSIS RESULT ═══ */}
        {diagnosis && urg && (
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
            {/* Header bar */}
            <div className={`px-5 py-3 flex items-center justify-between ${urg.bg} border-b border-zinc-100`}>
              <div className="flex items-center gap-3">
                <div className={`w-2.5 h-2.5 rounded-full ${urg.dot}`} />
                <span className={`text-sm font-bold ${urg.text}`}>{urg.label.toUpperCase()}</span>
                <span className="text-zinc-300">|</span>
                <span className="text-sm font-semibold text-zinc-800">{diagnosis.title}</span>
              </div>
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/80 text-zinc-600 border border-zinc-200">{diagnosis.issue_type}</span>
            </div>

            {/* Body — image + details side by side */}
            <div className="p-5">
              <div className={`flex gap-5 ${inputImage ? '' : 'flex-col'}`}>
                {inputImage && (
                  <img src={inputImage.data} alt="" className="w-48 h-36 object-cover rounded-xl flex-shrink-0" />
                )}
                <div className="flex-1 space-y-3">
                  <p className="text-sm text-zinc-700 leading-relaxed">{diagnosis.description}</p>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1">Likely Cause</p>
                    <p className="text-sm text-zinc-800">{diagnosis.likely_cause}</p>
                  </div>
                </div>
              </div>

              {/* Suggested Fix — highlighted box */}
              <div className="mt-4 p-4 bg-gradient-to-br from-emerald-50 to-emerald-50/30 border border-emerald-200 rounded-xl">
                <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-2">Suggested Fix</p>
                <p className="text-sm text-emerald-900 leading-relaxed whitespace-pre-line">{diagnosis.suggested_fix}</p>
              </div>
            </div>

            {/* Action bar */}
            <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-[10px] text-zinc-400">Powered by Gemini AI</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveToDB}
                  disabled={saved}
                  className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                    saved ? 'bg-emerald-100 text-emerald-700' : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  {saved ? '✓ Saved to KB' : 'Save to KB'}
                </button>
                <div className="relative">
                  <button
                    onClick={handleCreateTicket}
                    disabled={creatingTicket}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#0A52EF] text-white hover:bg-[#0840C0] transition-colors flex items-center gap-1.5"
                  >
                    {creatingTicket ? 'Creating...' : '+ Create Ticket'}
                  </button>
                  {showVenuePicker && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowVenuePicker(false)} />
                      <div className="absolute bottom-full right-0 mb-2 w-64 bg-white rounded-xl shadow-xl border border-zinc-200 p-3 z-50">
                        <p className="text-[11px] font-semibold text-zinc-500 mb-2">Select venue for this ticket</p>
                        <select
                          value={ticketVenue}
                          onChange={e => setTicketVenue(e.target.value)}
                          className="w-full border border-zinc-200 rounded-lg px-2.5 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20"
                          autoFocus
                        >
                          <option value="">Choose venue...</option>
                          {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <button
                          onClick={handleCreateTicket}
                          disabled={!ticketVenue}
                          className="w-full px-3 py-1.5 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] disabled:opacity-40 transition-colors"
                        >
                          Create Ticket
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Similar past issues */}
        {searchingKB && (
          <div className="text-center py-6">
            <div className="w-6 h-6 mx-auto border-2 border-zinc-300 border-t-zinc-600 rounded-full animate-spin mb-2" />
            <p className="text-xs text-zinc-400">Searching knowledge base...</p>
          </div>
        )}

        {similarResults.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 mb-3">{similarResults.length} similar past issue{similarResults.length !== 1 ? 's' : ''}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {similarResults.map(r => (
                <div key={r.id} className="bg-white border border-zinc-200 rounded-xl p-4 hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h4 className="text-[13px] font-semibold text-zinc-900 leading-tight">{r.title}</h4>
                    <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      (r.similarity || 0) >= 80 ? 'bg-emerald-100 text-emerald-700' :
                      (r.similarity || 0) >= 60 ? 'bg-amber-100 text-amber-700' :
                      'bg-zinc-100 text-zinc-500'
                    }`}>{r.similarity}%</span>
                  </div>
                  {r.issue_type && (
                    <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 mb-2">{r.issue_type}</span>
                  )}
                  {r.description && <p className="text-xs text-zinc-500 leading-relaxed line-clamp-2">{r.description}</p>}
                  {r.suggested_fix && (
                    <div className="mt-2 pt-2 border-t border-zinc-100">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Fix</p>
                      <p className="text-xs text-zinc-700 line-clamp-2">{r.suggested_fix}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ RESOLVED TICKETS — "How we fixed this before" ═══ */}
        {searchingTickets && (
          <div className="text-center py-4">
            <p className="text-xs text-zinc-400">Searching resolved tickets...</p>
          </div>
        )}

        {resolvedTickets.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="text-emerald-600 text-[10px]">✓</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-700">How we fixed this before</h3>
            </div>
            <div className="space-y-2">
              {resolvedTickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => router.push(`/tickets/${t.id}`)}
                  className="bg-white border border-zinc-200 rounded-xl p-4 hover:shadow-md hover:border-zinc-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono text-zinc-400">T-{String(t.ticket_number).padStart(5, '0')}</span>
                        <span className="text-[10px] text-zinc-300">•</span>
                        <span className="text-[10px] text-zinc-400">{t.venue_name}</span>
                        {t.resolved_date && (
                          <>
                            <span className="text-[10px] text-zinc-300">•</span>
                            <span className="text-[10px] text-zinc-400">Resolved {t.resolved_date}</span>
                          </>
                        )}
                      </div>
                      <h4 className="text-[13px] font-semibold text-zinc-900 group-hover:text-[#0A52EF] transition-colors">{t.title}</h4>
                    </div>
                    <span className="text-[10px] text-zinc-300 group-hover:text-[#0A52EF] flex-shrink-0 mt-1">View →</span>
                  </div>
                  {t.resolution_notes && (
                    <div className="mt-2 pt-2 border-t border-zinc-100">
                      <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-0.5">Resolution</p>
                      <p className="text-xs text-zinc-700 line-clamp-2">{t.resolution_notes}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ BROWSE ENTRIES ═══ */}
        {!diagnosis && !diagnosing && similarResults.length === 0 && entries.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-700">Knowledge Base ({entries.length})</h3>
              {browseFilter && (
                <button onClick={() => setBrowseFilter('')} className="text-[10px] text-[#0A52EF] hover:underline">Clear filter</button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {entries
                .filter(e => !browseFilter || e.issue_type === browseFilter)
                .slice(0, 12)
                .map(e => (
                <div key={e.id} className="bg-white border border-zinc-200 rounded-xl p-4 group hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-semibold text-zinc-900 leading-tight">{e.title}</h4>
                      {e.issue_type && <span className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 mt-1">{e.issue_type}</span>}
                    </div>
                    <button onClick={() => handleDelete(e.id)} className="text-zinc-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">Delete</button>
                  </div>
                  {e.description && <p className="text-xs text-zinc-500 mt-2 line-clamp-2">{e.description}</p>}
                  {e.suggested_fix && (
                    <div className="mt-2 pt-2 border-t border-zinc-100">
                      <p className="text-xs text-emerald-700 line-clamp-2">{e.suggested_fix}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ MANUAL ADD (Accordion) ═══ */}
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer text-sm text-zinc-400 hover:text-zinc-600 transition-colors py-2">
            <svg className="w-4 h-4 group-open:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            Add manual entry
          </summary>
          <div className="mt-3 bg-white border border-zinc-200 rounded-xl p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Title *</label>
                <input value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} placeholder="Issue title" className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Issue Type</label>
                <select value={addForm.issue_type} onChange={e => setAddForm({ ...addForm, issue_type: e.target.value })} className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20">
                  <option value="">Select...</option>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Description</label>
              <textarea value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="What happened..." className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-zinc-500 mb-1 block">Suggested Fix</label>
              <textarea value={addForm.suggested_fix} onChange={e => setAddForm({ ...addForm, suggested_fix: e.target.value })} placeholder="How to resolve..." className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-16 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20" />
            </div>
            <div className="flex items-center gap-3">
              <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setAddImage({ data: r.result as string, mimeType: f.type, name: f.name }); r.readAsDataURL(f) } }} />
              <button onClick={() => addFileRef.current?.click()} className="px-3 py-1.5 border border-zinc-200 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50">
                {addImage ? addImage.name : 'Attach photo'}
              </button>
              {addImage && <button onClick={() => setAddImage(null)} className="text-[10px] text-red-500">Remove</button>}
              <div className="flex-1" />
              <button onClick={handleManualAdd} disabled={adding || !addForm.title} className="px-4 py-1.5 bg-[#0A52EF] text-white text-xs font-medium rounded-lg hover:bg-[#0840C0] disabled:opacity-40 transition-colors">
                {adding ? 'Adding...' : 'Add Entry'}
              </button>
              {addSuccess && <span className="text-xs text-emerald-600">{addSuccess}</span>}
            </div>
          </div>
        </details>
      </div>
    </DashboardLayout>
  )
}
