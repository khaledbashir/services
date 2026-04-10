'use client'

import { useState } from 'react'

const OBJECT_TYPES = [
  { value: 'printRequest', label: 'Print Request (Britten)' },
  { value: 'designRequest', label: 'Design Request' },
  { value: 'cgDesignRequest', label: 'CG Design Request' },
  { value: 'contentSchedule', label: 'Content Schedule' },
]

export default function ProofAdminPage() {
  const [objectType, setObjectType] = useState('printRequest')
  const [recordId, setRecordId] = useState('')
  const [message, setMessage] = useState('')
  const [createdByName, setCreatedByName] = useState('')
  const [createdByEmail, setCreatedByEmail] = useState('')
  const [expiresInDays, setExpiresInDays] = useState<number | ''>(14)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ url: string; expiresAt: string | null; attachmentCount: number; recordName: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const create = async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/proof-share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          twentyObjectType: objectType,
          twentyRecordId: recordId.trim(),
          expiresInDays: expiresInDays === '' ? undefined : Number(expiresInDays),
          message: message || undefined,
          createdByName: createdByName || undefined,
          createdByEmail: createdByEmail || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`)
        return
      }
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create')
    } finally {
      setLoading(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4" style={{ ['--anc-brand' as any]: '#0A52EF' }}>
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[color:var(--anc-brand)] flex items-center justify-center">
            <span className="text-white font-bold text-xs tracking-tight">ANC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">ANC Sports</div>
            <div className="text-xs text-gray-500">Generate proof share link</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-5">
          <div>
            <h1 className="text-xl font-bold text-gray-900 mb-1">Share a proof with a client</h1>
            <p className="text-sm text-gray-600">
              Turn any Twenty CRM record with attachments into a polished public URL for client review.
            </p>
          </div>

          <Field label="Twenty object type" required>
            <select
              value={objectType}
              onChange={(e) => setObjectType(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
            >
              {OBJECT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Twenty record ID"
            required
            hint="Copy the UUID from the Twenty record's URL — the long string after /view/"
          >
            <input
              type="text"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="e.g. 189ae25b-096d-43b8-9fda-fb862a1352dc"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
            />
          </Field>

          <Field label="Message to client (optional)" hint="Shows at the top of the proof page">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Hi Penn State team — here's the proof for the opening night ribbon. Let us know if you have any changes!"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent resize-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Your name" hint="Shown to the client">
              <input
                type="text"
                value={createdByName}
                onChange={(e) => setCreatedByName(e.target.value)}
                placeholder="Alexis Ventarola"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
              />
            </Field>
            <Field label="Your email" hint="For client to reply to">
              <input
                type="email"
                value={createdByEmail}
                onChange={(e) => setCreatedByEmail(e.target.value)}
                placeholder="alexis@anc.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
              />
            </Field>
          </div>

          <Field label="Expires in (days)" hint="Leave blank for no expiration">
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value === '' ? '' : Number(e.target.value))}
              min={1}
              placeholder="14"
              className="w-32 px-3 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand)] focus:border-transparent"
            />
          </Field>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={create}
            disabled={loading || !recordId.trim()}
            className="w-full py-3 bg-[color:var(--anc-brand)] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating…' : 'Generate share link'}
          </button>

          {result && (
            <div className="rounded-xl bg-green-50 border-2 border-green-200 p-5">
              <div className="flex items-start gap-3 mb-4">
                <div className="text-2xl">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900">Share link created</div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {result.recordName} · {result.attachmentCount} file{result.attachmentCount !== 1 ? 's' : ''} · {result.expiresAt ? `expires ${new Date(result.expiresAt).toLocaleDateString()}` : 'no expiration'}
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-lg border border-green-200 p-3 flex items-center gap-2">
                <input
                  readOnly
                  value={result.url}
                  className="flex-1 text-xs font-mono text-gray-800 bg-transparent focus:outline-none"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button
                  onClick={() => copy(result.url)}
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-[color:var(--anc-brand)] text-white font-medium hover:opacity-90"
                >
                  Copy
                </button>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs px-3 py-1.5 rounded-md bg-white border border-gray-200 text-gray-700 font-medium hover:border-gray-300"
                >
                  Open
                </a>
              </div>
              <div className="text-xs text-gray-600 mt-3">
                Paste this link in an email to your client. They&apos;ll see the proof, review it,
                and can approve or request changes — everything flows back to Twenty automatically.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  )
}
