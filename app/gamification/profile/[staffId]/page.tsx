'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import Link from 'next/link'

interface Badge {
  id: string
  display_name: string
  description: string
  icon: string
  tier: string
  category: string
}

interface Streak {
  type: string
  current: number
  best: number
}

interface Activity {
  action_type: string
  points: number
  earned_at: string
}

interface Profile {
  staff_id: string
  total_points: number
  rank: number
  badges: Badge[]
  streaks: Streak[]
  recent_activity: Activity[]
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'border-orange-400 bg-orange-50 dark:bg-orange-950/30',
  silver: 'border-gray-400 bg-gray-50 dark:bg-gray-800/30',
  gold: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30',
  platinum: 'border-purple-400 bg-purple-50 dark:bg-purple-950/30',
}

const ACTION_EMOJI: Record<string, string> = {
  WALKTHROUGH_COMPLETED: '🚶',
  TICKET_RESOLVED: '🎫',
  TICKET_SLA_MET: '⏱️',
  DESIGN_COMPLETED: '🎨',
  DESIGN_UNDER_BUDGET: '💰',
  CHECKIN_ON_TIME: '✅',
  GAME_READY: '🏟️',
  POST_GAME_REPORT: '📋',
  FULL_WORKFLOW: '🏆',
  CHECKLIST_ON_TIME: '📝',
  PARTS_ORDER_FULFILLED: '📦',
  RMA_CLOSED: '🔄',
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function ProfilePage() {
  const params = useParams()
  const staffId = params.staffId as string
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/gamification/profile?staffId=${staffId}`)
      .then(r => r.json())
      .then(setProfile)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [staffId])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </DashboardLayout>
    )
  }

  if (!profile) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-gray-500">Profile not found</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/gamification" className="text-blue-600 hover:underline text-sm">&larr; Leaderboard</Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6 text-center">
            <div className="text-3xl font-bold text-blue-600">{profile.total_points.toLocaleString()}</div>
            <div className="text-sm text-gray-500 mt-1">Total Points</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6 text-center">
            <div className="text-3xl font-bold text-amber-600">#{profile.rank}</div>
            <div className="text-sm text-gray-500 mt-1">Weekly Rank</div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6 text-center">
            <div className="text-3xl font-bold text-emerald-600">{profile.badges.length}</div>
            <div className="text-sm text-gray-500 mt-1">Badges Earned</div>
          </div>
        </div>

        {/* Streaks */}
        {profile.streaks.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
            <h3 className="font-semibold mb-4">🔥 Active Streaks</h3>
            <div className="grid grid-cols-2 gap-3">
              {profile.streaks.map(s => (
                <div key={s.type} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
                  <div>
                    <div className="font-medium capitalize">{s.type.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-500">Best: {s.best} days</div>
                  </div>
                  <div className="text-2xl font-bold text-orange-500">
                    {s.current}
                    <span className="text-sm font-normal text-gray-400 ml-1">days</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        {profile.badges.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
            <h3 className="font-semibold mb-4">🏅 Badges</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {profile.badges.map(b => (
                <div key={b.id} className={`rounded-lg border-2 p-3 text-center ${TIER_COLORS[b.tier] || ''}`}>
                  <div className="text-2xl">{b.icon}</div>
                  <div className="font-medium text-sm mt-1">{b.display_name}</div>
                  <div className="text-xs text-gray-500 capitalize">{b.tier}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Activity */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-6">
          <h3 className="font-semibold mb-4">📊 Recent Activity</h3>
          <div className="space-y-2">
            {profile.recent_activity.map((a, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{ACTION_EMOJI[a.action_type] || '⚡'}</span>
                  <span className="text-sm capitalize">{a.action_type.replace(/_/g, ' ').toLowerCase()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-blue-600">+{a.points}</span>
                  <span className="text-xs text-gray-400">{timeAgo(a.earned_at)}</span>
                </div>
              </div>
            ))}
            {profile.recent_activity.length === 0 && (
              <div className="text-center text-gray-400 py-4">No activity yet</div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
