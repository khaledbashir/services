'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'

export default function AccountPage() {
  const auth = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Email signature (appended to ticket replies this tech sends)
  const [signature, setSignature] = useState('')
  const [sigSaving, setSigSaving] = useState(false)
  const [sigSaved, setSigSaved] = useState(false)

  useEffect(() => {
    let on = true
    fetch('/api/account/signature')
      .then((r) => r.json())
      .then((d) => { if (on && typeof d?.signature === 'string') setSignature(d.signature) })
      .catch(() => {})
    return () => { on = false }
  }, [])

  const saveSignature = async () => {
    setSigSaving(true)
    setSigSaved(false)
    try {
      const res = await fetch('/api/account/signature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      })
      if (res.ok) setSigSaved(true)
    } catch {
      /* no-op */
    } finally {
      setSigSaving(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (next.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'Failed to update password.')
      } else {
        setSuccess(true)
        setCurrent('')
        setNext('')
        setConfirm('')
      }
    } catch {
      setError('Network error — please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Account</h1>
          <p className="text-sm text-zinc-500 mt-1">Update the password for your login.</p>
        </div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm">
          <div className="text-xs text-zinc-500 uppercase tracking-wide font-semibold">Signed in as</div>
          <div className="mt-2 text-sm text-zinc-900 font-medium">{auth.userName || '—'}</div>
          <div className="text-xs text-zinc-500 mt-0.5 capitalize">{auth.role.replace('_', ' ')}</div>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm space-y-4">
          <h2 className="text-sm font-semibold text-zinc-900">Change Password</h2>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Current password</label>
            <input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">New password</label>
            <input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none"
            />
            <p className="text-xs text-zinc-400 mt-1">At least 8 characters.</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">Password updated.</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0840C0] disabled:opacity-60"
          >
            {submitting ? 'Updating…' : 'Update Password'}
          </button>
        </form>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 shadow-sm space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Email Signature</h2>
            <p className="text-xs text-zinc-500 mt-1">
              Added automatically to the bottom of replies you send from a ticket. Replies go out from the shared ANC support address, but your signature is attached to the ones you send.
            </p>
          </div>

          <textarea
            value={signature}
            onChange={(e) => { setSignature(e.target.value); setSigSaved(false) }}
            rows={5}
            maxLength={2000}
            placeholder={'Jane Doe\nField Technician, ANC\n(555) 123-4567'}
            className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono"
          />

          {sigSaved && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">Signature saved.</div>
          )}

          <button
            type="button"
            onClick={saveSignature}
            disabled={sigSaving}
            className="inline-flex items-center justify-center rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#0840C0] disabled:opacity-60"
          >
            {sigSaving ? 'Saving…' : 'Save Signature'}
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
