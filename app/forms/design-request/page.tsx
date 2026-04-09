'use client'

import { useState } from 'react'

export default function DesignRequestFormPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState<{ id: string; name: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const fd = new FormData(e.currentTarget)
    const payload = {
      requesterName: fd.get('requesterName'),
      requesterEmail: fd.get('email'),
      clientName: fd.get('client'),
      venueName: fd.get('venue'),
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
          <Field label="Email" name="email" type="email" required />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Client / team" name="client" placeholder="e.g. Indiana Pacers" required />
          <Field label="Venue" name="venue" placeholder="e.g. Gainbridge Fieldhouse" />
        </div>

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
