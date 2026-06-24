'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Plus, Printer, Save, Trash2 } from 'lucide-react'
import type { TransmittalInput, TransmittalItem } from '@/lib/project-schedule'

// ---------------------------------------------------------------------------
// ANC Letter of Transmittal — printable two-pane workspace.
// Left: config rail (the app's recessed zinc-50 well + h-10 inputs).
// Right: paper preview that renders the real printed letter, print-to-PDF ready.
// ---------------------------------------------------------------------------

const SENDING_METHODS = ['Attached', 'Under Separate Cover'] as const

const SENDING_KINDS = [
  'Shop Drawings',
  'Prints',
  'Plans',
  'Samples',
  'Specifications',
  'Copy of Letter',
  'Change Order',
  'Other',
] as const

const TRANSMITTED_FOR = [
  'For Approval',
  'For your Use',
  'As requested',
  'For review and comment',
  'For Bids',
] as const

const TRANSMITTED_RESULT = [
  'Approved as Submitted',
  'Approved as Noted',
  'Returned for corrections',
  'Resubmit',
  'Submit',
  'Return corrected prints',
  'Other',
] as const

const inputClass =
  'h-10 w-full rounded-md border border-[#E8E8E8] bg-white px-3 text-sm text-zinc-900 outline-none focus:border-[#0A52EF] focus-visible:ring-2 focus-visible:ring-[#0A52EF]/20'

const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'

function csv(value: string): string[] {
  return value
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

export function TransmittalClient({
  projectId,
  projectName,
  pm,
  draft,
  savedId: initialSavedId,
}: {
  projectId: string
  projectName: string
  pm: string
  draft: TransmittalInput
  savedId: string | null
}) {
  const [to, setTo] = useState(draft.to ?? '')
  const [from, setFrom] = useState(draft.from ?? pm ?? 'ANC Sports')
  const [date, setDate] = useState(draft.date ?? new Date().toISOString().slice(0, 10))
  const [project, setProject] = useState(draft.project ?? projectName)
  const [submittalNo, setSubmittalNo] = useState(draft.submittalNo ?? '')
  const [items, setItems] = useState<TransmittalItem[]>(
    draft.items?.length ? draft.items : [{ n: 1, description: '' }],
  )
  // sendingItems is stored as a comma string; seed the method + checkbox set from it.
  const seededSending = useMemo(() => csv(draft.sendingItems ?? ''), [draft.sendingItems])
  const [sendingMethod, setSendingMethod] = useState<string>(
    seededSending.find((value) => (SENDING_METHODS as readonly string[]).includes(value)) ?? 'Attached',
  )
  const [sendingKinds, setSendingKinds] = useState<string[]>(
    seededSending.filter((value) => (SENDING_KINDS as readonly string[]).includes(value)),
  )
  const [transmittedAs, setTransmittedAs] = useState(draft.transmittedAs ?? 'For Approval')
  const [remarks, setRemarks] = useState(draft.remarks ?? '')
  const [remarksBy, setRemarksBy] = useState(draft.remarksBy ?? pm ?? '')
  const [copiesTo, setCopiesTo] = useState(draft.copiesTo ?? '')
  const [signedBy, setSignedBy] = useState(draft.signedBy ?? pm ?? '')

  const [savedId, setSavedId] = useState<string | null>(initialSavedId)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendingSummary = [sendingMethod, ...sendingKinds].filter(Boolean)
  const filledItems = items.filter((item) => item.description.trim())
  const canSave = Boolean(to.trim()) && filledItems.length > 0

  function setItem(index: number, description: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, description } : item)))
  }

  function addItem() {
    setItems((prev) => [...prev, { n: prev.length + 1, description: '' }])
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, n: i + 1 })))
  }

  function toggleKind(kind: string) {
    setSendingKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind]))
  }

  function buildBody(): TransmittalInput {
    return {
      submittalId: draft.submittalId ?? null,
      to: to.trim(),
      from: from.trim(),
      date,
      project: project.trim(),
      submittalNo: submittalNo.trim(),
      sendingItems: sendingSummary.join(', '),
      transmittedAs,
      items: filledItems.map((item, i) => ({ n: i + 1, description: item.description.trim() })),
      remarks: remarks.trim(),
      remarksBy: remarksBy.trim(),
      copiesTo: copiesTo.trim(),
      signedBy: signedBy.trim(),
    }
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      const url = savedId
        ? `/api/project-schedule/${projectId}/transmittals/${savedId}`
        : `/api/project-schedule/${projectId}/transmittals`
      const response = await fetch(url, {
        method: savedId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Failed to save')
      if (payload.data?.id) setSavedId(payload.data.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the transmittal. Check the connection and try again.")
    } finally {
      setSaving(false)
    }
  }

  const transmittedForActive = (TRANSMITTED_FOR as readonly string[]).includes(transmittedAs)
    ? transmittedAs
    : null
  const transmittedResultActive = (TRANSMITTED_RESULT as readonly string[]).includes(transmittedAs)
    ? transmittedAs
    : null

  return (
    <div className="min-h-screen bg-zinc-100">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden sticky top-0 z-10 border-b border-[#E8E8E8] bg-white">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-3 px-5 py-3">
          <Link
            href={`/project-schedule/${projectId}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-[#0A52EF]"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to workspace
          </Link>
          <div className="flex items-center gap-2">
            {error ? <span className="text-xs font-medium text-rose-700">{error}</span> : null}
            <button
              type="button"
              onClick={save}
              disabled={!canSave || saving}
              title={!canSave ? 'Add a recipient and at least one item' : undefined}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-[#E8E8E8] px-3 text-sm font-semibold text-zinc-800 hover:border-[#0A52EF]/40 hover:text-[#0A52EF] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving' : savedId ? 'Saved' : 'Generate transmittal'}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-[#0A52EF] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#0A52EF]/90"
            >
              <Printer className="h-4 w-4" />
              Print / PDF
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1180px] gap-6 px-5 py-6 lg:grid-cols-[340px_1fr] print:block print:max-w-none print:gap-0 print:p-0">
        {/* ---------------------------- CONFIG RAIL ---------------------------- */}
        <aside className="print:hidden space-y-4 rounded-md border border-[#E8E8E8] bg-zinc-50 p-4 shadow-sm self-start">
          <div>
            <p className={labelClass}>Letter of Transmittal</p>
            <p className="mt-1 text-xs text-zinc-500">Edits update the page on the right live.</p>
          </div>

          <Field label="To">
            <input value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} placeholder="Recipient" />
          </Field>
          <Field label="From">
            <input value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} placeholder="ANC Sports" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} tabular-nums`} />
            </Field>
            <Field label="Submittal #">
              <input value={submittalNo} onChange={(e) => setSubmittalNo(e.target.value)} className={`${inputClass} tabular-nums`} placeholder="000" />
            </Field>
          </div>
          <Field label="Project">
            <input value={project} onChange={(e) => setProject(e.target.value)} className={inputClass} />
          </Field>

          <div className="rounded-md border border-[#E8E8E8] bg-white p-3">
            <p className={labelClass}>We are sending</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SENDING_METHODS.map((method) => (
                <Radio key={method} name="method" label={method} checked={sendingMethod === method} onChange={() => setSendingMethod(method)} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-[#E8E8E8] pt-2">
              {SENDING_KINDS.map((kind) => (
                <Check key={kind} label={kind} checked={sendingKinds.includes(kind)} onChange={() => toggleKind(kind)} />
              ))}
            </div>
          </div>

          <Field label="Transmitted as">
            <select value={transmittedAs} onChange={(e) => setTransmittedAs(e.target.value)} className={inputClass}>
              <optgroup label="For">
                {TRANSMITTED_FOR.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </optgroup>
              <optgroup label="Result">
                {TRANSMITTED_RESULT.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </optgroup>
            </select>
          </Field>

          <div className="rounded-md border border-[#E8E8E8] bg-white p-3">
            <p className={labelClass}>Items</p>
            <div className="mt-2 space-y-2">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-5 text-center text-xs font-semibold tabular-nums text-zinc-400">{index + 1}</span>
                  <input
                    value={item.description}
                    onChange={(e) => setItem(index, e.target.value)}
                    className="h-9 flex-1 rounded-md border border-[#E8E8E8] bg-white px-2.5 text-sm text-zinc-900 outline-none focus:border-[#0A52EF]"
                    placeholder="Description"
                  />
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E8E8E8] text-zinc-400 hover:text-rose-600 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={addItem} className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A52EF] hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add item
            </button>
          </div>

          <Field label="Remarks">
            <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={3} className="w-full rounded-md border border-[#E8E8E8] bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-[#0A52EF]" placeholder="Remarks" />
          </Field>
          <Field label="Remarks by">
            <input value={remarksBy} onChange={(e) => setRemarksBy(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Copies to">
            <input value={copiesTo} onChange={(e) => setCopiesTo(e.target.value)} className={inputClass} placeholder="Comma separated" />
          </Field>
          <Field label="Signed">
            <input value={signedBy} onChange={(e) => setSignedBy(e.target.value)} className={inputClass} />
          </Field>

          {!canSave ? (
            <p className="text-xs text-zinc-400">Add a recipient and at least one item to generate.</p>
          ) : null}
        </aside>

        {/* ----------------------------- PAPER PREVIEW ----------------------------- */}
        <div className="flex justify-center print:block">
          <article className="transmittal-page w-full max-w-[816px] bg-white p-12 text-zinc-900 shadow-md print:max-w-none print:p-0 print:shadow-none">
            {/* Header */}
            <header className="flex items-start justify-between gap-6 border-b-2 border-[#0A52EF] pb-5">
              <div className="flex items-center gap-4">
                <Image src="/ANC_Logo_2023_blue.png" alt="ANC" width={56} height={56} className="h-14 w-14 object-contain" priority />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">ANC Sports</p>
                  <h1 className="mt-0.5 text-2xl font-bold uppercase tracking-[0.06em] text-zinc-950">Letter of Transmittal</h1>
                </div>
              </div>
            </header>

            {/* To / From / Date / Project / Submittal block */}
            <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
              <Row label="To" value={to} />
              <Row label="Date" value={date} mono />
              <Row label="From" value={from} />
              <Row label="Submittal No." value={submittalNo} mono />
              <div className="col-span-2">
                <Row label="Project" value={project} />
              </div>
            </section>

            {/* We are sending you the following */}
            <section className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                We are sending you the following items
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 text-sm">
                {SENDING_METHODS.map((method) => (
                  <PrintCheck key={method} label={method} checked={sendingMethod === method} />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-[#E8E8E8] pt-2 text-sm">
                {SENDING_KINDS.map((kind) => (
                  <PrintCheck key={kind} label={kind} checked={sendingKinds.includes(kind)} />
                ))}
              </div>
            </section>

            {/* Item | Description table */}
            <section className="mt-6">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b-2 border-zinc-900 text-left">
                    <th className="w-16 py-2 pr-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Item</th>
                    <th className="py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {(filledItems.length ? filledItems : [{ n: 1, description: '' }]).map((item, index) => (
                    <tr key={index} className="border-b border-[#E8E8E8]">
                      <td className="py-2 pr-3 align-top font-semibold tabular-nums text-zinc-700">{index + 1}</td>
                      <td className="py-2 align-top text-zinc-900">{item.description || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* These are transmitted as checked below */}
            <section className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                These are transmitted as checked below
              </p>
              <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
                <div className="space-y-1.5">
                  {TRANSMITTED_FOR.map((opt) => (
                    <PrintCheck key={opt} label={opt} checked={transmittedForActive === opt} />
                  ))}
                </div>
                <div className="space-y-1.5">
                  {TRANSMITTED_RESULT.map((opt) => (
                    <PrintCheck key={opt} label={opt} checked={transmittedResultActive === opt} />
                  ))}
                </div>
              </div>
            </section>

            {/* Remarks */}
            <section className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Remarks</p>
              <p className="mt-1 min-h-[2.5rem] whitespace-pre-wrap border-b border-[#E8E8E8] pb-2 text-sm leading-6 text-zinc-700">
                {remarks || ' '}
              </p>
            </section>

            {/* Remarks by / Copies to / Signed */}
            <section className="mt-6 grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <SignRow label="Remarks By" value={remarksBy} />
              <SignRow label="Copies to" value={copiesTo} />
              <div className="col-span-2 mt-2">
                <SignRow label="Signed" value={signedBy} />
              </div>
            </section>

            {/* Footer */}
            <footer className="mt-12 border-t border-[#E8E8E8] pt-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#0A52EF]">Power the Experience</p>
            </footer>
          </article>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-3.5 w-3.5 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]" />
      {label}
    </label>
  )
}

function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-700">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="h-3.5 w-3.5 border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]" />
      {label}
    </label>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</span>
      <span className={`flex-1 border-b border-[#E8E8E8] pb-0.5 font-medium text-zinc-900 ${mono ? 'tabular-nums' : ''}`}>
        {value || ' '}
      </span>
    </div>
  )
}

function SignRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="min-h-[1.5rem] border-b border-zinc-400 pb-1 font-medium text-zinc-900">{value || ' '}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">{label}</div>
    </div>
  )
}

// Printed checkbox glyph — a real box that fills when checked, color-safe in PDF.
function PrintCheck({ label, checked }: { label: string; checked: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 ${checked ? 'text-zinc-900' : 'text-zinc-500'}`}>
      <span
        className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[2px] border ${
          checked ? 'border-[#0A52EF] bg-[#0A52EF] text-white' : 'border-zinc-400 bg-white'
        }`}
      >
        {checked ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2 6.5 5 9.5 10 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
      <span className={checked ? 'font-medium' : ''}>{label}</span>
    </span>
  )
}
