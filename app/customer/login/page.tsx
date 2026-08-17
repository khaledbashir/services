'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Mode = 'signin' | 'forgot'

export default function CustomerLoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/customer/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Sign in failed')
        return
      }
      router.push('/customer')
      router.refresh()
    } catch {
      setError('Sign in failed — please try again')
    } finally {
      setLoading(false)
    }
  }

  // Charlie 2026-08-17: a customer who forgot their password used to have to
  // reach someone at ANC to get their invite re-sent by hand. The response is
  // the same whether or not the address has an account, so this cannot be used
  // to find out who has portal access.
  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      const res = await fetch('/api/customer/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not send the reset email')
        return
      }
      setNotice(data.message || 'If that email has portal access, a reset link is on its way.')
    } catch {
      setError('Could not send the reset email — please try again')
    } finally {
      setLoading(false)
    }
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setNotice('')
  }

  return (
    <div className="cp-auth-shell">
      <div className="cp-auth-card">
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-10 mx-auto mb-6" />
          <div className="cp-header-tag mb-3">ANC Sports + Entertainment</div>
          <h1 className="cp-display text-3xl font-bold">
            {mode === 'forgot' ? 'Reset your password' : 'Customer Portal'}
          </h1>
        </div>

        {mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="cp-panel p-8 space-y-6">
            <p className="text-sm" style={{ color: 'var(--cp-muted)' }}>
              Enter the email you sign in with and we&rsquo;ll send you a link to choose a new password.
            </p>
            <div>
              <label className="cp-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="cp-input"
                placeholder="you@company.com"
              />
            </div>
            {error && <div className="cp-error">{error}</div>}
            {notice && (
              <div className="text-sm" style={{ color: 'var(--cp-muted)' }}>{notice}</div>
            )}
            <button type="submit" disabled={loading} className="cp-btn w-full">
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="w-full text-center text-sm underline"
              style={{ color: 'var(--cp-muted)' }}
            >
              Back to sign in
            </button>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="cp-panel p-8 space-y-6">
            <div>
              <label className="cp-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="cp-input"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="cp-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="cp-input"
                placeholder="••••••••"
              />
            </div>
            {error && <div className="cp-error">{error}</div>}
            <button type="submit" disabled={loading} className="cp-btn w-full">
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
            <button
              type="button"
              onClick={() => switchMode('forgot')}
              className="w-full text-center text-sm underline"
              style={{ color: 'var(--cp-muted)' }}
            >
              Forgot your password?
            </button>
          </form>
        )}

        <p className="cp-stat-label text-center mt-6 normal-case tracking-widest">
          Need access? Contact your ANC account representative
        </p>
      </div>
    </div>
  )
}
