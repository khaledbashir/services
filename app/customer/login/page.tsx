'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function CustomerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
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

  return (
    <div className="cp-auth-shell">
      <div className="cp-auth-card">
        <div className="text-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-10 mx-auto mb-6" />
          <div className="cp-header-tag mb-3">ANC Sports + Entertainment</div>
          <h1 className="cp-display text-3xl font-bold">Customer Portal</h1>
        </div>

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
        </form>

        <p className="cp-stat-label text-center mt-6 normal-case tracking-widest">
          Need access? Contact your ANC account representative
        </p>
      </div>
    </div>
  )
}
