'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface VenueDetail {
  id: string
  name: string
  market_name: string
  address: string
  slack_channel_id: string | null
  service_responsibilities: string[]
  primary_contact_name: string | null
  primary_contact_email: string | null
}

interface UpcomingEvent {
  id: string
  event_name: string
  league: string
  event_date: string
  start_time: string
  assigned_techs: string
  workflow_status: string
}

interface AssignedStaff {
  id: string
  full_name: string
  role: string
}

const leagueColors: Record<string, { bg: string; text: string }> = {
  NBA: { bg: 'bg-orange-100', text: 'text-orange-700' },
  NHL: { bg: 'bg-blue-100', text: 'text-[#0840C0]' },
  NCAAM: { bg: 'bg-purple-100', text: 'text-purple-700' },
  NCAAW: { bg: 'bg-pink-100', text: 'text-pink-700' },
  MLB: { bg: 'bg-red-100', text: 'text-red-700' },
  AHL: { bg: 'bg-teal-100', text: 'text-teal-700' },
  MiLB: { bg: 'bg-green-100', text: 'text-green-700' },
}

const workflowStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-gray-100', text: 'text-gray-700' },
  checked_in: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  game_ready: { bg: 'bg-green-100', text: 'text-green-700' },
  post_game_submitted: { bg: 'bg-blue-100', text: 'text-[#0840C0]' },
}

export default function VenueDetailPage({ params }: { params: { id: string } }) {
  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([])
  const [loading, setLoading] = useState(true)
  const [slackChannelId, setSlackChannelId] = useState('')
  const [savingSlack, setSavingSlack] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/venues/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setVenue(data.venue)
          setUpcomingEvents(data.upcomingEvents || [])
          setAssignedStaff(data.assignedStaff || [])
          setSlackChannelId(data.venue.slack_channel_id || '')
        }
      } catch (err) {
        console.error('Failed to fetch venue:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [params.id])

  const handleSlackUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!venue) return

    setSavingSlack(true)
    try {
      const res = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_channel_id: slackChannelId || null }),
      })

      if (res.ok) {
        const data = await res.json()
        setVenue(data.venue)
      } else {
        alert('Failed to update Slack channel')
      }
    } catch (err) {
      console.error('Failed to update:', err)
    } finally {
      setSavingSlack(false)
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  }

  const getLeagueBadge = (league: string) => {
    return leagueColors[league] || { bg: 'bg-gray-100', text: 'text-gray-700' }
  }

  const getWorkflowStatus = (status: string) => {
    return workflowStatusColors[status] || workflowStatusColors.pending
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="text-gray-500">Loading venue details...</div>
      </DashboardLayout>
    )
  }

  if (!venue) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded shadow-sm border border-gray-200 p-12 text-center">
          <p className="text-gray-500 text-lg">Venue not found</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="bg-white rounded shadow-sm border border-gray-200 p-8">
          <h1 className="text-4xl font-bold text-gray-900">{venue.name}</h1>
          <p className="text-gray-600 text-lg mt-1">{venue.market_name}</p>
          <p className="text-gray-500 mt-2">{venue.address}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Upcoming Events */}
            <div className="bg-white rounded shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Upcoming Events (Next 30 Days)</h2>
              </div>
              {upcomingEvents.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No events scheduled in the next 30 days</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">Date</th>
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">Event</th>
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">League</th>
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">Time</th>
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">Assigned Techs</th>
                        <th className="text-left py-3 px-6 text-sm font-semibold text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingEvents.map((event) => {
                        const leagueColor = getLeagueBadge(event.league)
                        const statusColor = getWorkflowStatus(event.workflow_status)
                        return (
                          <tr
                            key={event.id}
                            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/events/${event.id}`)}
                          >
                            <td className="py-3 px-6 text-sm font-medium text-gray-900">{formatDate(event.event_date)}</td>
                            <td className="py-3 px-6 font-medium text-[#0A52EF] hover:text-[#0840C0]">{event.event_name}</td>
                            <td className="py-3 px-6">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${leagueColor.bg} ${leagueColor.text}`}>
                                {event.league}
                              </span>
                            </td>
                            <td className="py-3 px-6 text-sm text-gray-600">{formatTime(event.start_time)}</td>
                            <td className="py-3 px-6 text-sm text-gray-600">{event.assigned_techs || '-'}</td>
                            <td className="py-3 px-6">
                              <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}>
                                {event.workflow_status.replace(/_/g, ' ')}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Assigned Staff */}
            <div className="bg-white rounded shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Assigned Staff</h2>
              </div>
              {assignedStaff.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-gray-500">No staff assigned to events at this venue</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {assignedStaff.map((staff) => (
                    <div key={staff.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{staff.full_name}</p>
                          <p className="text-sm text-gray-600">{staff.role}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Slack Channel */}
            <div className="bg-white rounded shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Slack Channel</h3>
              <form onSubmit={handleSlackUpdate} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Channel ID</label>
                  <input
                    type="text"
                    value={slackChannelId}
                    onChange={(e) => setSlackChannelId(e.target.value)}
                    placeholder="e.g., C05XXXXXX"
                    className="w-full px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-[#0A52EF]/30"
                  />
                  <p className="text-xs text-gray-500 mt-2">Paste Slack channel ID to map this venue</p>
                </div>
                <button
                  type="submit"
                  disabled={savingSlack}
                  className="w-full px-4 py-2 bg-[#0A52EF] hover:bg-[#0840C0] disabled:bg-gray-400 transition-colors text-sm font-medium"
                >
                  {savingSlack ? 'Saving...' : 'Save'}
                </button>
              </form>
            </div>

            {/* Venue Info */}
            <div className="bg-white rounded shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Venue Info</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-600">Contact Name</p>
                  <p className="text-gray-900">{venue.primary_contact_name || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600">Contact Email</p>
                  <p className="text-gray-900 break-all">{venue.primary_contact_email || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">Service Responsibilities</p>
                  {venue.service_responsibilities && venue.service_responsibilities.length > 0 ? (
                    <ul className="space-y-1">
                      {venue.service_responsibilities.map((resp: string, idx: number) => (
                        <li key={idx} className="text-sm text-gray-700">
                          • {resp}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-600 text-sm">Not set</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
