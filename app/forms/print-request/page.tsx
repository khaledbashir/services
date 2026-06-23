'use client'

import { useEffect, useMemo, useState } from 'react'

interface PrintShippingAddress {
  client: string
  address: string
}

function normalizeClientName(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function PrintRequestFormPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [addresses, setAddresses] = useState<PrintShippingAddress[]>([])
  const [clientName, setClientName] = useState('')
  const [shippingAddress, setShippingAddress] = useState('')

  const addressByClient = useMemo(() => {
    const map = new Map<string, string>()
    addresses.forEach((item) => map.set(normalizeClientName(item.client), item.address))
    return map
  }, [addresses])

  useEffect(() => {
    fetch('/api/print-shipping-addresses')
      .then((res) => res.ok ? res.json() : { addresses: [] })
      .then((data) => setAddresses(data.addresses || []))
      .catch(() => setAddresses([]))
  }, [])

  function handleClientChange(value: string) {
    setClientName(value)
    const nextAddress = addressByClient.get(normalizeClientName(value))
    if (nextAddress) setShippingAddress(nextAddress)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const payload = {
      submittedBy: fd.get('submittedBy'),
      requesterEmail: fd.get('email'),
      clientName,
      sfNumber: fd.get('sfNumber'),
      dueDate: fd.get('dueDate'),
      reprint: fd.get('reprint') === 'on',
      rushRequest: fd.get('rushRequest') === 'on',
      baselines: Number(fd.get('baselines') || 0),
      homePlate: Number(fd.get('homePlate') || 0),
      smallHomePlate: Number(fd.get('smallHomePlate') || 0),
      otherQty: Number(fd.get('otherQty') || 0),
      notes: fd.get('notes'),
      shippingAddress,
    }

    try {
      const res = await fetch('/api/forms/print-request', {
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
        <h1 className="text-xl font-bold text-gray-900 mb-2">Print Request submitted</h1>
        <p className="text-sm text-gray-600 mb-6">
          Thanks — your request <strong>{success.name}</strong> has been created in the CRM
          and Alexis will review it shortly.
        </p>
        <a
          href="/forms/print-request"
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
        <h1 className="text-2xl font-bold text-gray-900 mt-2">🖨️ Print Request</h1>
        <p className="text-sm text-gray-600 mt-1">Britten-fabricated signage. Fill this out and Alexis will pick it up.</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-xl border border-[var(--anc-border)] p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Submitted by" name="submittedBy" required />
          <Field label="Email" name="email" type="email" required />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Client / team<span className="text-red-500 ml-0.5">*</span>
          </label>
          <input
            list="print-shipping-clients"
            name="client"
            value={clientName}
            onChange={(event) => handleClientChange(event.target.value)}
            placeholder="e.g. Boston Red Sox"
            required
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
          />
          <datalist id="print-shipping-clients">
            {addresses.map((item) => (
              <option key={item.client} value={item.client} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="SF Number" name="sfNumber" placeholder="Optional" />
          <Field label="Due date" name="dueDate" type="date" required />
        </div>

        <div className="flex items-center gap-6 pt-1">
          <Checkbox label="Reprint" name="reprint" />
          <Checkbox label="Rush request" name="rushRequest" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quantities</label>
          <div className="grid grid-cols-4 gap-3">
            <NumberField label="Baselines" name="baselines" />
            <NumberField label="Home Plate" name="homePlate" />
            <NumberField label="Small HP" name="smallHomePlate" />
            <NumberField label="Other" name="otherQty" />
          </div>
        </div>

        <Textarea
          label="Shipping address"
          name="shippingAddress"
          placeholder="Where should Britten ship to?"
          rows={3}
          value={shippingAddress}
          onChange={setShippingAddress}
        />

        <Textarea
          label="Notes / special instructions"
          name="notes"
          placeholder="Anything Britten or Alexis should know about this job"
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
          {loading ? 'Submitting…' : 'Submit Print Request'}
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

function NumberField({ label, name }: any) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type="number"
        name={name}
        min="0"
        defaultValue="0"
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
      />
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

function Textarea({ label, name, placeholder, rows = 4, value, onChange }: any) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <textarea
        name={name}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--anc-brand)] focus:border-transparent"
      />
    </div>
  )
}
