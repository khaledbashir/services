'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface FeedItem {
  staff_name: string
  team: string
  action_type: string
  points: number
  earned_at: string
}

const ACTION_LABELS: Record<string, { label: string; emoji: string }> = {
  WALKTHROUGH_COMPLETED: { label: 'Walkthrough', emoji: '🚶' },
  TICKET_RESOLVED: { label: 'Ticket Resolved', emoji: '🎫' },
  TICKET_SLA_MET: { label: 'SLA Met', emoji: '⏱️' },
  DESIGN_COMPLETED: { label: 'Design Done', emoji: '🎨' },
  DESIGN_UNDER_BUDGET: { label: 'Under Budget', emoji: '💰' },
  CHECKIN_ON_TIME: { label: 'Check-in', emoji: '✅' },
  GAME_READY: { label: 'Game Ready', emoji: '🏟️' },
  POST_GAME_REPORT: { label: 'Post-Game', emoji: '📋' },
  FULL_WORKFLOW: { label: 'Full Workflow', emoji: '🌟' },
  CHECKLIST_ON_TIME: { label: 'Checklist Done', emoji: '✔️' },
  PARTS_ORDER_FULFILLED: { label: 'Parts Order', emoji: '📦' },
  RMA_CLOSED: { label: 'RMA Closed', emoji: '🔧' },
}

const TEAM_BADGES: Record<string, string> = {
  field_ops: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300',
  design: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300',
  support: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
}

const TEAM_LABELS: Record<string, string> = {
  field_ops: 'Field Ops',
  design: 'Design',
  support: 'Support',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function FeedPage() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/gamification?action=feed&limit=50')
      .then(r => r.json())
      .then(d => { setFeed(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Feed</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Real-time achievements across all teams</p>
        </div>

        {loading ? (
          <div className="text-center p-8 text-gray-400">Loading feed...</div>
        ) : feed.length === 0 ? (
          <div className="text-center p-8 text-gray-400">No activity yet.</div>
        ) : (
          <div className="space-y-1">
            {feed.map((item, i) => {
              const action = ACTION_LABELS[item.action_type] || { label: item.action_type, emoji: '🎯' }
              const teamBadge = TEAM_BADGES[item.team] || 'bg-gray-100 text-gray-800'
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors"
                >
                  <span className="text-lg flex-shrink-0">{action.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900 dark:text-white">
                      <span className="font-medium">{item.staff_name}</span>
                      {' '}
                      <span className="text-gray-500 dark:text-gray-400">{action.label}</span>
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${teamBadge}`}>
                    {TEAM_LABELS[item.team] || item.team}
                  </span>
                  <span className="text-xs font-semibold text-gray-900 dark:text-white w-12 text-right">+{item.points}</span>
                  <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">{timeAgo(item.earned_at)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
