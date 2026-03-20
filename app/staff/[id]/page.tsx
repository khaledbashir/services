'use client'

import { useEffect, useState, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

interface StaffDetail {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  title: string | null
  city: string | null
  profile_image: string | null
  is_active: boolean
  created_at: string
}

interface UpcomingEvent {
  id: string
  summary: string
  league: string
  event_date: string
  start_time: string
  venue_name: string
  market_name: string
  workflow_status: string
  estimated_hours: number
}

interface StaffStats {
  weekHours: number
  weekEvents: number
  monthHours: number
  monthEvents: number
  totalEvents: number
  totalHours: number
  completionRate: number
  workflow: { completed: number; checked_in: number; game_ready: number; pending: number }
}

interface Market { market: string; event_count: number }
interface Venue { id: string; name: string; event_count: number }
interface Activity { type: string; submitted_at: string; event_name: string; venue_name: string }

const leagueColors: Record<string, { bg: string; text: string }> = {
  NBA: { bg: 'bg-orange-50', text: 'text-orange-600' },
  NHL: { bg: 'bg-blue-50', text: 'text-blue-600' },
  NCAAM: { bg: 'bg-violet-50', text: 'text-violet-600' },
  NCAAW: { bg: 'bg-pink-50', text: 'text-pink-600' },
  MLB: { bg: 'bg-red-50', text: 'text-red-600' },
  AHL: { bg: 'bg-teal-50', text: 'text-teal-600' },
  'NBA G League': { bg: 'bg-orange-50', text: 'text-orange-500' },
  MiLB: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
}

const workflowLabels: Record<string, string> = {
  pending: 'Pending',
  checked_in: 'Checked In',
  game_ready: 'Game Ready',
  post_game_submitted: 'Complete',
}

const workflowDots: Record<string, string> = {
  pending: 'bg-zinc-300',
  checked_in: 'bg-amber-500',
  game_ready: 'bg-emerald-500',
  post_game_submitted: 'bg-blue-500',
}

const activityLabels: Record<string, string> = {
  check_in: 'Checked in',
  game_ready: 'Marked game ready',
  post_game_report: 'Submitted post-game report',
}

export default function StaffDetailPage({ params }: { params: { id: string } }) {
  const [staff, setStaff] = useState<StaffDetail | null>(null)
  const [events, setEvents] = useState<UpcomingEvent[]>([])
  const [stats, setStats] = useState<StaffStats | null>(null)
  const [markets, setMarkets] = useState<Market[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editData, setEditData] = useState({ full_name: '', email: '', phone: '', role: '', title: '', city: '', password: '' })
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const { showToast } = useToast()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/staff/${params.id}/stats`)
        if (res.ok) {
          const data = await res.json()
          setStaff(data.staff)
          setEvents(data.upcomingEvents || [])
          setStats(data.stats)
          setMarkets(data.markets || [])
          setVenues(data.venues || [])
          setRecentActivity(data.recentActivity || [])
        }
      } catch (err) {
        console.error('Failed to fetch staff:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [params.id])

  const handleImageUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !staff) return

    setUploadingImage(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      try {
        const res = await fetch(`/api/staff/${params.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_image: base64 }),
        })
        if (res.ok) {
          setStaff({ ...staff, profile_image: base64 })
          showToast('Photo updated', 'success')
        }
      } catch {}
      setUploadingImage(false)
    }
    reader.readAsDataURL(file)
  }

  const openEdit = () => {
    if (!staff) return
    setEditData({
      full_name: staff.full_name, email: staff.email, phone: staff.phone || '',
      role: staff.role, title: staff.title || '', city: staff.city || '', password: ''
    })
    setShowEdit(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const payload: any = { ...editData }
      if (!payload.password) delete payload.password
      const res = await fetch(`/api/staff/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        showToast('Staff member updated', 'success')
        setShowEdit(false)
        // Refresh
        const r = await fetch(`/api/staff/${params.id}/stats`)
        if (r.ok) { const d = await r.json(); setStaff(d.staff) }
      } else {
        showToast('Failed to update', 'error')
      }
    } catch { showToast('Error updating', 'error') }
    finally { setSaving(false) }
  }

  const deleteStaff = async () => {
    if (!confirm(`Deactivate ${staff?.full_name}? They will no longer be able to log in.`)) return
    try {
      const res = await fetch(`/api/staff/${params.id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Staff member deactivated', 'success')
        router.push('/staff')
      }
    } catch { showToast('Error', 'error') }
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatRelativeTime = (d: string) => {
    const date = new Date(d)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ')
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase()
  }

  const getAvatarColor = (id: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500', 'bg-pink-500']
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!staff) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded border border-[#E8E8E8] p-12 text-center">
          <p className="text-zinc-500">Staff member not found</p>
        </div>
      </DashboardLayout>
    )
  }

  const roleColors: Record<string, { bg: string; text: string }> = {
    admin: { bg: 'bg-blue-50', text: 'text-[#0A52EF]' },
    manager: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
    technician: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  }
  const rc = roleColors[staff.role] || roleColors.technician

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back button */}
        <div className="flex justify-between items-center">
          <button onClick={() => router.push('/staff')} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← Back to Staff</button>
          <div className="flex gap-2">
            <button onClick={openEdit} className="px-3 py-1.5 text-xs font-medium bg-white border border-[#E8E8E8] rounded hover:border-zinc-300 text-zinc-700 transition-colors">Edit</button>
            <button onClick={deleteStaff} className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded hover:bg-red-50 text-red-600 transition-colors">Deactivate</button>
          </div>
        </div>

        {/* Edit Form */}
        {showEdit && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Edit Staff Member</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Full Name</label>
                <input type="text" value={editData.full_name} onChange={e => setEditData({ ...editData, full_name: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Email</label>
                <input type="email" value={editData.email} onChange={e => setEditData({ ...editData, email: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Phone</label>
                <input type="tel" value={editData.phone} onChange={e => setEditData({ ...editData, phone: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Role</label>
                <select value={editData.role} onChange={e => setEditData({ ...editData, role: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                  <option value="technician">Technician</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Title</label>
                <input type="text" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" placeholder="e.g., Senior Field Technician" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">City</label>
                <input type="text" value={editData.city} onChange={e => setEditData({ ...editData, city: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">Reset Password <span className="text-zinc-400">(leave blank to keep current)</span></label>
                <input type="password" value={editData.password} onChange={e => setEditData({ ...editData, password: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" placeholder="New password..." />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={saveEdit} disabled={saving}
                className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setShowEdit(false)} className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900">Cancel</button>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-8">
          <div className="flex items-start gap-6">
            {/* Avatar */}
            <div className="relative group flex-shrink-0">
              {staff.profile_image ? (
                <img src={staff.profile_image} alt={staff.full_name} className="w-24 h-24 rounded-full object-cover" />
              ) : (
                <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-semibold ${getAvatarColor(staff.id)}`}>
                  {getInitials(staff.full_name)}
                </div>
              )}
              <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-zinc-900">{staff.full_name}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${rc.bg} ${rc.text}`}>{staff.role}</span>
                <div className={`flex items-center gap-1.5 ${staff.is_active ? 'text-emerald-600' : 'text-zinc-400'}`}>
                  <div className={`w-2 h-2 rounded-full ${staff.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                  <span className="text-xs">{staff.is_active ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              {staff.title && <p className="text-zinc-500 mt-1">{staff.title}</p>}
              <div className="flex gap-6 mt-3 text-sm text-zinc-600">
                {staff.email && (
                  <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {staff.email}
                  </div>
                )}
                {staff.phone && (
                  <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {staff.phone}
                  </div>
                )}
                {staff.city && (
                  <div className="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {staff.city}
                  </div>
                )}
              </div>
            </div>

            {/* Completion Rate Circle */}
            {stats && (
              <div className="flex flex-col items-center flex-shrink-0">
                <svg viewBox="0 0 100 100" className="w-20 h-20">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e4e4e7" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={stats.completionRate >= 80 ? '#10b981' : stats.completionRate >= 50 ? '#f59e0b' : '#f43f5e'}
                    strokeWidth="8"
                    strokeDasharray={`${(stats.completionRate / 100) * 264} 264`}
                    strokeLinecap="round"
                    transform="rotate(-90 50 50)"
                  />
                  <text x="50" y="50" textAnchor="middle" dy="0.35em" className="text-lg font-semibold fill-zinc-900">
                    {stats.completionRate}%
                  </text>
                </svg>
                <p className="text-xs text-zinc-500 mt-1">Completion Rate</p>
              </div>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">This Week</p>
              <p className="text-2xl font-semibold text-zinc-900 mt-2">{stats.weekHours}<span className="text-sm text-zinc-400 ml-1">hrs</span></p>
              <p className="text-xs text-zinc-500 mt-1">{stats.weekEvents} events</p>
            </div>
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">This Month</p>
              <p className="text-2xl font-semibold text-zinc-900 mt-2">{stats.monthHours}<span className="text-sm text-zinc-400 ml-1">hrs</span></p>
              <p className="text-xs text-zinc-500 mt-1">{stats.monthEvents} events</p>
            </div>
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">All Time</p>
              <p className="text-2xl font-semibold text-zinc-900 mt-2">{stats.totalEvents}<span className="text-sm text-zinc-400 ml-1">events</span></p>
              <p className="text-xs text-zinc-500 mt-1">{stats.totalHours} total hours</p>
            </div>
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workflow</p>
              <div className="flex gap-3 mt-2">
                <div className="text-center">
                  <p className="text-lg font-semibold text-emerald-600">{stats.workflow.completed}</p>
                  <p className="text-xs text-zinc-500">Done</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-amber-500">{stats.workflow.checked_in + stats.workflow.game_ready}</p>
                  <p className="text-xs text-zinc-500">In Progress</p>
                </div>
                <div className="text-center">
                  <p className="text-lg font-semibold text-zinc-400">{stats.workflow.pending}</p>
                  <p className="text-xs text-zinc-500">Pending</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main: Upcoming Events */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E8E8]">
                <h2 className="text-lg font-semibold text-zinc-900">Upcoming Events</h2>
              </div>
              {events.length === 0 ? (
                <div className="p-12 text-center">
                  <p className="text-zinc-500 text-sm">No upcoming events assigned</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Date</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Event</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Venue</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">League</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Hours</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => {
                        const lc = leagueColors[event.league] || { bg: 'bg-zinc-100', text: 'text-zinc-500' }
                        const dot = workflowDots[event.workflow_status] || 'bg-zinc-300'
                        return (
                          <tr
                            key={event.id}
                            className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/events/${event.id}`)}
                          >
                            <td className="py-3 px-6 text-zinc-600 text-xs whitespace-nowrap">{formatDate(event.event_date)}</td>
                            <td className="py-3 px-6 font-medium text-zinc-900">{event.summary}</td>
                            <td className="py-3 px-6 text-zinc-600 text-xs">{event.venue_name}</td>
                            <td className="py-3 px-6">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${lc.bg} ${lc.text}`}>{event.league}</span>
                            </td>
                            <td className="py-3 px-6 text-zinc-600 text-xs">{Number(event.estimated_hours) || '-'}</td>
                            <td className="py-3 px-6">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-2 h-2 rounded-full ${dot}`}></div>
                                <span className="text-xs text-zinc-600">{workflowLabels[event.workflow_status] || event.workflow_status}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Markets */}
            {markets.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3">Markets</h3>
                <div className="space-y-2">
                  {markets.map((m) => (
                    <div key={m.market} className="flex justify-between items-center text-sm">
                      <span className="text-zinc-700">{m.market}</span>
                      <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">{m.event_count} events</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Venues */}
            {venues.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3">Top Venues</h3>
                <div className="space-y-2">
                  {venues.map((v) => (
                    <div
                      key={v.id}
                      className="flex justify-between items-center text-sm cursor-pointer hover:text-[#0A52EF] transition-colors"
                      onClick={() => router.push(`/venues/${v.id}`)}
                    >
                      <span className="text-zinc-700">{v.name}</span>
                      <span className="text-xs text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">{v.event_count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Activity */}
            {recentActivity.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3">Recent Activity</h3>
                <div className="space-y-3">
                  {recentActivity.map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#0A52EF] mt-1.5 flex-shrink-0"></div>
                      <div>
                        <p className="text-zinc-900 font-medium">{activityLabels[a.type] || a.type}</p>
                        <p className="text-zinc-500">{a.event_name} @ {a.venue_name}</p>
                        <p className="text-zinc-400">{formatRelativeTime(a.submitted_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
