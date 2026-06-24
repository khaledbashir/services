'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FileText, Pencil, Save, Send, X } from 'lucide-react'
import type {
  ActiveProject,
  DeploymentDocument,
  DeploymentDocumentStatus,
  SubmittalRegisterItem,
  SubmittalStatus,
} from '@/lib/project-schedule'

const documentStyles: Record<DeploymentDocumentStatus, string> = {
  ready: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  watch: 'bg-amber-50 text-amber-700 ring-amber-100',
  missing: 'bg-rose-50 text-rose-700 ring-rose-100',
}

const submittalLabels: Record<SubmittalStatus, string> = {
  needed: 'Needed',
  submitted: 'Submitted',
  returned: 'Returned',
  approved: 'Approved',
}

const submittalStyles: Record<SubmittalStatus, string> = {
  needed: 'bg-rose-50 text-rose-700 ring-rose-100',
  submitted: 'bg-blue-50 text-blue-700 ring-blue-100',
  returned: 'bg-amber-50 text-amber-700 ring-amber-100',
  approved: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
}

const SUBMITTAL_STATUSES: SubmittalStatus[] = ['needed', 'submitted', 'returned', 'approved']
const DOCUMENT_STATUSES: DeploymentDocumentStatus[] = ['ready', 'watch', 'missing']

const inputClass =
  'h-9 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#0A52EF]'

function Badge({ children, className }: { children: React.ReactNode; className: string }) {
  return <span className={`inline-flex items-center rounded px-2 py-1 text-[11px] font-semibold capitalize ring-1 ${className}`}>{children}</span>
}

function EmptyDash({ value }: { value?: string | null }) {
  return <>{value ? value : <span className="text-zinc-300">-</span>}</>
}

type ItemBody = Record<string, unknown> & { itemKind: 'submittal' | 'deployment-document'; itemKey: string }

export function ProjectDeploymentEditable({ project: initialProject }: { project: ActiveProject }) {
  const [project, setProject] = useState(initialProject)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function saveItem(rowId: string, body: ItemBody) {
    setSavingId(rowId)
    setError(null)
    try {
      const response = await fetch(`/api/project-schedule/${project.id}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save')
      const next = (payload.data.activeProjects as ActiveProject[]).find((item) => item.id === project.id)
      if (next) setProject(next)
      setEditingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-950">Submittal Register</h2>
          <FileText className="h-4 w-4 text-orange-600" />
        </div>
        {error ? <div className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs font-medium text-rose-700">{error}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-zinc-50">
              <tr className="border-b border-[#E8E8E8]">
                {['No.', 'Package', 'Rev', 'Status', 'Owner', 'Due', ''].map((header) => (
                  <th key={header} className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {project.submittals.map((item) => (
                <SubmittalRow
                  key={item.id}
                  item={item}
                  projectId={project.id}
                  isEditing={editingId === item.id}
                  isSaving={savingId === item.id}
                  onEdit={() => { setEditingId(item.id); setError(null) }}
                  onCancel={() => setEditingId(null)}
                  onSave={(patch) => saveItem(item.id, { itemKind: 'submittal', itemKey: item.id, ...patch })}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-md border border-[#E8E8E8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E8E8E8] px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-950">Submittal / Document Package</h2>
          <FileText className="h-4 w-4 text-[#0A52EF]" />
        </div>
        <div className="divide-y divide-[#E8E8E8]">
          {project.deploymentDocuments.map((doc) => (
            <DocumentRow
              key={doc.key}
              doc={doc}
              isEditing={editingId === `doc-${doc.key}`}
              isSaving={savingId === `doc-${doc.key}`}
              onEdit={() => { setEditingId(`doc-${doc.key}`); setError(null) }}
              onCancel={() => setEditingId(null)}
              onSave={(patch) => saveItem(`doc-${doc.key}`, { itemKind: 'deployment-document', itemKey: doc.key, ...patch })}
            />
          ))}
        </div>
      </section>
    </>
  )
}

function SubmittalRow({
  item,
  projectId,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
}: {
  item: SubmittalRegisterItem
  projectId: string
  isEditing: boolean
  isSaving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [status, setStatus] = useState<SubmittalStatus>(item.status)
  const [title, setTitle] = useState(item.title)
  const [packageType, setPackageType] = useState(item.packageType)
  const [owner, setOwner] = useState(item.owner)
  const [dueDate, setDueDate] = useState(item.dueDate)

  function startEdit() {
    setStatus(item.status)
    setTitle(item.title)
    setPackageType(item.packageType)
    setOwner(item.owner)
    setDueDate(item.dueDate)
    onEdit()
  }

  if (!isEditing) {
    return (
      <tr className="group border-b border-[#E8E8E8] last:border-b-0">
        <td className="px-5 py-3 text-sm font-semibold text-zinc-900">{item.submittalNo}</td>
        <td className="min-w-[220px] px-5 py-3">
          <div className="text-sm font-medium text-zinc-950">{item.packageType}</div>
          <div className="mt-1 text-xs text-zinc-500">{item.title}</div>
        </td>
        <td className="px-5 py-3 text-sm text-zinc-700">{item.revision}</td>
        <td className="px-5 py-3"><Badge className={submittalStyles[item.status]}>{submittalLabels[item.status]}</Badge></td>
        <td className="min-w-[160px] px-5 py-3 text-sm text-zinc-700"><EmptyDash value={item.owner} /></td>
        <td className="min-w-[130px] px-5 py-3 text-sm text-zinc-700"><EmptyDash value={item.dueDate} /></td>
        <td className="px-5 py-3 text-right">
          <div className="flex items-center justify-end gap-1.5">
            <Link
              href={`/project-schedule/${projectId}/transmittal/${item.id}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]"
            >
              <Send className="h-3.5 w-3.5" /> Generate transmittal
            </Link>
            <button type="button" onClick={startEdit} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr className="border-b border-[#E8E8E8] bg-zinc-50/60 last:border-b-0">
      <td className="px-5 py-3 align-top text-sm font-semibold text-zinc-900">{item.submittalNo}</td>
      <td className="min-w-[240px] px-5 py-3 align-top">
        <input value={packageType} onChange={(e) => setPackageType(e.target.value)} placeholder="Package" className={inputClass} />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Description" className={`${inputClass} mt-2`} />
      </td>
      <td className="px-5 py-3 align-top text-sm text-zinc-700">{item.revision}</td>
      <td className="px-5 py-3 align-top">
        <select value={status} onChange={(e) => setStatus(e.target.value as SubmittalStatus)} className={inputClass}>
          {SUBMITTAL_STATUSES.map((option) => <option key={option} value={option}>{submittalLabels[option]}</option>)}
        </select>
      </td>
      <td className="min-w-[160px] px-5 py-3 align-top">
        <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Owner" className={inputClass} />
      </td>
      <td className="min-w-[140px] px-5 py-3 align-top">
        <input value={dueDate} onChange={(e) => setDueDate(e.target.value)} placeholder="Due" className={inputClass} />
      </td>
      <td className="px-5 py-3 align-top">
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onSave({ status, title, packageType, owner, dueDate })}
            disabled={isSaving}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#0A52EF] px-2.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} disabled={isSaving} className="inline-flex h-8 items-center rounded-md border border-[#E8E8E8] px-2 text-zinc-500 hover:bg-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function DocumentRow({
  doc,
  isEditing,
  isSaving,
  onEdit,
  onCancel,
  onSave,
}: {
  doc: DeploymentDocument
  isEditing: boolean
  isSaving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: (patch: Record<string, unknown>) => void
}) {
  const [status, setStatus] = useState<DeploymentDocumentStatus>(doc.status)
  const [label, setLabel] = useState(doc.label)
  const [detail, setDetail] = useState(doc.detail)

  function startEdit() {
    setStatus(doc.status)
    setLabel(doc.label)
    setDetail(doc.detail)
    onEdit()
  }

  if (!isEditing) {
    return (
      <div className="group grid gap-3 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="text-sm font-medium text-zinc-950">{doc.label}</div>
          <div className="mt-1 text-sm text-zinc-500">{doc.detail}</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={documentStyles[doc.status]}>{doc.status}</Badge>
          <button type="button" onClick={startEdit} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[#E8E8E8] px-2.5 text-xs font-semibold text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:border-[#0A52EF]/40 hover:text-[#0A52EF]">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid gap-3 bg-zinc-50/60 px-5 py-4 md:grid-cols-[1fr_auto] md:items-start">
      <div className="space-y-2">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Document" className={inputClass} />
        <input value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Owner / detail" className={inputClass} />
      </div>
      <div className="flex flex-col items-stretch gap-2 md:w-44">
        <select value={status} onChange={(e) => setStatus(e.target.value as DeploymentDocumentStatus)} className={inputClass}>
          {DOCUMENT_STATUSES.map((option) => <option key={option} value={option} className="capitalize">{option}</option>)}
        </select>
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => onSave({ status, label, detail })}
            disabled={isSaving}
            className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-[#0A52EF] px-2.5 text-xs font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving' : 'Save'}
          </button>
          <button type="button" onClick={onCancel} disabled={isSaving} className="inline-flex h-8 items-center rounded-md border border-[#E8E8E8] px-2 text-zinc-500 hover:bg-white">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
