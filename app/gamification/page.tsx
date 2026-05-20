'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

type Period = 'day' | 'week' | 'month' | 'all'

interface LeaderboardEntry {
  rank: number
  staff_id: string
  staff_name: string
  team: string
  points: number
}

interface TeamStanding {
  team: string
  total_points: number
  member_count: number
  avg_points: number
  top_performer: string
}

const TEAM_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  field_ops: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300' },
  design: { bg: 'bg-violet-50 dark:bg-violet-950/30', text: 'text-violet-700 dark:text-violet-400', badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300' },
  support: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300' },
  general: { bg: 'bg-gray-50 dark:bg-gray-950/30', text: 'text-gray-700 dark:text-gray-400', badge: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300' },
}

const TEAM_LABELS: Record<string, string> = {
  field_ops: 'Field Ops',
  design: 'Design',
  support: 'Support',
  general: 'General',
}

const RANK_ICONS = ['🥇', '🥈', '🥉']

export default function GamificationPage() {
  const [period, setPeriod] = useState<Period>('week')
  const [teamFilter, setTeamFilter] = useState<string>('')
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [teamStandings, setTeamStandings] = useState<TeamStanding[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)

  useEffect(() => {
    fetchData()
  }, [period, teamFilter])

  async function fetchData() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: 'leaderboard', period, limit: '15' })
      if (teamFilter) params.set('team', teamFilter)
      const [lbRes, tsRes] = await Promise.all([
        fetch(`/api/gamification?${params}`),
        fetch('/api/gamification?action=team-standings'),
      ])
      const lb = await lbRes.json()
      const ts = await tsRes.json()
      setLeaderboard(lb.data || [])
      setTeamStandings(ts.data || [])
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      const res = await fetch('/api/gamification/seed', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    }
    setSeeding(false)
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leaderboard</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Points, badges, and streaks across all teams</p>
          </div>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
          >
            {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
        </div>

        {/* Team Standings */}
        {teamStandings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {teamStandings.map((ts, i) => {
              const colors = TEAM_COLORS[ts.team] || TEAM_COLORS.general
              return (
                <div key={ts.team} className={`rounded-lg border p-4 ${colors.bg} border-gray-200 dark:border-gray-700`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-semibold ${colors.text}`}>
                      {i === 0 ? '👑 ' : ''}{TEAM_LABELS[ts.team] || ts.team}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{ts.member_count} members</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">{ts.total_points.toLocaleString()}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    avg {ts.avg_points}/person &middot; MVP: {ts.top_performer}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Period + Team Filters */}
        <div className="flex items-center gap-4">
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            {(['day', 'week', 'month', 'all'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {p === 'all' ? 'All Time' : p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setTeamFilter('')}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                !teamFilter
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
              }`}
            >
              All Teams
            </button>
            {Object.entries(TEAM_LABELS).filter(([k]) => k !== 'general').map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTeamFilter(key)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  teamFilter === key
                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                    : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Leaderboard Table */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : leaderboard.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No data yet. Click "Seed Demo Data" to populate the leaderboard.
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-16">Rank</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-28">Team</th>
                  <th className="text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3 w-28">Points</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map(entry => {
                  const colors = TEAM_COLORS[entry.team] || TEAM_COLORS.general
                  return (
                    <tr key={entry.staff_id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                        {entry.rank <= 3 ? RANK_ICONS[entry.rank - 1] : entry.rank}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/gamification/profile/${entry.staff_id}`} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">{entry.staff_name}</Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colors.badge}`}>
                          {TEAM_LABELS[entry.team] || entry.team}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-sm font-bold text-gray-900 dark:text-white">{entry.points.toLocaleString()}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
