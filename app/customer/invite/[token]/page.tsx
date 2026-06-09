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
    <div className="cp-auth-shell">
      <div className="cp-auth-card">
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-10 mx-auto mb-6" />
          <div className="cp-header-tag mb-3">Account Activation</div>
          <h1 className="cp-display text-3xl font-bold">Welcome aboard</h1>
        </div>

        {invalid ? (
          <div className="cp-panel p-8 text-center">
            <p className="font-medium">This invite link is invalid or has expired.</p>
            <p className="text-sm mt-2" style={{ color: 'var(--cp-muted)' }}>
              Contact your ANC account representative for a new invite.
            </p>
          </div>
        ) : !invite ? (
          <div className="cp-panel p-8 text-center" style={{ color: 'var(--cp-dim)' }}>Loading…</div>
        ) : (
          <form onSubmit={handleSubmit} className="cp-panel p-8 space-y-6">
            <div>
              <div className="cp-label mb-1">Activating account for</div>
              <div className="font-medium">{invite.full_name}</div>
              <div className="cp-mono text-xs mt-0.5" style={{ color: 'var(--cp-muted)' }}>
                {invite.email}{invite.client_name && ` · ${invite.client_name}`}
              </div>
            </div>
            <div>
              <label className="cp-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="cp-input"
                placeholder="At least 8 characters"
              />
            </div>
            <div>
              <label className="cp-label">Confirm password</label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="cp-input"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="cp-error">{error}</div>}
            <button type="submit" disabled={loading} className="cp-btn w-full">
              {loading ? 'Activating…' : 'Activate & sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
