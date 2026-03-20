'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'

interface VenuePortal {
  id: string
  name: string
  market: string
  portal_token: string
  primary_contact_name: string | null
  primary_contact_email: string | null
}

export default function PortalsPage() {
  const auth = useAuth('manager')
  const [venues, setVenues] = useState<VenuePortal[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await fetch('/api/venues')
        if (res.ok) {
          const data = await res.json()
          setVenues(data.venues || [])
        }
      } catch {} finally { setLoading(false) }
    }
    fetchVenues()
  }, [])

  const copyLink = (token: string, id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const filtered = venues.filter(v => {
    const q = search.toLowerCase()
    return !q || v.name.toLowerCase().includes(q) || (v.market || '').toLowerCase().includes(q) || (v.primary_contact_name || '').toLowerCase().includes(q)
  })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Client Portals</h1>
          <p className="text-sm text-zinc-500 mt-1">Each venue has a unique portal link for client self-service access</p>
        </div>

        <div className="relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search venues, contacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
          />
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
        ) : (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Venue</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Market</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Contact</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Portal Link</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(venue => (
                  <tr key={venue.id} className="border-b border-[#E8E8E8] hover:bg-zinc-50 transition-colors">
                    <td className="py-3 px-6 font-medium text-zinc-900">{venue.name}</td>
                    <td className="py-3 px-6 text-zinc-600 text-xs">{venue.market}</td>
                    <td className="py-3 px-6">
                      {venue.primary_contact_name ? (
                        <div>
                          <p className="text-xs text-zinc-900">{venue.primary_contact_name}</p>
                          {venue.primary_contact_email && <p className="text-xs text-zinc-400">{venue.primary_contact_email}</p>}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">Not set</span>
                      )}
                    </td>
                    <td className="py-3 px-6">
                      <code className="text-xs text-zinc-500 bg-zinc-50 px-2 py-1 rounded">/portal/{(venue as any).portal_token?.substring(0, 8)}...</code>
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex gap-2">
                        <button
                          onClick={() => copyLink((venue as any).portal_token, venue.id)}
                          className="text-xs font-medium text-[#0A52EF] hover:text-[#0840C0] transition-colors"
                        >
                          {copiedId === venue.id ? 'Copied!' : 'Copy Link'}
                        </button>
                        <a
                          href={`/portal/${(venue as any).portal_token}`}
                          target="_blank"
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-700 transition-colors"
                        >
                          Preview ↗
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
