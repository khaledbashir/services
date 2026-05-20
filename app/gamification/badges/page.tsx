'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Badge {
  id: string
  name: string
  display_name: string
  description: string
  icon: string
  tier: string
  category: string
  earned_count: string
}

const TIER_COLORS: Record<string, string> = {
  bronze: 'border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800',
  silver: 'border-gray-300 bg-gray-50 dark:bg-gray-800/30 dark:border-gray-600',
  gold: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 dark:border-yellow-700',
  platinum: 'border-purple-400 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-700',
}

const TIER_LABELS: Record<string, string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  platinum: 'Platinum',
}

const CATEGORY_LABELS: Record<string, string> = {
  streak: 'Streak',
  volume: 'Volume',
  points: 'Points',
  specialist: 'Specialist',
  consistency: 'Consistency',
}

export default function BadgesPage() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    fetch('/api/gamification?action=badges')
      .then(r => r.json())
      .then(d => { setBadges(d.data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const categories = [...new Set(badges.map(b => b.category))]
  const filtered = filter ? badges.filter(b => b.category === filter) : badges

  const grouped: Record<string, Badge[]> = {}
  for (const b of filtered) {
    if (!grouped[b.category]) grouped[b.category] = []
    grouped[b.category].push(b)
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Badge Gallery</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{badges.length} badges across {categories.length} categories</p>
        </div>

        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 w-fit">
          <button
            onClick={() => setFilter('')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
              !filter ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400'
            }`}
          >
            All
          </button>
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === c ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-400'
              }`}
            >
              {CATEGORY_LABELS[c] || c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center p-8 text-gray-400">Loading badges...</div>
        ) : (
          Object.entries(grouped).map(([category, catBadges]) => (
            <div key={category}>
              <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {CATEGORY_LABELS[category] || category}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {catBadges.map(badge => (
                  <div
                    key={badge.id}
                    className={`rounded-lg border-2 p-4 text-center transition-transform hover:scale-105 ${TIER_COLORS[badge.tier] || TIER_COLORS.bronze}`}
                  >
                    <div className="text-3xl mb-2">{badge.icon}</div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-white">{badge.display_name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{badge.description}</div>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400">
                        {TIER_LABELS[badge.tier]}
                      </span>
                      {parseInt(badge.earned_count) > 0 && (
                        <span className="text-[10px] font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 px-1.5 py-0.5 rounded">
                          {badge.earned_count} earned
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </DashboardLayout>
  )
}
