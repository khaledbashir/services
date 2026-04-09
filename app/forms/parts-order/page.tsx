'use client'

import { useState } from 'react'

export default function PartsOrderFormPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const payload = {
      requestorName: fd.get('requestorName'),
      requestorEmail: fd.get('email'),
      venueName: fd.get('venue'),
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

        <Field label="Venue" name="venue" placeholder="Where are the parts for?" required />

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

        <Field
          label="Ship to address"
          name="shippingAddress"
          placeholder="Where do the parts need to go?"
          required
        />

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
