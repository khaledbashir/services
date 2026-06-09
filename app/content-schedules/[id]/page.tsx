'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface ContentScheduleDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  company_name: string | null
  content_name: string
  launch_date: string | null
  end_date: string | null
  operator_id: string | null
  operator_name: string | null
  files_ready: boolean
  file_location: string | null
  status: string
  notes: string | null
  created_at: string
  updated_at: string
}

interface Staff { id: string; full_name: string }

const statusOptions = [
  { value: 'ready', label: 'Ready' },
  { value: 'in_queue', label: 'In Queue' },
  { value: 'scheduled_to_launch', label: 'Scheduled To Launch' },
  { value: 'content_live', label: 'Content Live' },
  { value: 'confirmed_live', label: 'Confirmed Live with Client' },
  { value: 'content_removed', label: 'Content Removed' },
  { value: 'done', label: 'Done' },
]

function toDateInputValue(value: unknown) {
  if (!value) return ''
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value).slice(0, 10)
}

export default function ContentScheduleDetailPage({ params }: { params: { id: string } }) {
  const [item, setItem] = useState<ContentScheduleDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [launchDateDraft, setLaunchDateDraft] = useState('')
  const [endDateDraft, setEndDateDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [res, staffRes] = await Promise.all([
        fetch(`/api/content-schedules/${params.id}`),
        fetch('/api/staff'),
      ])
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = await res.json()
      const staffData = await staffRes.json()
      setItem(data.content_schedule)
      setStaffList(staffData.staff || [])
      setNotesDraft(data.content_schedule?.notes || '')
      setLaunchDateDraft(toDateInputValue(data.content_schedule?.launch_date))
      setEndDateDraft(toDateInputValue(data.content_schedule?.end_date))
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
      const res = await fetch(`/api/content-schedules/${params.id}`, {
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

  const saveScheduleDates = async () => {
    await updateField({
      launch_date: toDateInputValue(launchDateDraft) || null,
      end_date: toDateInputValue(endDateDraft) || null,
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

  if (!item) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">Content schedule not found</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        <div className="space-y-4">
          <button onClick={() => router.push('/content-schedules')} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Content Schedules
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{item.content_name}</h1>
              <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400">
                <span>{item.company_name || 'No company'}</span>
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
          <form onSubmit={saveNotes} className="border border-zinc-200 bg-white p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">Notes</h2>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {saving ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={12} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" />
          </form>

          <div className="space-y-6">
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assignment</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Operator</label>
                  <ContentAssigneePicker contentScheduleId={item.id} staffList={staffList} />
                </div>
                <label className="flex items-center gap-2 text-sm text-zinc-700">
                  <input type="checkbox" checked={item.files_ready} onChange={(e) => updateField({ files_ready: e.target.checked })} />
                  Files ready
                </label>
              </div>
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Schedule Details</h2>
              <div className="space-y-4 text-sm">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Launch Date</label>
                  <input type="date" value={toDateInputValue(launchDateDraft)} onChange={(e) => setLaunchDateDraft(e.target.value)} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">End Date</label>
                  <input type="date" value={toDateInputValue(endDateDraft)} onChange={(e) => setEndDateDraft(e.target.value)} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <button type="button" onClick={saveScheduleDates} disabled={saving} className="w-full px-4 py-2 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                  {saving ? 'Saving...' : 'Save Dates'}
                </button>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">File Location</label>
                  <input type="text" value={item.file_location || ''} onChange={(e) => updateField({ file_location: e.target.value })} placeholder="Folder, server path, or URL" className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Operator</span><span className="text-zinc-900 text-right">{item.operator_name || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Files Ready</span><span className="text-zinc-900">{item.files_ready ? 'Yes' : 'No'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

function ContentAssigneePicker({ contentScheduleId, staffList }: { contentScheduleId: string; staffList: Staff[] }) {
  const [operators, setOperators] = useState<Array<Staff & { is_primary?: boolean }>>([])
  const [reps, setReps] = useState<Staff[]>([])
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    staffList.forEach((person) => m.set(person.id, person))
    return m
  }, [staffList])

  const load = async () => {
    const res = await fetch(`/api/content-schedules/${contentScheduleId}/assignees`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    setOperators(data.operators || [])
    setReps(data.enterprise_contacts || [])
  }
  useEffect(() => { load() }, [contentScheduleId])

  const operatorIds = operators.map((operator) => operator.id)
  const repIds = reps.map((rep) => rep.id)
  const save = async (next: { operator_ids?: string[]; enterprise_contact_ids?: string[]; primary_operator_id?: string }) => {
    const res = await fetch(`/api/content-schedules/${contentScheduleId}/assignees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operator_ids: next.operator_ids ?? operatorIds,
        enterprise_contact_ids: next.enterprise_contact_ids ?? repIds,
        primary_operator_id: next.primary_operator_id,
      }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Operators</label>
        <div className="space-y-2">
          {operators.map((operator) => (
            <div key={operator.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs">
              <span>{operator.full_name}{operator.is_primary ? ' · primary' : ''}</span>
              <button type="button" onClick={() => save({ operator_ids: operatorIds.filter((id) => id !== operator.id) })} className="text-zinc-400 hover:text-red-600">Remove</button>
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && save({ operator_ids: [...operatorIds, e.target.value] })} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
            <option value="">Add operator...</option>
            {staffList.filter((s) => !operatorIds.includes(s.id)).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Enterprise Leads</label>
        <div className="space-y-2">
          {reps.map((rep) => (
            <div key={rep.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs">
              <span>{staffById.get(rep.id)?.full_name || rep.full_name}</span>
              <button type="button" onClick={() => save({ enterprise_contact_ids: repIds.filter((id) => id !== rep.id) })} className="text-zinc-400 hover:text-red-600">Remove</button>
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && save({ enterprise_contact_ids: [...repIds, e.target.value] })} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
            <option value="">Add enterprise lead...</option>
            {staffList.filter((s) => !repIds.includes(s.id)).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
