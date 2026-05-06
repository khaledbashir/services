'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface CgDesignRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  league: string | null
  team_name: string | null
  job_title: string
  notes: string | null
  designer_id: string | null
  designer_name: string | null
  due_date: string | null
  status: string
  created_at: string
  updated_at: string
}

interface Staff { id: string; full_name: string }

const statusOptions = [
  { value: 'request_submitted', label: 'Request Submitted' },
  { value: 'in_queue', label: 'In Queue' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'revisions', label: 'Revisions' },
  { value: 'approved', label: 'Approved' },
  { value: 'posted', label: 'Posted' },
]

export default function CgDesignDetailPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<CgDesignRequestDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [finals, setFinals] = useState<{ final_location: string | null; proof_url: string | null }>({ final_location: null, proof_url: null })
  const [finalsDraft, setFinalsDraft] = useState({ final_location: '', proof_url: '' })
  const [savingFinals, setSavingFinals] = useState(false)
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [res, staffRes, finalsRes] = await Promise.all([
        fetch(`/api/cg-designs/${params.id}`),
        fetch('/api/staff'),
        fetch(`/api/cg-designs/${params.id}/finals`),
      ])
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = await res.json()
      const staffData = await staffRes.json()
      setItem(data.cg_design_request)
      setStaffList(staffData.staff || [])
      setNotesDraft(data.cg_design_request?.notes || '')
      if (finalsRes.ok) {
        const fd = await finalsRes.json()
        const fl = fd.finals?.final_location || null
        const pu = fd.finals?.proof_url || null
        setFinals({ final_location: fl, proof_url: pu })
        setFinalsDraft({ final_location: fl || '', proof_url: pu || '' })
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveFinals = async (e: FormEvent) => {
    e.preventDefault()
    setSavingFinals(true)
    try {
      const res = await fetch(`/api/cg-designs/${params.id}/finals`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalsDraft),
      })
      if (res.ok) {
        setFinals({
          final_location: finalsDraft.final_location.trim() || null,
          proof_url: finalsDraft.proof_url.trim() || null,
        })
      }
    } catch (err) { console.error(err) }
    finally { setSavingFinals(false) }
  }

  useEffect(() => {
    fetchData()
  }, [params.id])

  const updateField = async (payload: Record<string, any>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/cg-designs/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const saveNotes = async (e: FormEvent) => {
    e.preventDefault()
    await updateField({ notes: notesDraft })
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto space-y-6 py-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-80 col-span-2 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!item) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">CG design request not found</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        <div className="space-y-4">
          <button onClick={() => router.push('/cg-designs')} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            CG Design Requests
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{item.job_title}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                <span>{item.team_name || 'No team'}</span>
                <span>&middot;</span>
                <span>{item.league || 'No league'}</span>
                {item.venue_name && (
                  <>
                    <span>&middot;</span>
                    {item.venue_id ? <Link href={`/venues/${item.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium">{item.venue_name}</Link> : <span>{item.venue_name}</span>}
                  </>
                )}
              </div>
            </div>
            <select value={item.status} onChange={(e) => updateField({ status: e.target.value })} className="border border-zinc-300 px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-zinc-400">
              {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-8">
          <div className="space-y-6">
            <form onSubmit={saveNotes} className="border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={12} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" />
            </form>

            {/* Final Location + Proofs (Alexis 5/6 — CG field parity).
                Posting here is OUR record — workspace.anc.com is a separate
                FTP-backed system that we don't auto-push to. Use the
                /proof/<token> share link from the dashboard for client
                review going forward. */}
            <form onSubmit={saveFinals} className="border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-900">Final Location & Proofs</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Where the final piece landed + the proof share URL clients see.</p>
                </div>
                <button type="submit" disabled={savingFinals} className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                  {savingFinals ? 'Saving...' : 'Save'}
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Final Location</label>
                  <input
                    type="text"
                    value={finalsDraft.final_location}
                    onChange={(e) => setFinalsDraft(prev => ({ ...prev, final_location: e.target.value }))}
                    placeholder="Server path, drive folder, or URL where the final lives"
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Proof Share URL</label>
                  <input
                    type="text"
                    value={finalsDraft.proof_url}
                    onChange={(e) => setFinalsDraft(prev => ({ ...prev, proof_url: e.target.value }))}
                    placeholder="https://services.ancsports.net/proof/<token>"
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white font-mono text-[12px]"
                  />
                </div>
              </div>
              {(finals.final_location || finals.proof_url) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {finals.final_location && (
                    <span className="inline-flex items-center gap-1 bg-zinc-100 text-zinc-700 px-2 py-1 rounded ring-1 ring-zinc-200">
                      📁 <span className="truncate max-w-[200px]">{finals.final_location}</span>
                    </span>
                  )}
                  {finals.proof_url && (
                    <a href={finals.proof_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 bg-[#0A52EF]/10 text-[#0A52EF] px-2 py-1 rounded ring-1 ring-[#0A52EF]/20 hover:bg-[#0A52EF]/20">
                      🔗 Open proof
                    </a>
                  )}
                </div>
              )}
            </form>
          </div>

          <div className="space-y-6">
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assignment</h2>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Designer</label>
                <select value={item.designer_id || ''} onChange={(e) => updateField({ designer_id: e.target.value || null })} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                  <option value="">Unassigned</option>
                  {staffList.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                </select>
              </div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Request Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Due Date</span><span className="text-zinc-900">{item.due_date || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Team</span><span className="text-zinc-900 text-right">{item.team_name || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">League</span><span className="text-zinc-900">{item.league || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
