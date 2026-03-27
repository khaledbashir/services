'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
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

const URGENCY_COLORS: Record<string, string> = {
  'Low': 'bg-zinc-100 text-zinc-600',
  'Medium': 'bg-amber-100 text-amber-700',
  'High': 'bg-orange-100 text-orange-700',
  'Critical': 'bg-red-100 text-red-700',
}

export default function KBPage() {
  const [tab, setTab] = useState<'diagnose' | 'search' | 'add' | 'browse'>('diagnose')

  // Diagnose state
  const [diagImage, setDiagImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [diagContext, setDiagContext] = useState('')
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)
  const [diagResults, setDiagResults] = useState<KBEntry[]>([])
  const [diagSearching, setDiagSearching] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [saved, setSaved] = useState(false)

  // Search state
  const [searchText, setSearchText] = useState('')
  const [searchImage, setSearchImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [searchResults, setSearchResults] = useState<KBEntry[]>([])
  const [searching, setSearching] = useState(false)

  // Add state
  const [addForm, setAddForm] = useState({ title: '', description: '', issue_type: '', suggested_fix: '' })
  const [addImage, setAddImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [addSuccess, setAddSuccess] = useState('')

  // Browse state
  const [entries, setEntries] = useState<KBEntry[]>([])
  const [loadingEntries, setLoadingEntries] = useState(false)

  const diagFileRef = useRef<HTMLInputElement>(null)
  const searchFileRef = useRef<HTMLInputElement>(null)
  const addFileRef = useRef<HTMLInputElement>(null)

  const processFile = (file: File, target: 'diagnose' | 'search' | 'add') => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = { data: reader.result as string, mimeType: file.type, name: file.name }
      if (target === 'diagnose') { setDiagImage(result); setDiagnosis(null); setDiagResults([]); setSaved(false) }
      else if (target === 'search') setSearchImage(result)
      else setAddImage(result)
    }
    reader.readAsDataURL(file)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'diagnose' | 'search' | 'add') => {
    const file = e.target.files?.[0]
    if (file) processFile(file, target)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) processFile(file, 'diagnose')
  }, [])

  const handleDiagnose = async () => {
    if (!diagImage) return
    setDiagnosing(true)
    setDiagnosis(null)
    setDiagResults([])
    setSaved(false)
    try {
      const res = await fetch('/api/kb/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: { data: diagImage.data, mimeType: diagImage.mimeType },
          context: diagContext || undefined,
        }),
      })
      const data = await res.json()
      if (data.diagnosis) {
        setDiagnosis(data.diagnosis)
        // Auto-search for similar past issues
        setDiagSearching(true)
        const searchRes = await fetch('/api/kb/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `${data.diagnosis.title}. ${data.diagnosis.description}`,
            image: { data: diagImage.data, mimeType: diagImage.mimeType },
          }),
        })
        const searchData = await searchRes.json()
        setDiagResults(searchData.matches || [])
        setDiagSearching(false)
      }
    } catch (err) {
      console.error('Diagnosis failed:', err)
    } finally {
      setDiagnosing(false)
    }
  }

  const handleSaveDiagnosis = async () => {
    if (!diagnosis) return
    setSaved(false)
    try {
      await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: diagnosis.title,
          description: diagnosis.description,
          issue_type: diagnosis.issue_type,
          suggested_fix: diagnosis.suggested_fix,
          image: diagImage ? { data: diagImage.data, mimeType: diagImage.mimeType } : undefined,
        }),
      })
      setSaved(true)
    } catch (err) {
      console.error('Save failed:', err)
    }
  }

  const handleSearch = async () => {
    if (!searchText && !searchImage) return
    setSearching(true)
    setSearchResults([])
    try {
      const res = await fetch('/api/kb/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: searchText || undefined,
          image: searchImage ? { data: searchImage.data, mimeType: searchImage.mimeType } : undefined,
        }),
      })
      const data = await res.json()
      setSearchResults(data.matches || [])
    } catch (err) {
      console.error('Search failed:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleAdd = async () => {
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
        setAddSuccess('Entry added to knowledge base')
        setAddForm({ title: '', description: '', issue_type: '', suggested_fix: '' })
        setAddImage(null)
        if (addFileRef.current) addFileRef.current.value = ''
      }
    } catch (err) {
      console.error('Add failed:', err)
    } finally {
      setAdding(false)
    }
  }

  const loadEntries = async () => {
    setLoadingEntries(true)
    try {
      const res = await fetch('/api/kb')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Load failed:', err)
    } finally {
      setLoadingEntries(false)
    }
  }

  useEffect(() => { if (tab === 'browse') loadEntries() }, [tab])

  const handleDelete = async (id: string) => {
    await fetch(`/api/kb?id=${id}`, { method: 'DELETE' })
    setEntries(entries.filter(e => e.id !== id))
  }

  const SimilarityBadge = ({ score }: { score: number }) => (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full ${
      score >= 80 ? 'bg-emerald-100 text-emerald-700' :
      score >= 60 ? 'bg-amber-100 text-amber-700' :
      'bg-zinc-100 text-zinc-600'
    }`}>
      {score}%
    </span>
  )

  const ResultCard = ({ r }: { r: KBEntry }) => (
    <div className="bg-white border border-zinc-200 rounded-xl p-4 hover:shadow-sm transition-all">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <SimilarityBadge score={r.similarity!} />
            {r.issue_type && <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wide">{r.issue_type}</span>}
          </div>
          <h3 className="font-semibold text-zinc-900 text-[13px] leading-tight">{r.title}</h3>
          {r.description && <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{r.description}</p>}
        </div>
      </div>
      {r.suggested_fix && (
        <div className="mt-3 p-3 bg-gradient-to-br from-emerald-50 to-emerald-50/50 border border-emerald-100 rounded-lg">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Suggested Fix</p>
          <p className="text-[13px] text-emerald-900 leading-relaxed">{r.suggested_fix}</p>
        </div>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0A52EF] to-[#0840C0] rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
            <h1 className="text-xl font-bold text-zinc-900">AI Diagnostics</h1>
          </div>
          <p className="text-sm text-zinc-500 ml-11">Upload a photo to diagnose LED issues instantly, or search past issues for known fixes</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-xl w-fit">
          {[
            { key: 'diagnose' as const, label: 'Diagnose' },
            { key: 'search' as const, label: 'Search' },
            { key: 'add' as const, label: 'Add Entry' },
            { key: 'browse' as const, label: 'Browse' },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                tab === t.key ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* DIAGNOSE TAB */}
        {tab === 'diagnose' && (
          <div className="space-y-5">
            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => !diagImage && diagFileRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer ${
                dragOver ? 'border-[#0A52EF] bg-[#0A52EF]/5' :
                diagImage ? 'border-zinc-200 bg-white' : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-white'
              }`}
            >
              <input ref={diagFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'diagnose')} />

              {!diagImage ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 mx-auto mb-4 bg-zinc-100 rounded-2xl flex items-center justify-center">
                    <svg className="w-7 h-7 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <p className="text-sm font-medium text-zinc-700 mb-1">Drop a photo here or click to upload</p>
                  <p className="text-xs text-zinc-400">Take a photo of the LED issue and AI will diagnose it</p>
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex gap-4">
                    <div className="relative">
                      <img src={diagImage.data} alt="Issue" className="h-48 w-72 object-cover rounded-lg" />
                      <button
                        onClick={e => { e.stopPropagation(); setDiagImage(null); setDiagnosis(null); setDiagResults([]); setSaved(false) }}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600 shadow"
                      >X</button>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-zinc-500 mb-1 block">Additional context (optional)</label>
                        <textarea
                          value={diagContext}
                          onChange={e => setDiagContext(e.target.value)}
                          placeholder="e.g. 'Happened during 3rd period after power surge' or 'Only visible on camera, not in person'"
                          className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); handleDiagnose() }}
                        disabled={diagnosing}
                        className="px-6 py-2.5 bg-gradient-to-r from-[#0A52EF] to-[#0840C0] text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-[#0A52EF]/25 disabled:opacity-40 transition-all"
                      >
                        {diagnosing ? 'Analyzing...' : 'Diagnose Issue'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Diagnosis loading */}
            {diagnosing && (
              <div className="bg-white border border-zinc-200 rounded-xl p-8 text-center">
                <div className="w-10 h-10 mx-auto mb-3 border-2 border-[#0A52EF] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm font-medium text-zinc-700">AI is analyzing the image...</p>
                <p className="text-xs text-zinc-400 mt-1">Identifying issue type, likely cause, and recommended fix</p>
              </div>
            )}

            {/* Diagnosis result */}
            {diagnosis && (
              <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-zinc-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-zinc-900">{diagnosis.title}</h2>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${URGENCY_COLORS[diagnosis.urgency] || 'bg-zinc-100 text-zinc-600'}`}>
                        {diagnosis.urgency}
                      </span>
                    </div>
                    <span className="text-xs bg-[#0A52EF]/10 text-[#0A52EF] px-2.5 py-1 rounded-full font-medium">{diagnosis.issue_type}</span>
                  </div>
                  <p className="text-sm text-zinc-600 leading-relaxed">{diagnosis.description}</p>
                </div>

                <div className="grid grid-cols-2 divide-x divide-zinc-100">
                  <div className="p-5">
                    <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wide mb-2">Likely Cause</p>
                    <p className="text-sm text-zinc-700 leading-relaxed">{diagnosis.likely_cause}</p>
                  </div>
                  <div className="p-5 bg-emerald-50/50">
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-2">Suggested Fix</p>
                    <p className="text-sm text-emerald-900 leading-relaxed">{diagnosis.suggested_fix}</p>
                  </div>
                </div>

                <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between">
                  <p className="text-xs text-zinc-400">AI diagnosis powered by Gemini</p>
                  <button
                    onClick={handleSaveDiagnosis}
                    disabled={saved}
                    className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                      saved ? 'bg-emerald-100 text-emerald-700' : 'bg-[#0A52EF] text-white hover:bg-[#0840C0]'
                    }`}
                  >
                    {saved ? 'Saved to KB' : 'Save to Knowledge Base'}
                  </button>
                </div>
              </div>
            )}

            {/* Similar past issues */}
            {diagSearching && (
              <p className="text-sm text-zinc-400 text-center py-4">Searching for similar past issues...</p>
            )}

            {diagResults.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-zinc-700 mb-3">{diagResults.length} similar past issue{diagResults.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {diagResults.map(r => <ResultCard key={r.id} r={r} />)}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SEARCH TAB */}
        {tab === 'search' && (
          <div className="space-y-4">
            <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
              <textarea
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Describe the issue... e.g. 'LED screen showing dead pixels in bottom left corner'"
                className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSearch() } }}
              />
              <div className="flex items-center gap-3">
                <input ref={searchFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'search')} />
                <button onClick={() => searchFileRef.current?.click()} className="px-4 py-2 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50 text-zinc-700 font-medium">
                  {searchImage ? searchImage.name : 'Attach Photo'}
                </button>
                {searchImage && (
                  <>
                    <img src={searchImage.data} alt="" className="h-8 w-8 object-cover rounded" />
                    <button onClick={() => { setSearchImage(null); if (searchFileRef.current) searchFileRef.current.value = '' }} className="text-xs text-zinc-400 hover:text-red-500">Remove</button>
                  </>
                )}
                <div className="flex-1" />
                <button
                  onClick={handleSearch}
                  disabled={searching || (!searchText && !searchImage)}
                  className="px-5 py-2 bg-[#0A52EF] text-white text-sm font-semibold rounded-lg hover:bg-[#0840C0] disabled:opacity-40 transition-colors"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>
            </div>

            {searching && <div className="text-center py-12 text-zinc-400 text-sm">Generating embedding and searching...</div>}

            {!searching && searchResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-zinc-700">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
                {searchResults.map(r => <ResultCard key={r.id} r={r} />)}
              </div>
            )}

            {!searching && searchResults.length === 0 && (searchText || searchImage) && (
              <div className="text-center py-8 text-zinc-400 text-sm">No results yet. Click Search to find similar issues.</div>
            )}
          </div>
        )}

        {/* ADD TAB */}
        {tab === 'add' && (
          <div className="bg-white border border-zinc-200 rounded-xl p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Title *</label>
              <input value={addForm.title} onChange={e => setAddForm({ ...addForm, title: e.target.value })} placeholder="e.g. Brightness mismatch on main board after backup failover" className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]" />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Description</label>
              <textarea value={addForm.description} onChange={e => setAddForm({ ...addForm, description: e.target.value })} placeholder="Detailed description of the issue..." className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Issue Type</label>
                <select value={addForm.issue_type} onChange={e => setAddForm({ ...addForm, issue_type: e.target.value })} className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]">
                  <option value="">Select type...</option>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Photo</label>
                <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'add')} />
                <button onClick={() => addFileRef.current?.click()} className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm text-left text-zinc-500 hover:bg-zinc-50">
                  {addImage ? addImage.name : 'Upload image...'}
                </button>
              </div>
            </div>
            {addImage && (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <img src={addImage.data} alt="" className="h-20 w-20 object-cover rounded-lg" />
                <button onClick={() => { setAddImage(null); if (addFileRef.current) addFileRef.current.value = '' }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            )}
            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Suggested Fix</label>
              <textarea value={addForm.suggested_fix} onChange={e => setAddForm({ ...addForm, suggested_fix: e.target.value })} placeholder="How was this issue resolved?" className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-20 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleAdd} disabled={adding || !addForm.title} className="px-5 py-2 bg-[#0A52EF] text-white text-sm font-semibold rounded-lg hover:bg-[#0840C0] disabled:opacity-40 transition-colors">
                {adding ? 'Adding...' : 'Add to Knowledge Base'}
              </button>
              {addSuccess && <span className="text-sm text-emerald-600 font-medium">{addSuccess}</span>}
            </div>
          </div>
        )}

        {/* BROWSE TAB */}
        {tab === 'browse' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-zinc-700">{entries.length} entries</p>
              <button onClick={loadEntries} className="text-xs text-zinc-400 hover:text-zinc-700">Refresh</button>
            </div>
            {loadingEntries && <div className="text-center py-12 text-zinc-400 text-sm">Loading...</div>}
            {!loadingEntries && entries.length === 0 && (
              <div className="text-center py-16 bg-white border border-zinc-200 rounded-xl">
                <p className="text-zinc-400 text-sm">No entries yet. Use the Diagnose tab to analyze issues or Add Entry to build the knowledge base.</p>
              </div>
            )}
            {entries.map(e => (
              <div key={e.id} className="bg-white border border-zinc-200 rounded-xl p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-zinc-900 text-[13px]">{e.title}</h3>
                      {e.issue_type && <span className="text-[11px] bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{e.issue_type}</span>}
                    </div>
                    {e.description && <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{e.description}</p>}
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-zinc-300 hover:text-red-500 ml-3">Delete</button>
                </div>
                {e.suggested_fix && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1">Fix</p>
                    <p className="text-[13px] text-emerald-900 leading-relaxed">{e.suggested_fix}</p>
                  </div>
                )}
                <p className="text-[11px] text-zinc-300 mt-2">{new Date(e.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
