'use client'

import { useState, useRef } from 'react'

type Venue = { id: string; name: string; market: string | null }

export default function PartsOrderFormPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [venueSuggestions, setVenueSuggestions] = useState<Venue[]>([])
  const [venueFillNote, setVenueFillNote] = useState<string | null>(null)
  const shippingRef = useRef<HTMLInputElement>(null)
  const venueIdRef = useRef<HTMLInputElement>(null)

  // Typeahead: search Twenty venues as the user types.
  async function handleVenueInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.currentTarget.value
    if (q.length < 2) { setVenueSuggestions([]); return }
    try {
      const res = await fetch(`/api/forms/search-venues?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setVenueSuggestions(data.venues || [])
    } catch { /* silent */ }
  }

  // When a venue from the suggestion list is picked, fetch its address and
  // pre-fill the shipping field. No more typing the same address by hand.
  async function pickVenue(v: Venue) {
    if (venueIdRef.current) venueIdRef.current.value = v.id
    const inputEl = document.querySelector<HTMLInputElement>('input[name="venue"]')
    if (inputEl) inputEl.value = v.name
    setVenueSuggestions([])
    try {
      const res = await fetch(`/api/forms/lookup-venue?id=${v.id}`)
      const data = await res.json()
      const addr = data?.venue
      if (addr && shippingRef.current) {
        const parts = [addr.addressStreet1, addr.addressCity, addr.addressState, addr.addressPostcode].filter(Boolean)
        if (parts.length > 0 && !shippingRef.current.value.trim()) {
          shippingRef.current.value = parts.join(', ')
          setVenueFillNote(`Shipping auto-filled from ${v.name} — edit if wrong`)
        }
      }
    } catch { /* silent */ }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const payload = {
      requestorName: fd.get('requestorName'),
      requestorEmail: fd.get('email'),
      venueName: fd.get('venue'),
      venueId: fd.get('venueId') || undefined,
      partsNeeded: fd.get('partsNeeded'),
      quantity: Number(fd.get('quantity') || 1),
      shippingAddress: fd.get('shippingAddress'),
      urgency: fd.get('urgency'),
      notes: fd.get('notes'),
    }

    try {
      const res = await fetch('/api/forms/parts-order', {
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
        <h1 className="text-xl font-bold text-gray-900 mb-2">Parts order submitted</h1>
        <p className="text-sm text-gray-600 mb-6">
          Your order <strong>{success.name}</strong> is in the queue. Gianni will review and process.
        </p>
        <a
          href="/forms/parts-order"
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
        <h1 className="text-2xl font-bold text-gray-900 mt-2">📦 Parts Order</h1>
        <p className="text-sm text-gray-600 mt-1">Internal parts ordering. Gianni handles fulfillment.</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-[var(--anc-border)] p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Your name" name="requestorName" required />
          <Field label="Email" name="email" type="email" required />
        </div>

        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Venue<span className="text-red-500 ml-0.5">*</span></label>
          <input
            type="text"
            name="venue"
            required
            placeholder="Start typing — Fenway, Prudential, Gainbridge…"
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

        <Textarea
          label="Parts needed"
          name="partsNeeded"
          rows={4}
          placeholder="List the parts — brand, model, size, spec. Example: 2x Samsung QM55R-B displays, 1x Cat6 cable 25ft"
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity (summary)" name="quantity" type="number" placeholder="1" />
          <Select
            label="Urgency"
            name="urgency"
            required
            options={['Normal', 'Rush', 'Emergency']}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Ship to address<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            ref={shippingRef}
            type="text"
            name="shippingAddress"
            required
            placeholder="Where do the parts need to go?"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
          />
          {venueFillNote && (
            <div className="text-xs text-emerald-700 mt-1">✨ {venueFillNote}</div>
          )}
        </div>

        <Textarea
          label="Additional notes"
          name="notes"
          placeholder="Anything Gianni should know — preferred vendor, budget, deadline context"
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
          {loading ? 'Submitting…' : 'Submit Parts Order'}
        </button>
      </form>
    </div>
  )
}

function Field({ label, name, type = 'text', required, placeholder }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
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
