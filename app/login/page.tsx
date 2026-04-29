'use client'

import { FormEvent, Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// Only honor same-origin redirects so `?redirect=` can't be used as an open-redirect vector.
function safeRedirectPath(raw: string | null): string | null {
  if (!raw) return null
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  return raw
}

// useSearchParams triggers a CSR bailout during prerender in Next 14 unless
// wrapped in a Suspense boundary, so the form lives in a child component.
function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectParam = safeRedirectPath(searchParams?.get('redirect') || null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Login failed')
        return
      }

      // Store user info for frontend role checks
      if (data.user) {
        localStorage.setItem('userName', data.user.fullName)
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userId', data.user.userId)
      }

      const defaultPath = data.user?.role === 'technician' ? '/my-events' : '/dashboard'
      router.push(redirectParam || defaultPath)
    } catch (err) {
      setError('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-none rounded border border-white/10 bg-[#151515]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur md:p-8">
      <div className="mb-7">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-9" />
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-zinc-500">Service Dashboard</p>
      </div>

      <div className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-white">Sign in to operations</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Access events, venues, tickets, workflows, and field operations from one place.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-200">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-12 w-full rounded border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/20"
            placeholder="firstname.lastname@anc.com"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-zinc-200">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-12 w-full rounded border border-white/10 bg-[#0f0f0f] px-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/20"
            placeholder="Enter your password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-2 h-12 w-full rounded bg-[#0A52EF] text-sm font-semibold text-white transition hover:bg-[#2563eb] focus:outline-none focus:ring-4 focus:ring-[#0A52EF]/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 border-t border-white/10 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
          <span>Secure ANC workspace</span>
          <span className="rounded border border-white/10 px-2 py-1 text-zinc-400">24h session</span>
        </div>
      </div>
    </div>
  )
}

function StatusCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">{label}</p>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="w-full max-w-md rounded border border-white/10 bg-[#151515]/95 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.45)] md:p-8">
      <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-9" />
      <div className="mt-8 space-y-4">
        <div className="h-7 w-56 animate-pulse rounded bg-white/10" />
        <div className="h-4 w-72 animate-pulse rounded bg-white/10" />
        <div className="h-12 animate-pulse rounded bg-white/10" />
        <div className="h-12 animate-pulse rounded bg-white/10" />
        <div className="h-12 animate-pulse rounded bg-[#0A52EF]/40" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-[100svh] bg-[#0f0f0f] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden border-r border-white/10 bg-[linear-gradient(135deg,#111111_0%,#151515_48%,#0A52EF_145%)] px-10 py-10 lg:flex lg:flex-col">
          <div className="flex items-center justify-between">
            <div>
              <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Services</p>
            </div>
            <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-100">
              Operations online
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center py-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#60a5fa]">ANC command center</p>
            <h2 className="mt-4 max-w-3xl text-5xl font-semibold tracking-tight text-white">
              One login for the work that keeps game day moving.
            </h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-zinc-400">
              Events, venue service status, creative requests, support tickets, staffing workflows, and field operations stay connected behind a single operational view.
            </p>

            <div className="mt-10 grid max-w-3xl grid-cols-3 gap-4">
              <StatusCard label="Events" value="Live" accent="#0A52EF" />
              <StatusCard label="Support" value="Ready" accent="#10b981" />
              <StatusCard label="Creative" value="Queued" accent="#f59e0b" />
            </div>

            <div className="mt-8 max-w-3xl rounded border border-white/10 bg-black/20 p-5">
              <div className="flex items-start gap-4">
                <div className="mt-1 h-2 w-2 rounded-full bg-[#0A52EF]" />
                <div>
                  <p className="text-sm font-semibold text-white">Built for repeated operational use</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">
                    Fast scanning, role-based routes, and clean handoffs from staff assignment through post-game reporting.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-white/10 pt-5 text-xs text-zinc-500">
            <span>services.anc.com</span>
            <span>Events - Venues - Tickets - Creative - Field Ops</span>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-5 py-8">
          <div className="w-full min-w-0" style={{ maxWidth: 'min(28rem, calc(100vw - 48px))' }}>
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <div>
                <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">Services</p>
              </div>
            </div>

            <Suspense fallback={<LoginFallback />}>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
      <style jsx global>{`
        html,
        body {
          background: #0f0f0f;
        }
      `}</style>
    </main>
  )
}
