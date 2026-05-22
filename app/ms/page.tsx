'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Team {
  id: string
  name: string
  league?: string
  address?: { addressCity?: string; addressState?: string }
}

export default function MSLandingPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/twenty/ms/teams')
        if (res.ok) {
          const data = await res.json()
          setTeams(data.teams || [])
        }
      } catch (err) {
        console.error('Failed to load teams:', err)
      }
      setLoading(false)
    })()
  }, [])

  const mlbTeams = teams.filter((t) => t.league === 'MLB').sort((a, b) => a.name.localeCompare(b.name))
  const nbaTeams = teams.filter((t) => t.league === 'NBA').sort((a, b) => a.name.localeCompare(b.name))
  const nhlTeams = teams.filter((t) => t.league === 'NHL').sort((a, b) => a.name.localeCompare(b.name))
  const otherTeams = teams.filter((t) => !['MLB', 'NBA', 'NHL'].includes(t.league || '')).sort((a, b) => a.name.localeCompare(b.name))

  const renderLeague = (label: string, leagueTeams: Team[]) => {
    if (leagueTeams.length === 0) return null
    return (
      <div key={label}>
        <h2 className="text-lg font-semibold text-zinc-800 mb-3">{label}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {leagueTeams.map((t) => (
            <Link
              key={t.id}
              href={`/ms/${t.id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm transition-all"
            >
              <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600">
                {t.name.split(' ').pop()?.[0] || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-900 truncate">{t.name.replace(/ \|.*$/, '').replace(/ \/.*$/, '')}</div>
                {t.address?.addressCity && (
                  <div className="text-xs text-zinc-400">{t.address.addressCity}, {t.address.addressState}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Media & Sponsorship</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Select a team to view their game schedule, sponsor contracts, and Nielsen verification status.
          </p>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-400 py-8 text-center">Loading teams…</div>
        ) : teams.length === 0 ? (
          <div className="text-sm text-zinc-400 py-8 text-center">No teams found with league data.</div>
        ) : (
          <div className="space-y-8">
            {renderLeague('MLB', mlbTeams)}
            {renderLeague('NBA', nbaTeams)}
            {renderLeague('NHL', nhlTeams)}
            {otherTeams.length > 0 && renderLeague('Other', otherTeams)}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
