'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function CustomerInvitePage() {
  const params = useParams<{ token: string }>()
  const router = useRouter()
  const [invite, setInvite] = useState<{ email: string; full_name: string; client_name: string | null } | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch(`/api/customer/auth/accept-invite?token=${encodeURIComponent(params.token)}`)
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setInvite(data.invite))
      .catch(() => setInvalid(true))
  }, [params.token])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/customer/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: params.token, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not set password')
        return
      }
      router.push('/customer')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#1B2A4A] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-12 mx-auto mb-4" />
          <h1 className="text-white text-2xl font-semibold">Welcome to the Customer Portal</h1>
        </div>
        {invalid ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <p className="text-slate-700 font-medium">This invite link is invalid or has expired.</p>
            <p className="text-sm text-slate-500 mt-2">Please contact your ANC account representative for a new invite.</p>
          </div>
        ) : !invite ? (
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center text-slate-400">Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl p-8 space-y-5">
            <div className="text-center">
              <p className="text-slate-900 font-medium">Hi {invite.full_name.split(' ')[0]} 👋</p>
              <p className="text-sm text-slate-500 mt-1">
                Set a password for <span className="font-medium">{invite.email}</span>
                {invite.client_name && <> · {invite.client_name}</>}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-[#0A52EF] py-2.5 text-white font-medium hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {loading ? 'Setting up…' : 'Set password & sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
