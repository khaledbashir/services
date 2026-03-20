'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Venue {
  id: string
  name: string
  market: string
  event_count: number
  assigned_count: number
  requires_assignment: boolean
}

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week')
  const router = useRouter()

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/venues?period=${period}`)
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
  }, [period])

  const periodLabel = period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Venues</h1>
          <div className="flex gap-2">
            {(['today', 'week', 'month'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setPeriod(f)}
                className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                  period === f ? 'bg-[#0A52EF] text-white' : 'bg-white text-zinc-600 border border-[#E8E8E8] hover:border-zinc-300'
                }`}
              >
                {f === 'today' && 'Today'}
                {f === 'week' && 'Week'}
                {f === 'month' && 'Month'}
              </button>
            ))}
          </div>
        </div>

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
              const eventCount = Number(venue.event_count) || 0
              const assignedCount = Number(venue.assigned_count) || 0
              const allAssigned = eventCount > 0 && assignedCount >= eventCount
              const hasEvents = eventCount > 0
              const needsAssignment = venue.requires_assignment

              return (
                <div
                  key={venue.id}
                  onClick={() => router.push(`/venues/${venue.id}`)}
                  className="bg-white rounded shadow-sm border border-[#E8E8E8] overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
                >
                  <div className={`h-1 ${!needsAssignment ? 'bg-zinc-300' : hasEvents ? (allAssigned ? 'bg-emerald-500' : 'bg-rose-500') : 'bg-zinc-200'}`} style={{ width: '100%' }}></div>
                  <div className="p-5">
                    <h3 className="text-base font-semibold text-zinc-900 mb-1 hover:text-[#0A52EF] transition-colors">{venue.name}</h3>
                    <p className="text-zinc-500 text-sm mb-3">{venue.market}</p>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-zinc-600 font-medium">{eventCount} events {periodLabel}</p>
                      {hasEvents && needsAssignment && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${allAssigned ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                          {assignedCount}/{eventCount} assigned
                        </span>
                      )}
                      {!needsAssignment && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded bg-zinc-100 text-zinc-500">
                          Support only
                        </span>
                      )}
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
