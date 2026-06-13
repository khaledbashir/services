'use client'

import { cn } from '@/lib/utils'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

type MarketingStudioShellProps = {
  title: string
  subtitle?: string
  status?: string
  backHref?: string
  backLabel?: string
  actions?: ReactNode
  banner?: ReactNode
  message?: string
  children: ReactNode
}

export function MarketingStudioShell({
  title,
  subtitle,
  status,
  backHref = '/marketing-hub',
  backLabel = 'Marketing Hub',
  actions,
  banner,
  message,
  children,
}: MarketingStudioShellProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#0a0b10]">
      <header className="shrink-0 border-b border-white/8 bg-[#10121a]/95 px-5 py-4 backdrop-blur md:px-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 transition-colors hover:text-zinc-300"
            >
              <ArrowLeft className="size-3.5" />
              {backLabel}
            </Link>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white md:text-[1.75rem]">{title}</h1>
              {subtitle && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-400">{subtitle}</p>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status && (
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-300">
                {status}
              </span>
            )}
            {actions}
          </div>
        </div>
        {banner && <div className="mt-4">{banner}</div>}
        {message && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">{message}</div>
        )}
      </header>
      <div className={cn('min-h-0 flex-1 overflow-hidden px-4 py-5 md:px-6 md:py-6')}>{children}</div>
    </div>
  )
}
