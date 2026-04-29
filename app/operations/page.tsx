'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

// Embedded NocoDB instance — Nick's Airtable replacement after the
// 2026-04-29 meeting. NocoDB lives on its own host (set via
// NEXT_PUBLIC_NOCODB_URL, e.g. https://ops.ancsports.net) so we can
// rebrand the chassis without touching anc-services. Iframe gives us
// "looks native, single dashboard" UX without rebuilding a table view
// we already get for free.
//
// The user has to be logged into NocoDB once on its own host; the
// iframe carries the cookie. If you want SSO (one login for both), we
// add JWT-based auth-pass-through later — not blocking today.
export default function OperationsPage() {
  const [nocoUrl, setNocoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_NOCODB_URL
    if (!url) {
      setError('NEXT_PUBLIC_NOCODB_URL is not set on the server.')
      return
    }
    setNocoUrl(url)
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-1">
              Field Ops
            </div>
            <h1 className="text-xl leading-tight font-semibold text-zinc-900">
              Operations
            </h1>
          </div>
          {nocoUrl && (
            <a
              href={nocoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-600 hover:text-zinc-900 hover:ring-zinc-300"
              title="Open in a new tab"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7m0-7L10 14M5 5h6m-6 4v10h10v-6" />
              </svg>
              <span>Open in new tab</span>
            </a>
          )}
        </div>

        {error ? (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-6 text-sm text-amber-900">
            <div className="font-semibold mb-1">Operations not configured yet</div>
            <p className="text-amber-800">
              Set <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">NEXT_PUBLIC_NOCODB_URL</code> to your NocoDB host (e.g. <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">https://ops.ancsports.net</code>) in EasyPanel and redeploy.
            </p>
          </div>
        ) : nocoUrl ? (
          <div className="rounded-xl ring-1 ring-zinc-200 bg-white overflow-hidden" style={{ height: 'calc(100vh - 11rem)' }}>
            <iframe
              src={nocoUrl}
              title="ANC Operations"
              className="w-full h-full block border-0"
              allow="clipboard-read; clipboard-write; fullscreen"
            />
          </div>
        ) : (
          <div className="rounded-xl bg-white ring-1 ring-zinc-200 py-16 text-center text-sm text-zinc-500">
            Loading…
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
