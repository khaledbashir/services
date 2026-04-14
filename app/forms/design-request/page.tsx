'use client'

import { useState, useRef } from 'react'

type Venue = { id: string; name: string; market: string | null }
type Asset = {
  id: string
  name: string
  displayType: string | null
  screenLocation: string | null
  orientation: string | null
  resolution: string | null
}

export default function DesignRequestFormPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoFilled, setAutoFilled] = useState<string | null>(null)
  const [venueSuggestions, setVenueSuggestions] = useState<Venue[]>([])
  const [assetOptions, setAssetOptions] = useState<Asset[]>([])
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const clientRef = useRef<HTMLInputElement>(null)
  const venueIdRef = useRef<HTMLInputElement>(null)

  async function handleEmailBlur(e: React.FocusEvent<HTMLInputElement>) {
    const email = e.currentTarget.value.trim()
    if (!email || !email.includes('@')) return
    if (clientRef.current && clientRef.current.value.trim()) return
    try {
      const res = await fetch(`/api/forms/lookup-company?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      if (data?.match?.name && clientRef.current && !clientRef.current.value.trim()) {
        clientRef.current.value = data.match.name
        setAutoFilled(`Auto-filled client from ${data.match.domain} — edit if wrong`)
      }
    } catch { /* silent */ }
  }

  async function handleVenueInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.currentTarget.value
    if (q.length < 2) { setVenueSuggestions([]); return }
    try {
      const res = await fetch(`/api/forms/search-venues?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setVenueSuggestions(data.venues || [])
    } catch { /* silent */ }
  }

  async function pickVenue(v: Venue) {
    if (venueIdRef.current) venueIdRef.current.value = v.id
    const inputEl = document.querySelector<HTMLInputElement>('input[name="venue"]')
    if (inputEl) inputEl.value = v.name
    setVenueSuggestions([])
    setSelectedAssetIds(new Set())
    try {
      const res = await fetch(`/api/forms/assets-at-venue?venueId=${v.id}`)
      const data = await res.json()
      setAssetOptions(data.assets || [])
    } catch {
      setAssetOptions([])
    }
  }

  function toggleAsset(id: string) {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    // Describe selected assets as a human-readable string so it lands in
    // description/boardSection even if the design-request API doesn't yet
    // accept a structured asset-ids array.
    const assetLabels = assetOptions
      .filter((a) => selectedAssetIds.has(a.id))
      .map((a) => {
        const parts = [a.name, a.displayType, a.orientation, a.resolution].filter(Boolean)
        return `• ${parts.join(' · ')}`
      })
    const payload = {
      requesterName: fd.get('requesterName'),
      requesterEmail: fd.get('email'),
      clientName: fd.get('client'),
      venueName: fd.get('venue'),
      venueId: fd.get('venueId') || undefined,
      assetIds: Array.from(selectedAssetIds),
      boardSection: assetLabels.length > 0 ? assetLabels.join('\n') : undefined,
      clientTriCode: fd.get('triCode'),
      deliverableType: fd.get('deliverableType'),
      sport: fd.get('sport'),
      dueDate: fd.get('dueDate'),
      description: fd.get('description'),
      referenceNotes: fd.get('referenceNotes'),
      rushRequest: fd.get('rushRequest') === 'on',
    }

    try {
      const res = await fetch('/api/forms/design-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Submission failed')
      setSuccess({ id: data.id, name: data.name })
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl border border-[var(--anc-border)] p-8 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Design Request submitted</h1>
        <p className="text-sm text-gray-600 mb-6">
          Thanks — <strong>{success.name}</strong> is now in the design queue and our AI has started
          looking for similar past jobs to reference.
        </p>
        <a
          href="/forms/design-request"
          className="inline-block px-5 py-2 bg-[var(--anc-brand)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Submit another
        </a>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <a href="/forms" className="text-xs text-gray-500 hover:text-gray-900">← All forms</a>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">🎨 Design Request</h1>
        <p className="text-sm text-gray-600 mt-1">Graphics, ribbons, center-hung content, video board, tunnels.</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-[var(--anc-border)] p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Your name" name="requesterName" required />
          <Field label="Email" name="email" type="email" required onBlur={handleEmailBlur} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Client / team" name="client" placeholder="e.g. Indiana Pacers" required inputRef={clientRef} />
          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue</label>
            <input
              type="text"
              name="venue"
              placeholder="Start typing — Fenway, Gainbridge…"
              onChange={handleVenueInput}
              autoComplete="off"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
            />
            <input ref={venueIdRef} type="hidden" name="venueId" />
            {venueSuggestions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                {venueSuggestions.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => pickVenue(v)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      <div className="font-medium text-gray-900">{v.name}</div>
                      {v.market && <div className="text-xs text-gray-500">{v.market}</div>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {autoFilled && (
          <div className="text-xs text-emerald-700 -mt-3">✨ {autoFilled}</div>
        )}

        {assetOptions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Which boards / sections? <span className="text-xs font-normal text-gray-500">(tap to select — pulled from venue inventory)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {assetOptions.map((a) => {
                const selected = selectedAssetIds.has(a.id)
                const subtitle = [a.displayType, a.orientation, a.resolution].filter(Boolean).join(' · ')
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => toggleAsset(a.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      selected
                        ? 'bg-[var(--anc-brand)] text-white border-[var(--anc-brand)]'
                        : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
                    }`}
                    title={subtitle}
                  >
                    {selected ? '✓ ' : ''}{a.name}
                  </button>
                )
              })}
            </div>
            {selectedAssetIds.size > 0 && (
              <div className="text-xs text-gray-500 mt-2">{selectedAssetIds.size} selected</div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Tri-code" name="triCode" placeholder="e.g. IND-PAC" />
          <Field label="Due date" name="dueDate" type="date" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Deliverable type"
            name="deliverableType"
            required
            options={[
              'Ribbon graphic',
              'Center-hung',
              'Scoreboard',
              'LED wall',
              'Tunnel',
              'Courtside',
              'Dasherboard',
              'Animation / motion',
              'Static graphic',
              'Other',
            ]}
          />
          <Select
            label="Sport / league"
            name="sport"
            options={['NFL', 'NBA', 'MLB', 'NHL', 'MLS', 'WNBA', 'NCAA', 'Other']}
          />
        </div>

        <div className="pt-1">
          <Checkbox label="Rush request" name="rushRequest" />
        </div>

        <Textarea
          label="Describe what you need"
          name="description"
          rows={5}
          placeholder="What are we designing? Copy, colors, dimensions, brand guidelines, references…"
          required
        />

        <Field
          label="Reference files (optional)"
          name="referenceNotes"
          placeholder="Dropbox / FTP / email reference paths"
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-[var(--anc-brand)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Submitting…' : 'Submit Design Request'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, name, type = 'text', required, placeholder, onBlur, inputRef }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        ref={inputRef}
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        onBlur={onBlur}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
      />
    </div>
  )
}

function Select({ label, name, options, required }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
      >
        <option value="" disabled>Select…</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function Checkbox({ label, name }: any) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
      <input type="checkbox" name={name} className="rounded border-gray-300 text-[var(--anc-brand)]" />
      {label}
    </label>
  )
}

function Textarea({ label, name, placeholder, rows = 4, required }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <textarea
        name={name}
        rows={rows}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
      />
    </div>
  )
}
