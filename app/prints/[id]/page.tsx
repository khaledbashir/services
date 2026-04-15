'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface PrintRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  client_name: string | null
  job_title: string
  notes: string | null
  shipping_info: string | null
  ship_date: string | null
  arrival_date: string | null
  britten_cost: number | null
  anc_cost: number | null
  tracking_number: string | null
  assignee_id: string | null
  assignee_name: string | null
  status: string
  created_at: string
  updated_at: string
}

interface Staff { id: string; full_name: string }

const statusOptions = [
  { value: 'new_request', label: 'New Request' },
  { value: 'awaiting_layout', label: 'Awaiting Layout' },
  { value: 'awaiting_approval', label: 'Awaiting Approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'in_production', label: 'In Production' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'invoiced', label: 'Invoiced' },
]

export default function PrintRequestDetailPage({ params }: { params: { id: string } }) {
  const [printRequest, setPrintRequest] = useState<PrintRequestDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [shippingDraft, setShippingDraft] = useState('')
  const [trackingDraft, setTrackingDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [prRes, staffRes] = await Promise.all([
        fetch(`/api/print-requests/${params.id}`),
        fetch('/api/staff'),
      ])
      if (!prRes.ok) {
        setLoading(false)
        return
      }
      const prData = await prRes.json()
      const staffData = await staffRes.json()
      setPrintRequest(prData.print_request)
      setStaffList(staffData.staff || [])
      setNotesDraft(prData.print_request?.notes || '')
      setShippingDraft(prData.print_request?.shipping_info || '')
      setTrackingDraft(prData.print_request?.tracking_number || '')
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
      const res = await fetch(`/api/print-requests/${params.id}`, {
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

  const saveShipping = async (e: FormEvent) => {
    e.preventDefault()
    await updateField({
      shipping_info: shippingDraft,
      tracking_number: trackingDraft,
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

  if (!printRequest) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">
          Print request not found
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        <div className="space-y-4">
          <button
            onClick={() => router.push('/prints')}
            className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Print Requests
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{printRequest.job_title}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                <span>{printRequest.client_name || 'No client'}</span>
                {printRequest.venue_name && (
                  <>
                    <span>&middot;</span>
                    {printRequest.venue_id ? (
                      <Link href={`/venues/${printRequest.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium">
                        {printRequest.venue_name}
                      </Link>
                    ) : (
                      <span>{printRequest.venue_name}</span>
                    )}
                  </>
                )}
              </div>
            </div>
            <select
              value={printRequest.status}
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

            <form onSubmit={saveShipping} className="border border-zinc-200 bg-white p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Shipping</h2>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Shipping'}
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Shipping Info</label>
                <textarea
                  value={shippingDraft}
                  onChange={(e) => setShippingDraft(e.target.value)}
                  rows={5}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Tracking Number</label>
                <input
                  type="text"
                  value={trackingDraft}
                  onChange={(e) => setTrackingDraft(e.target.value)}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                />
              </div>
            </form>
          </div>

          <div className="space-y-6">
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assignment</h2>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Assignee</label>
                <select
                  value={printRequest.assignee_id || ''}
                  onChange={(e) => updateField({ assignee_id: e.target.value || null })}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                >
                  <option value="">Unassigned</option>
                  {staffList.map((person) => (
                    <option key={person.id} value={person.id}>{person.full_name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Request Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Britten Cost</span>
                  <span className="text-zinc-900">{printRequest.britten_cost ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">ANC Cost</span>
                  <span className="text-zinc-900">{printRequest.anc_cost ?? '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Ship Date</span>
                  <span className="text-zinc-900">{printRequest.ship_date || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Arrival Date</span>
                  <span className="text-zinc-900">{printRequest.arrival_date || '—'}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Tracking Number</span>
                  <span className="text-zinc-900 text-right">{printRequest.tracking_number || '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
