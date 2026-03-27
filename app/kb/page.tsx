'use client'

import { useState, useRef, useEffect } from 'react'
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

const ISSUE_TYPES = ['Dead Pixels', 'Brightness Mismatch', 'Color Shift', 'Signal Loss', 'Config Loss', 'Cable Failure', 'Module Failure', 'Power Issue', 'Software Glitch', 'Other']

export default function KBPage() {
  const [tab, setTab] = useState<'search' | 'add' | 'browse'>('search')

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

  const searchFileRef = useRef<HTMLInputElement>(null)
  const addFileRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, target: 'search' | 'add') => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = { data: reader.result as string, mimeType: file.type, name: file.name }
      if (target === 'search') setSearchImage(result)
      else setAddImage(result)
    }
    reader.readAsDataURL(file)
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

  useEffect(() => {
    if (tab === 'browse') loadEntries()
  }, [tab])

  const handleDelete = async (id: string) => {
    await fetch(`/api/kb?id=${id}`, { method: 'DELETE' })
    setEntries(entries.filter(e => e.id !== id))
  }

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-zinc-900">AI Visual Search</h1>
          <p className="text-sm text-zinc-500 mt-1">Upload a photo or describe an issue to find similar past problems and fixes</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-100 p-1 rounded-lg w-fit">
          {(['search', 'add', 'browse'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {t === 'search' ? 'Search' : t === 'add' ? 'Add Entry' : 'Browse'}
            </button>
          ))}
        </div>

        {/* SEARCH TAB */}
        {tab === 'search' && (
          <div className="space-y-4">
            <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
              <textarea
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Describe the issue... e.g. 'LED screen showing dead pixels in bottom left corner'"
                className="w-full border border-zinc-200 rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
              />

              <div className="flex items-center gap-3">
                <input ref={searchFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'search')} />
                <button
                  onClick={() => searchFileRef.current?.click()}
                  className="px-4 py-2 text-sm border border-zinc-200 rounded-lg hover:bg-zinc-50 text-zinc-700 font-medium"
                >
                  {searchImage ? `${searchImage.name}` : 'Attach Photo'}
                </button>
                {searchImage && (
                  <button onClick={() => { setSearchImage(null); if (searchFileRef.current) searchFileRef.current.value = '' }} className="text-xs text-zinc-400 hover:text-red-500">
                    Remove
                  </button>
                )}
                <div className="flex-1" />
                <button
                  onClick={handleSearch}
                  disabled={searching || (!searchText && !searchImage)}
                  className="px-5 py-2 bg-[#0A52EF] text-white text-sm font-medium rounded-lg hover:bg-[#0840C0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchImage && (
                <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                  <img src={searchImage.data} alt="Search" className="h-16 w-16 object-cover rounded" />
                  <span className="text-xs text-zinc-500">{searchImage.name}</span>
                </div>
              )}
            </div>

            {/* Results */}
            {searching && (
              <div className="text-center py-12 text-zinc-400 text-sm">Generating embedding and searching...</div>
            )}

            {!searching && searchResults.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-700">{searchResults.length} similar issue{searchResults.length !== 1 ? 's' : ''} found</p>
                {searchResults.map((r, i) => (
                  <div key={r.id} className="bg-white border border-zinc-200 rounded-lg p-4 hover:border-zinc-300 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            r.similarity! >= 80 ? 'bg-emerald-100 text-emerald-700' :
                            r.similarity! >= 60 ? 'bg-amber-100 text-amber-700' :
                            'bg-zinc-100 text-zinc-600'
                          }`}>
                            {r.similarity}% match
                          </span>
                          {r.issue_type && <span className="text-xs text-zinc-400">{r.issue_type}</span>}
                        </div>
                        <h3 className="font-medium text-zinc-900 text-sm">{r.title}</h3>
                        {r.description && <p className="text-xs text-zinc-500 mt-1">{r.description}</p>}
                      </div>
                      {r.image_url === '[has image]' && (
                        <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded">Has photo</span>
                      )}
                    </div>
                    {r.suggested_fix && (
                      <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                        <p className="text-xs font-medium text-emerald-800 mb-1">Suggested Fix</p>
                        <p className="text-sm text-emerald-900">{r.suggested_fix}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {!searching && searchResults.length === 0 && (searchText || searchImage) && (
              <div className="text-center py-8 text-zinc-400 text-sm">No results yet. Click Search to find similar issues.</div>
            )}
          </div>
        )}

        {/* ADD TAB */}
        {tab === 'add' && (
          <div className="bg-white border border-zinc-200 rounded-lg p-5 space-y-4">
            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Title *</label>
              <input
                value={addForm.title}
                onChange={e => setAddForm({ ...addForm, title: e.target.value })}
                placeholder="e.g. Brightness mismatch on main board after backup failover"
                className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Description</label>
              <textarea
                value={addForm.description}
                onChange={e => setAddForm({ ...addForm, description: e.target.value })}
                placeholder="Detailed description of the issue, symptoms, and environment..."
                className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Issue Type</label>
                <select
                  value={addForm.issue_type}
                  onChange={e => setAddForm({ ...addForm, issue_type: e.target.value })}
                  className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
                >
                  <option value="">Select type...</option>
                  {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Photo</label>
                <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'add')} />
                <button
                  onClick={() => addFileRef.current?.click()}
                  className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm text-left text-zinc-500 hover:bg-zinc-50"
                >
                  {addImage ? addImage.name : 'Upload image...'}
                </button>
              </div>
            </div>

            {addImage && (
              <div className="flex items-center gap-3 p-3 bg-zinc-50 rounded-lg">
                <img src={addImage.data} alt="Upload" className="h-20 w-20 object-cover rounded" />
                <button onClick={() => { setAddImage(null); if (addFileRef.current) addFileRef.current.value = '' }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-zinc-600 mb-1 block">Suggested Fix</label>
              <textarea
                value={addForm.suggested_fix}
                onChange={e => setAddForm({ ...addForm, suggested_fix: e.target.value })}
                placeholder="How was this issue resolved? What steps should a tech follow?"
                className="w-full border border-zinc-200 rounded-lg p-2.5 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/20 focus:border-[#0A52EF]"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleAdd}
                disabled={adding || !addForm.title}
                className="px-5 py-2 bg-[#0A52EF] text-white text-sm font-medium rounded-lg hover:bg-[#0840C0] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? 'Adding...' : 'Add to Knowledge Base'}
              </button>
              {addSuccess && <span className="text-sm text-emerald-600">{addSuccess}</span>}
            </div>
          </div>
        )}

        {/* BROWSE TAB */}
        {tab === 'browse' && (
          <div className="space-y-3">
            {loadingEntries && <div className="text-center py-12 text-zinc-400 text-sm">Loading...</div>}
            {!loadingEntries && entries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-400 text-sm">No entries yet. Add some issues and fixes to build the knowledge base.</p>
              </div>
            )}
            {entries.map(e => (
              <div key={e.id} className="bg-white border border-zinc-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-zinc-900 text-sm">{e.title}</h3>
                      {e.issue_type && <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full">{e.issue_type}</span>}
                    </div>
                    {e.description && <p className="text-xs text-zinc-500 mt-1">{e.description}</p>}
                  </div>
                  <button onClick={() => handleDelete(e.id)} className="text-xs text-zinc-300 hover:text-red-500 transition-colors">Delete</button>
                </div>
                {e.suggested_fix && (
                  <div className="mt-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
                    <p className="text-xs font-medium text-emerald-800 mb-1">Fix</p>
                    <p className="text-sm text-emerald-900">{e.suggested_fix}</p>
                  </div>
                )}
                <p className="text-xs text-zinc-300 mt-2">{new Date(e.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
