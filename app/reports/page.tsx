'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface ReportData {
  period: string
  startDate: string
  endDate: string
  summary: {
    totalEvents: number
    coveredEvents: number
    coverageRate: number
    workflowCompletionRate: number
    totalLaborHours: number
    uniqueStaff: number
  }
  byMarket: Array<{ market: string; events: number; covered: number; hours: number }>
  byLeague: Array<{ league: string; events: number; hours: number }>
  topStaff: Array<{ full_name: string; role: string; events: number; hours: number; completed: number }>
  topVenues: Array<{ name: string; market: string; events: number; covered: number }>
}

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'week' | 'month'>('week')

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/reports?period=${period}`)
        if (res.ok) setData(await res.json())
      } catch (err) {
        console.error('Failed to fetch report:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchReport()
  }, [period])

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-3 gap-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28" />)}</div>
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    )
  }

  if (!data) return null

  const s = data.summary

  return (
    <DashboardLayout>
      <div className="space-y-8 print:space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start print:block">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Operations Report</h1>
            <p className="text-zinc-500 text-sm mt-1">{formatDate(data.startDate)} — {formatDate(data.endDate)}</p>
          </div>
          <div className="flex gap-2 print:hidden">
            <div className="bg-zinc-100 rounded p-1 flex gap-1">
              <button onClick={() => setPeriod('week')} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${period === 'week' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>Week</button>
              <button onClick={() => setPeriod('month')} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${period === 'month' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>Month</button>
            </div>
            <button onClick={() => window.print()} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors">
              Print Report
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Coverage Rate</p>
            <p className="text-4xl font-semibold text-zinc-900 mt-3">{s.coverageRate}<span className="text-lg text-zinc-400">%</span></p>
            <p className="text-xs text-zinc-500 mt-1">{s.coveredEvents} of {s.totalEvents} events staffed</p>
          </div>
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Workflow Completion</p>
            <p className="text-4xl font-semibold text-zinc-900 mt-3">{s.workflowCompletionRate}<span className="text-lg text-zinc-400">%</span></p>
            <p className="text-xs text-zinc-500 mt-1">Post-game reports submitted</p>
          </div>
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Labor Hours</p>
            <p className="text-4xl font-semibold text-zinc-900 mt-3">{s.totalLaborHours}</p>
            <p className="text-xs text-zinc-500 mt-1">{s.uniqueStaff} staff across {s.totalEvents} events</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* By Market */}
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8E8]">
              <h2 className="text-sm font-semibold text-zinc-900">Coverage by Market</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Market</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Events</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Covered</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.byMarket.map((m) => {
                  const rate = Number(m.events) > 0 ? Math.round((Number(m.covered) / Number(m.events)) * 100) : 0
                  return (
                    <tr key={m.market} className="border-b border-[#E8E8E8]">
                      <td className="py-2.5 px-6 font-medium text-zinc-900">{m.market}</td>
                      <td className="py-2.5 px-6 text-right text-zinc-600">{m.events}</td>
                      <td className="py-2.5 px-6 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${rate === 100 ? 'bg-emerald-50 text-emerald-700' : rate > 0 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                          {m.covered}/{m.events}
                        </span>
                      </td>
                      <td className="py-2.5 px-6 text-right text-zinc-600">{Number(m.hours)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* By League */}
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8E8]">
              <h2 className="text-sm font-semibold text-zinc-900">Events by League</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-2 px-6 text-xs font-medium text-zinc-500 uppercase">League</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Events</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.byLeague.map((l) => (
                  <tr key={l.league} className="border-b border-[#E8E8E8]">
                    <td className="py-2.5 px-6 font-medium text-zinc-900">{l.league}</td>
                    <td className="py-2.5 px-6 text-right text-zinc-600">{l.events}</td>
                    <td className="py-2.5 px-6 text-right text-zinc-600">{Number(l.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Staff */}
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8E8]">
              <h2 className="text-sm font-semibold text-zinc-900">Top Staff by Hours</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Name</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Events</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Hours</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Completed</th>
                </tr>
              </thead>
              <tbody>
                {data.topStaff.map((s) => (
                  <tr key={s.full_name} className="border-b border-[#E8E8E8]">
                    <td className="py-2.5 px-6 font-medium text-zinc-900">{s.full_name}</td>
                    <td className="py-2.5 px-6 text-right text-zinc-600">{s.events}</td>
                    <td className="py-2.5 px-6 text-right text-zinc-600">{Number(s.hours)}</td>
                    <td className="py-2.5 px-6 text-right">
                      <span className="text-xs font-medium text-emerald-700">{s.completed}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Venues */}
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E8E8E8]">
              <h2 className="text-sm font-semibold text-zinc-900">Top Venues by Events</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Venue</th>
                  <th className="text-left py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Market</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Events</th>
                  <th className="text-right py-2 px-6 text-xs font-medium text-zinc-500 uppercase">Covered</th>
                </tr>
              </thead>
              <tbody>
                {data.topVenues.map((v) => (
                  <tr key={v.name} className="border-b border-[#E8E8E8]">
                    <td className="py-2.5 px-6 font-medium text-zinc-900">{v.name}</td>
                    <td className="py-2.5 px-6 text-zinc-600 text-xs">{v.market}</td>
                    <td className="py-2.5 px-6 text-right text-zinc-600">{v.events}</td>
                    <td className="py-2.5 px-6 text-right">
                      <span className={`text-xs font-medium ${Number(v.covered) === Number(v.events) ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {v.covered}/{v.events}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
