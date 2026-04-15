'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface DesignRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  company_name: string | null
  job_title: string
  tricode: string | null
  ftp_proof_link: string | null
  ftp_final_link: string | null
  final_file_name: string | null
  final_duration: string | null
  notes: string | null
  boards_requested: string | null
  sizes_requested: string | null
  designer_id: string | null
  designer_name: string | null
  enterprise_contact_id: string | null
  enterprise_contact_name: string | null
  status: string
  hours_estimated: number | null
  hours_spent: number | null
  due_date: string | null
  created_at: string
  updated_at: string
}

interface Staff { id: string; full_name: string }

const statusOptions = [
  { value: 'request_submitted', label: 'Request Submitted' },
  { value: 'in_queue', label: 'In Queue' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_qc', label: 'In QC' },
  { value: 'client_review', label: 'Client Review' },
  { value: 'approved', label: 'Approved' },
  { value: 'done', label: 'Done' },
]

export default function DesignRequestDetailPage({ params }: { params: { id: string } }) {
  const [designRequest, setDesignRequest] = useState<DesignRequestDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [proofLinkDraft, setProofLinkDraft] = useState('')
  const [finalLinkDraft, setFinalLinkDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [drRes, staffRes] = await Promise.all([
        fetch(`/api/design-requests/${params.id}`),
        fetch('/api/staff'),
      ])
      if (!drRes.ok) {
        setLoading(false)
        return
      }
      const drData = await drRes.json()
      const staffData = await staffRes.json()
      setDesignRequest(drData.design_request)
      setStaffList(staffData.staff || [])
      setNotesDraft(drData.design_request?.notes || '')
      setProofLinkDraft(drData.design_request?.ftp_proof_link || '')
      setFinalLinkDraft(drData.design_request?.ftp_final_link || '')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [params.id])

  const updateField = async (payload: Record<string, any>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/design-requests/${params.id}`, {
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

  const saveProofLinks = async (e: FormEvent) => {
    e.preventDefault()
    await updateField({
      ftp_proof_link: proofLinkDraft,
      ftp_final_link: finalLinkDraft,
    })
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

  if (!designRequest) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">
          Design request not found
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        <div className="space-y-4">
          <button
            onClick={() => router.push('/designs')}
            className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Design Requests
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{designRequest.job_title}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                <span>{designRequest.company_name || 'No company'}</span>
                <span>&middot;</span>
                <span>{designRequest.tricode || 'No tri-code'}</span>
                {designRequest.venue_name && (
                  <>
                    <span>&middot;</span>
                    {designRequest.venue_id ? (
                      <Link href={`/venues/${designRequest.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                        {designRequest.venue_name}
                      </Link>
                    ) : (
                      <span>{designRequest.venue_name}</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <select
              value={designRequest.status}
              onChange={(e) => updateField({ status: e.target.value })}
              className="border border-zinc-300 px-3 py-2 text-sm bg-white outline-none focus:ring-1 focus:ring-zinc-400"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr,1fr] gap-8">
          <div className="space-y-6">
            <form onSubmit={saveNotes} className="border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={12}
                className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white"
              />
            </form>

            <form onSubmit={saveProofLinks} className="border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Proof Links</h2>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Links'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">FTP Proof Link</label>
                <input
                  type="text"
                  value={proofLinkDraft}
                  onChange={(e) => setProofLinkDraft(e.target.value)}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">FTP Final Link</label>
                <input
                  type="text"
                  value={finalLinkDraft}
                  onChange={(e) => setFinalLinkDraft(e.target.value)}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                />
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assignment</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Designer</label>
                  <select
                    value={designRequest.designer_id || ''}
                    onChange={(e) => updateField({ designer_id: e.target.value || null })}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Enterprise Contact</label>
                  <select
                    value={designRequest.enterprise_contact_id || ''}
                    onChange={(e) => updateField({ enterprise_contact_id: e.target.value || null })}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staffList.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Request Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Boards</span>
                  <span className="text-zinc-900 text-right">{designRequest.boards_requested || 'None'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Sizes</span>
                  <span className="text-zinc-900 text-right">{designRequest.sizes_requested || 'None'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Hours Estimated</span>
                  <span className="text-zinc-900">{designRequest.hours_estimated ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Hours Spent</span>
                  <span className="text-zinc-900">{designRequest.hours_spent ?? 0}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Due Date</span>
                  <span className="text-zinc-900">{designRequest.due_date || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Final File</span>
                  <span className="text-zinc-900 text-right">{designRequest.final_file_name || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Final Duration</span>
                  <span className="text-zinc-900">{designRequest.final_duration || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
