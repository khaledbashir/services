'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'

interface VenueSummary {
  id: string
  name: string
  address: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
}

interface PortalRow {
  id: string
  token: string
  created_by_email: string
  created_at: string
  expires_at: string | null
  last_viewed_at: string | null
  view_count: number
  revoked_at: string | null
  share_url: string
}

function formatDateTime(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function maskToken(token: string) {
  return `${token.slice(0, 10)}…${token.slice(-6)}`
}

export default function PortalAdminClient({ venueId }: { venueId: string }) {
  useAuth('manager')
  const { showToast } = useToast()

  const [venue, setVenue] = useState<VenueSummary | null>(null)
  const [portals, setPortals] = useState<PortalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [expiryMode, setExpiryMode] = useState<'never' | '30' | '90'>('never')

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/portals?venue_id=${venueId}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to load portal links')
      setVenue(payload.venue || null)
      setPortals(payload.portals || [])
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to load portal links', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId])

  const activePortals = useMemo(() => portals.filter((portal) => !portal.revoked_at), [portals])
  const revokedPortals = useMemo(() => portals.filter((portal) => Boolean(portal.revoked_at)), [portals])

  const createPortal = async () => {
    setSubmitting(true)
    try {
      const expiresAt =
        expiryMode === 'never'
          ? null
          : new Date(Date.now() + Number(expiryMode) * 24 * 60 * 60 * 1000).toISOString()

      const response = await fetch('/api/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          expires_at: expiresAt,
        }),
      })

      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to generate portal link')

      showToast('Portal link generated', 'success')
      await navigator.clipboard.writeText(payload.portal.share_url)
      showToast('Share link copied to clipboard', 'success')
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to generate portal link', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const revokePortal = async (portalId: string) => {
    setRevokingId(portalId)
    try {
      const response = await fetch(`/api/portals/${portalId}/revoke`, { method: 'POST' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to revoke portal link')
      showToast('Portal link revoked', 'success')
      await loadData()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to revoke portal link', 'error')
    } finally {
      setRevokingId(null)
    }
  }

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      showToast('Portal link copied', 'success')
    } catch {
      showToast('Failed to copy portal link', 'error')
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#D9E2F2] bg-gradient-to-br from-[#0A52EF] via-[#0A52EF] to-[#083BA8] p-6 text-white shadow-[0_24px_80px_-40px_rgba(10,82,239,0.9)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Client Portal Control</p>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{venue?.name || 'Loading venue…'}</h1>
              <p className="mt-1 max-w-2xl text-sm text-blue-100">
                Generate read-only links for venue contacts so they can check display health, recent tickets, and maintenance history without a dashboard login.
              </p>
            </div>
            <Link
              href="/portals"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-white/20 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Back To Portals
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 rounded-2xl" />
            <Skeleton className="h-80 rounded-2xl" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Venue Contact</p>
                <h2 className="mt-2 text-lg font-semibold text-zinc-950">{venue?.primary_contact_name || 'Not set yet'}</h2>
                <p className="mt-1 text-sm text-zinc-500">{venue?.primary_contact_email || 'No contact email on file'}</p>
                <p className="mt-4 text-sm text-zinc-600">{venue?.address || 'No venue address saved.'}</p>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">Generate New Link</p>
                <div className="mt-4 space-y-3">
                  <label className="block text-sm font-medium text-zinc-700">
                    Expiration
                    <select
                      value={expiryMode}
                      onChange={(event) => setExpiryMode(event.target.value as 'never' | '30' | '90')}
                      className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-0 transition focus:border-[#0A52EF]"
                    >
                      <option value="never">No expiration</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={createPortal}
                    disabled={submitting}
                    className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Generating…' : 'Generate New Link'}
                  </button>
                </div>
              </div>
            </div>

            <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-6 py-5">
                <h2 className="text-lg font-semibold text-zinc-950">Active Links</h2>
                <p className="mt-1 text-sm text-zinc-500">These links are live right now. Revoked links stop resolving immediately.</p>
              </div>

              {activePortals.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <p className="text-base font-medium text-zinc-900">No live portal links yet</p>
                  <p className="mt-2 text-sm text-zinc-500">Generate the first link above and we’ll copy the share URL for you automatically.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-200">
                  {activePortals.map((portal) => (
                    <div key={portal.id} className="space-y-4 px-6 py-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                            Active
                          </div>
                          <p className="mt-3 break-all rounded-xl bg-zinc-50 px-3 py-3 font-mono text-xs text-zinc-700">
                            {portal.share_url}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-zinc-500">
                            <span>Token {maskToken(portal.token)}</span>
                            <span>Created {formatDateTime(portal.created_at)}</span>
                            <span>Views {portal.view_count}</span>
                            <span>Last viewed {formatDateTime(portal.last_viewed_at)}</span>
                            <span>Expires {formatDateTime(portal.expires_at)}</span>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => copyLink(portal.share_url)}
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF] hover:text-[#0A52EF]"
                          >
                            Copy Link
                          </button>
                          <a
                            href={portal.share_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF] hover:text-[#0A52EF]"
                          >
                            Open
                          </a>
                          <button
                            type="button"
                            onClick={() => revokePortal(portal.id)}
                            disabled={revokingId === portal.id}
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {revokingId === portal.id ? 'Revoking…' : 'Revoke'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <div className="border-b border-zinc-200 px-6 py-5">
                <h2 className="text-lg font-semibold text-zinc-950">Revoked Links</h2>
                <p className="mt-1 text-sm text-zinc-500">Kept here for audit history. These URLs no longer resolve publicly.</p>
              </div>

              {revokedPortals.length === 0 ? (
                <div className="px-6 py-10 text-sm text-zinc-500">No revoked links yet.</div>
              ) : (
                <div className="divide-y divide-zinc-200">
                  {revokedPortals.map((portal) => (
                    <div key={portal.id} className="px-6 py-4">
                      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-700">
                        <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-600">
                          Revoked
                        </span>
                        <span className="font-mono text-xs text-zinc-500">{maskToken(portal.token)}</span>
                        <span>Created {formatDateTime(portal.created_at)}</span>
                        <span>Revoked {formatDateTime(portal.revoked_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
