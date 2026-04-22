'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'

interface VenuePortalRow {
  id: string
  name: string
  market: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  is_active: boolean
}

export default function PortalsPage() {
  useAuth('manager')

  const [venues, setVenues] = useState<VenuePortalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch('/api/venues?include_inactive=true')
        const payload = await response.json()
        setVenues(payload.venues || [])
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return venues
    return venues.filter((venue) =>
      [venue.name, venue.market, venue.primary_contact_name, venue.primary_contact_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
  }, [search, venues])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#D9E2F2] bg-gradient-to-br from-[#0A52EF] via-[#0A52EF] to-[#083BA8] p-6 text-white shadow-[0_24px_80px_-40px_rgba(10,82,239,0.9)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">External Access</p>
          <h1 className="mt-2 text-2xl font-semibold">Client Portals</h1>
          <p className="mt-2 max-w-3xl text-sm text-blue-100">
            Generate read-only venue links for clients who need a live snapshot of display health, open support tickets, and recent maintenance activity.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search venues, markets, or client contacts…"
            className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF]"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              <div>Venue</div>
              <div>Market</div>
              <div>Client Contact</div>
              <div />
            </div>

            {filteredVenues.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-zinc-500">No venues matched that search.</div>
            ) : (
              <div className="divide-y divide-zinc-200">
                {filteredVenues.map((venue) => (
                  <div key={venue.id} className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] gap-4 px-6 py-4 text-sm">
                    <div>
                      <div className="font-semibold text-zinc-950">{venue.name}</div>
                      {!venue.is_active && (
                        <div className="mt-1 inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                          Inactive
                        </div>
                      )}
                    </div>
                    <div className="text-zinc-600">{venue.market || '—'}</div>
                    <div className="text-zinc-600">
                      <div>{venue.primary_contact_name || 'Not set'}</div>
                      <div className="text-xs text-zinc-400">{venue.primary_contact_email || 'No email on file'}</div>
                    </div>
                    <div className="flex justify-end">
                      <Link
                        href={`/portals/${venue.id}`}
                        className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-[#0840C0]"
                      >
                        Manage Links
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
