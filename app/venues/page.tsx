'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Venue {
  id: string
  name: string
  market: string
  events_this_month: number
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await fetch('/api/venues')
        if (res.ok) {
          const data = await res.json()
          setVenues(data.venues || [])
        }
      } catch (err) {
        console.error('Failed to fetch venues:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchVenues()
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-zinc-900">Venues</h1>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : venues.length === 0 ? (
          <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-12 text-center">
            <p className="text-zinc-500 text-sm">No venues found</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {venues.map((venue) => {
              const eventCount = venue.events_this_month || 0
              const maxEvents = Math.max(...venues.map((v) => v.events_this_month || 0), 1)
              const coverage = (eventCount / maxEvents) * 100
              return (
                <div
                  key={venue.id}
                  onClick={() => router.push(`/venues/${venue.id}`)}
                  className="bg-white rounded shadow-sm border border-[#E8E8E8] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600" style={{ width: `${coverage}%` }}></div>
                  <div className="p-5">
                    <h3 className="text-base font-semibold text-zinc-900 mb-1 hover:text-[#0A52EF] transition-colors">{venue.name}</h3>
                    <p className="text-zinc-500 text-sm mb-3">{venue.market}</p>
                    <div className="space-y-2">
                      <p className="text-xs text-zinc-600 font-medium">{eventCount} events this week</p>
                      <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${coverage}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
