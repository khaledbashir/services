'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  if (raw.startsWith('/login')) return '/dashboard'
  return raw
}

function SsoCompleteInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('Finishing Microsoft sign-in...')

  useEffect(() => {
    let active = true

    async function finish() {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' })
        const data = await res.json()

        if (!active) return
        if (!data.user) {
          router.replace('/login?error=microsoft_no_session')
          return
        }

        localStorage.setItem('userName', data.user.fullName)
        localStorage.setItem('userRole', data.user.role)
        localStorage.setItem('userId', data.user.userId)
        ;(window as unknown as { umami?: { identify: (d: Record<string, unknown>) => void } }).umami?.identify?.({
          id: data.user.userId,
          name: data.user.fullName,
          role: data.user.role,
        })

        router.replace(safeRedirectPath(searchParams?.get('redirect') || null))
      } catch {
        if (!active) return
        setMessage('Microsoft sign-in worked, but the browser session could not finish.')
      }
    }

    finish()
    return () => {
      active = false
    }
  }, [router, searchParams])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-5 text-white">
      <div className="w-full max-w-sm rounded border border-white/10 bg-[#151515] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
        <img src="/ANC_Logo_2023_white.png" alt="ANC" className="mx-auto h-9" />
        <div className="mx-auto mt-8 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#0A52EF]" />
        <p className="mt-5 text-sm text-zinc-300">{message}</p>
      </div>
    </main>
  )
}

export default function SsoCompletePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#0f0f0f] px-5 text-white">
          <div className="w-full max-w-sm rounded border border-white/10 bg-[#151515] p-6 text-center shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="mx-auto h-9" />
            <div className="mx-auto mt-8 h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#0A52EF]" />
            <p className="mt-5 text-sm text-zinc-300">Finishing Microsoft sign-in...</p>
          </div>
        </main>
      }
    >
      <SsoCompleteInner />
    </Suspense>
  )
}
