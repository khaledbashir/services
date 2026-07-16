'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { CommentThread } from '@/components/comment-thread'
import { TicketProofFtp } from '@/components/ticket-proof-ftp'
import { CgDesignActivityTimeline } from '@/components/cg-design-activity-timeline'
import { ProofFileRoster } from '@/components/proof-file-roster'

interface CgDesignRequestDetail {
  id: string
  venue_id: string | null
  venue_name: string | null
  league: string | null
  team_name: string | null
  tricode: string | null
  job_title: string
  notes: string | null
  designer_id: string | null
  designer_name: string | null
  due_date: string | null
  status: string
  created_at: string
  updated_at: string
  project_file_location: string | null
  ftp_proof_link: string | null
  legacy_ftp_proof_link?: string | null
}

interface Staff { id: string; full_name: string }

const statusOptions = [
  { value: 'request_submitted', label: 'Request Submitted' },
  { value: 'in_progress', label: 'In-Progress' },
  { value: 'submitted_internally', label: 'Submitted Internally' },
  { value: 'client_review', label: 'Client Review' },
  { value: 'revisions', label: 'Revisions' },
  { value: 'approved', label: 'Approved' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'request_closed', label: 'Request Closed' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function CgDesignDetail({
  params,
  embedded = false,
  onClose,
}: {
  params: { id: string }
  embedded?: boolean
  onClose?: () => void
}) {
  const [item, setItem] = useState<CgDesignRequestDetail | null>(null)
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [projectFileDraft, setProjectFileDraft] = useState('')
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [res, staffRes] = await Promise.all([
        fetch(`/api/cg-designs/${params.id}`),
        fetch('/api/staff?assignable=project'),
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
      setProjectFileDraft(data.cg_design_request?.project_file_location || '')
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      setCurrentUserId(localStorage.getItem('userId'))
      setIsAdmin(localStorage.getItem('userRole') === 'admin')
    } catch {}
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
      <PageFrame embedded={embedded}>
        <div className="max-w-6xl mx-auto space-y-6 py-2">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-16 w-full" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-80 col-span-2 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </PageFrame>
    )
  }

  if (!item) {
    return (
      <PageFrame embedded={embedded}>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">CG design request not found</div>
      </PageFrame>
    )
  }

  return (
    <PageFrame embedded={embedded}>
      <div className={`${embedded ? 'px-5 py-5' : 'max-w-6xl mx-auto py-2'} space-y-8`}>
        <div className="space-y-4">
          <button onClick={() => embedded ? onClose?.() : router.push('/cg-designs')} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group">
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
                {item.tricode && (
                  <>
                    <span>&middot;</span>
                    <span className="font-mono">{item.tricode}</span>
                  </>
                )}
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

            <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Project File Location</h2>
                <p className="mt-1 text-xs text-zinc-500">Keep the working-file location with the request.</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={projectFileDraft}
                  onChange={(e) => setProjectFileDraft(e.target.value)}
                  onBlur={() => projectFileDraft !== (item.project_file_location || '') && updateField({ project_file_location: projectFileDraft })}
                  placeholder="Project file location"
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/20"
                />
                {projectFileDraft && <a href={projectFileDraft} target="_blank" rel="noreferrer" className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white">Open</a>}
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Client Proof</h2>
                <p className="mt-1 text-xs text-zinc-500">A proof and client approval are required before this request can close.</p>
              </div>
              <TicketProofFtp
                objectType="cgDesignRequest"
                recordId={item.id}
                triCode={item.tricode}
                clientName={item.team_name || item.venue_name}
                existingProofUrl={item.ftp_proof_link}
                onCreated={({ url }) => setItem((current) => current ? { ...current, ftp_proof_link: url, status: 'client_review' } : current)}
              />
              {item.ftp_proof_link && /\/proof\/[A-Za-z0-9_-]+\/?$/.test(item.ftp_proof_link) && (
                <ProofFileRoster proofUrl={item.ftp_proof_link} />
              )}
            </div>

            <HoursLog cgDesignRequestId={item.id} staffList={staffList} />
            <AttachmentPanel cgDesignRequestId={item.id} />
            <CommentThread
              baseUrl={`/api/cg-designs/${item.id}/comments`}
              staff={staffList}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
            />
            <CgDesignActivityTimeline requestId={item.id} />
          </div>

          <div className="space-y-6">
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Assignment</h2>
              <CgAssigneePicker cgDesignRequestId={item.id} staffList={staffList} />
            </div>
            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Request Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Due Date</span><span className="text-zinc-900">{item.due_date || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Team</span><span className="text-zinc-900 text-right">{item.team_name || '—'}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Tri-Code</span><span className="text-zinc-900 font-mono">{item.tricode || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageFrame>
  )
}

function PageFrame({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>
}

function CgAssigneePicker({ cgDesignRequestId, staffList }: { cgDesignRequestId: string; staffList: Staff[] }) {
  const [designers, setDesigners] = useState<Array<Staff & { is_primary?: boolean }>>([])
  const [reps, setReps] = useState<Staff[]>([])
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    staffList.forEach((person) => m.set(person.id, person))
    return m
  }, [staffList])

  const load = async () => {
    const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/assignees`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    setDesigners(data.designers || [])
    setReps(data.enterprise_contacts || [])
  }
  useEffect(() => { load() }, [cgDesignRequestId])

  const designerIds = designers.map((d) => d.id)
  const repIds = reps.map((r) => r.id)
  const save = async (next: { designer_ids?: string[]; enterprise_contact_ids?: string[]; primary_designer_id?: string }) => {
    const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/assignees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        designer_ids: next.designer_ids ?? designerIds,
        enterprise_contact_ids: next.enterprise_contact_ids ?? repIds,
        primary_designer_id: next.primary_designer_id,
      }),
    })
    if (res.ok) await load()
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-zinc-600 mb-1">Designers</label>
        <div className="space-y-2">
          {designers.map((designer) => (
            <div key={designer.id} className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white px-2 py-1.5 text-xs">
              <span>{designer.full_name}{designer.is_primary ? ' · primary' : ''}</span>
              <button type="button" onClick={() => save({ designer_ids: designerIds.filter((id) => id !== designer.id) })} className="text-zinc-400 hover:text-red-600">Remove</button>
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && save({ designer_ids: [...designerIds, e.target.value] })} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
            <option value="">Add designer...</option>
            {staffList.filter((s) => !designerIds.includes(s.id)).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
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

function HoursLog({ cgDesignRequestId, staffList }: { cgDesignRequestId: string; staffList: Staff[] }) {
  const [entries, setEntries] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [form, setForm] = useState({ hours: '', entry_date: new Date().toISOString().slice(0, 10), designer_id: '', description: '' })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/hours`, { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json()
    setEntries(data.entries || [])
    setTotal(Number(data.total_hours || 0))
  }
  useEffect(() => { load() }, [cgDesignRequestId])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/hours`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, hours: Number(form.hours), designer_id: form.designer_id || undefined }),
      })
      if (res.ok) {
        setForm((prev) => ({ ...prev, hours: '', description: '' }))
        await load()
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/hours?entry_id=${id}`, { method: 'DELETE' })
    if (res.ok) await load()
  }

  return (
    <div className="border border-zinc-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Time Entries</h2>
        <span className="text-xs font-semibold text-zinc-600">{total.toFixed(2)}h total</span>
      </div>
      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[90px,150px,1fr,1.4fr,auto] gap-2">
        <input type="number" step="0.25" min="0" value={form.hours} onChange={(e) => setForm((prev) => ({ ...prev, hours: e.target.value }))} placeholder="Hours" className="border border-zinc-300 px-3 py-2 text-sm outline-none" required />
        <input type="date" value={form.entry_date} onChange={(e) => setForm((prev) => ({ ...prev, entry_date: e.target.value }))} className="border border-zinc-300 px-3 py-2 text-sm outline-none" />
        <select value={form.designer_id} onChange={(e) => setForm((prev) => ({ ...prev, designer_id: e.target.value }))} className="border border-zinc-300 px-3 py-2 text-sm outline-none bg-white">
          <option value="">Me</option>
          {staffList.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
        </select>
        <input type="text" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} placeholder="What changed" className="border border-zinc-300 px-3 py-2 text-sm outline-none" />
        <button type="submit" disabled={saving} className="px-4 py-2 bg-zinc-900 text-white text-xs font-medium disabled:opacity-50">{saving ? 'Saving...' : 'Add'}</button>
      </form>
      <div className="space-y-2">
        {entries.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-400">No time entries yet</div>
        ) : entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 rounded border border-zinc-100 px-3 py-2 text-xs">
            <div>
              <span className="font-semibold text-zinc-900">{Number(entry.hours).toFixed(2)}h</span>
              <span className="ml-2 text-zinc-500">{entry.designer_name || 'Designer'} · {entry.entry_date}</span>
              {entry.description && <div className="mt-0.5 text-zinc-600">{entry.description}</div>}
            </div>
            <button type="button" onClick={() => remove(entry.id)} className="text-zinc-400 hover:text-red-600">Delete</button>
          </div>
        ))}
      </div>
    </div>
  )
}

function AttachmentPanel({ cgDesignRequestId }: { cgDesignRequestId: string }) {
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  const load = async () => {
    const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/attachments`, { cache: 'no-store' })
    if (res.ok) setAttachments((await res.json()).attachments || [])
  }
  useEffect(() => { load() }, [cgDesignRequestId])

  const upload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/cg-designs/${cgDesignRequestId}/attachments`, { method: 'POST', body: form })
      if (res.ok) await load()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border border-zinc-200 bg-white p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Attachments</h2>
        <label className="cursor-pointer px-3 py-1.5 bg-zinc-900 text-white text-xs font-medium hover:bg-zinc-800">
          {uploading ? 'Uploading...' : 'Attach'}
          <input type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0] || null)} disabled={uploading} />
        </label>
      </div>
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <div className="rounded border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-400">No attachments yet</div>
        ) : attachments.map((file) => (
          <a key={file.id} href={file.download_url} className="flex items-center justify-between gap-3 rounded border border-zinc-100 px-3 py-2 text-xs hover:border-zinc-300">
            <span className="truncate text-zinc-800">{file.filename}</span>
            <span className="text-zinc-400">{Math.max(1, Math.round(Number(file.size_bytes || 0) / 1024))} KB</span>
          </a>
        ))}
      </div>
    </div>
  )
}
