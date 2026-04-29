'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { useToast } from '@/components/toast'

interface ShiftTemplate {
  id: string
  name: string
  venue_id: string
  venue_name: string
  start_time: string
  end_time: string
  required_staff: number
  recurrence: string
  custom_days: number[]
  is_active: boolean
  created_at: string
}

interface Venue {
  id: string
  name: string
}

interface StaffMember {
  id: string
  full_name: string
  role: string
}

interface PreviewShift {
  date: string
  day_name: string
  start_time: string
  end_time: string
  venue_name: string
  exists: boolean
}

const recurrenceLabels: Record<string, string> = {
  daily: 'Every Day',
  weekdays: 'Weekdays (Mon–Fri)',
  weekends: 'Weekends (Sat–Sun)',
  mwf: 'Mon / Wed / Fri',
  tth: 'Tue / Thu',
  custom: 'Custom Days',
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

export default function ShiftTemplatesPage() {
  const auth = useAuth('manager')
  const { showToast } = useToast()
  const [templates, setTemplates] = useState<ShiftTemplate[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    name: '',
    venue_id: '',
    start_time: '08:00',
    end_time: '12:00',
    required_staff: 1,
    recurrence: 'weekdays',
    custom_days: [] as number[],
  })

  // Generate state
  const [generating, setGenerating] = useState<string | null>(null)
  const [genForm, setGenForm] = useState({ start_date: '', end_date: '', staff_ids: [] as string[] })
  const [preview, setPreview] = useState<{ shifts: PreviewShift[]; new_count: number; existing_count: number; template_name: string } | null>(null)
  const [committing, setCommitting] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/shift-templates').then(r => r.json()),
      fetch('/api/venues').then(r => r.json()),
      fetch('/api/staff').then(r => r.json()),
    ]).then(([tData, vData, sData]) => {
      setTemplates(tData.templates || [])
      setVenues((vData.venues || []).sort((a: Venue, b: Venue) => a.name.localeCompare(b.name)))
      setStaffList((sData.staff || []).filter((s: any) => s.is_active !== false))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const createTemplate = async () => {
    if (!form.name || !form.venue_id) return
    setSaving(true)
    try {
      const res = await fetch('/api/shift-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(prev => [...prev, { ...data.template, venue_name: venues.find(v => v.id === form.venue_id)?.name || '' }])
        setShowForm(false)
        setForm({ name: '', venue_id: '', start_time: '08:00', end_time: '12:00', required_staff: 1, recurrence: 'weekdays', custom_days: [] })
      }
    } catch {} finally { setSaving(false) }
  }

  const toggleTemplate = async (id: string, active: boolean) => {
    await fetch(`/api/shift-templates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: active }),
    })
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, is_active: active } : t))
  }

  const deleteTemplate = async (id: string) => {
    await fetch(`/api/shift-templates/${id}`, { method: 'DELETE' })
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  const startGenerate = (id: string) => {
    const today = new Date()
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    setGenerating(id)
    setGenForm({
      start_date: today.toISOString().split('T')[0],
      end_date: nextWeek.toISOString().split('T')[0],
      staff_ids: [],
    })
    setPreview(null)
  }

  const previewShifts = async () => {
    if (!generating) return
    try {
      const res = await fetch(`/api/shift-templates/${generating}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...genForm, preview: true }),
      })
      if (res.ok) {
        const data = await res.json()
        setPreview(data)
      }
    } catch {}
  }

  const commitGenerate = async () => {
    if (!generating) return
    setCommitting(true)
    try {
      const res = await fetch(`/api/shift-templates/${generating}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genForm),
      })
      if (res.ok) {
        const data = await res.json()
        setGenerating(null)
        setPreview(null)
        showToast(`Created ${data.created} shifts${data.skipped ? `, ${data.skipped} already existed` : ''}`, 'success')
      }
    } catch {} finally { setCommitting(false) }
  }

  const toggleStaff = (id: string) => {
    setGenForm(prev => ({
      ...prev,
      staff_ids: prev.staff_ids.includes(id)
        ? prev.staff_ids.filter(s => s !== id)
        : [...prev.staff_ids, id],
    }))
  }

  if (!auth.loaded) return null

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Shift Templates</h1>
            <p className="text-sm text-zinc-500 mt-1">Create recurring shift patterns and auto-generate schedules</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Template'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">New Shift Template</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Template Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Morning Shift"
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                <select
                  value={form.venue_id}
                  onChange={e => setForm({ ...form, venue_id: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                >
                  <option value="">Select venue...</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Staff Needed</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.required_staff}
                  onChange={e => setForm({ ...form, required_staff: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Start Time</label>
                <input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">End Time</label>
                <input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm({ ...form, end_time: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Recurrence</label>
                <select
                  value={form.recurrence}
                  onChange={e => setForm({ ...form, recurrence: e.target.value })}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                >
                  {Object.entries(recurrenceLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Custom days picker */}
            {form.recurrence === 'custom' && (
              <div className="mt-4">
                <label className="block text-xs font-medium text-zinc-500 mb-2">Select Days</label>
                <div className="flex gap-2">
                  {dayLabels.map((day, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setForm({
                        ...form,
                        custom_days: form.custom_days.includes(idx)
                          ? form.custom_days.filter(d => d !== idx)
                          : [...form.custom_days, idx],
                      })}
                      className={`w-10 h-10 rounded-full text-xs font-medium transition-colors ${
                        form.custom_days.includes(idx)
                          ? 'bg-[#0A52EF] text-white'
                          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                onClick={createTemplate}
                disabled={saving || !form.name || !form.venue_id}
                className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        )}

        {/* Templates List */}
        {loading ? (
          <div className="text-center py-12 text-zinc-400">Loading...</div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-12 text-center">
            <p className="text-zinc-500 text-sm">No shift templates yet. Create one to start auto-generating schedules.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {templates.map(template => (
              <div key={template.id} className={`bg-white rounded-lg border shadow-sm overflow-hidden ${template.is_active ? 'border-[#E8E8E8]' : 'border-zinc-200 opacity-60'}`}>
                <div className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900">{template.name}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{template.venue_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium ${template.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                        {template.is_active ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div className="bg-zinc-50 rounded-md px-3 py-2">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Time</p>
                      <p className="text-sm font-medium text-zinc-900 mt-0.5">{formatTime(template.start_time)} – {formatTime(template.end_time)}</p>
                    </div>
                    <div className="bg-zinc-50 rounded-md px-3 py-2">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Pattern</p>
                      <p className="text-sm font-medium text-zinc-900 mt-0.5">{recurrenceLabels[template.recurrence] || template.recurrence}</p>
                    </div>
                    <div className="bg-zinc-50 rounded-md px-3 py-2">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Staff</p>
                      <p className="text-sm font-medium text-zinc-900 mt-0.5">{template.required_staff} needed</p>
                    </div>
                  </div>

                  {/* Custom days display */}
                  {template.recurrence === 'custom' && template.custom_days?.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {dayLabels.map((day, idx) => (
                        <span key={idx} className={`w-7 h-7 rounded-full text-[10px] font-medium flex items-center justify-center ${
                          template.custom_days.includes(idx) ? 'bg-[#0A52EF] text-white' : 'bg-zinc-100 text-zinc-300'
                        }`}>{day}</span>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => startGenerate(template.id)}
                      disabled={!template.is_active}
                      className="min-w-[160px] flex-1 px-3 py-2 bg-[#0A52EF] text-white rounded-md text-xs font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                    >
                      Generate Shifts
                    </button>
                    <button
                      onClick={() => toggleTemplate(template.id, !template.is_active)}
                      className="px-3 py-2 border border-[#E8E8E8] rounded-md text-xs font-medium text-zinc-600 hover:border-zinc-300 transition-colors"
                    >
                      {template.is_active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      onClick={() => { if (confirm('Delete this template?')) deleteTemplate(template.id) }}
                      className="px-3 py-2 border border-red-200 rounded-md text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Generate Modal */}
        {generating && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-[#E8E8E8] flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-900">Generate Shifts</h3>
                <button onClick={() => { setGenerating(null); setPreview(null) }} className="text-zinc-400 hover:text-zinc-600 text-lg">x</button>
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                {/* Date range */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={genForm.start_date}
                      onChange={e => setGenForm({ ...genForm, start_date: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">End Date</label>
                    <input
                      type="date"
                      value={genForm.end_date}
                      onChange={e => setGenForm({ ...genForm, end_date: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    />
                  </div>
                </div>

                {/* Staff selection */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-zinc-500 mb-2">
                    Auto-assign Staff <span className="text-zinc-400">(optional — select who works these shifts)</span>
                  </label>
                  <div className="border border-[#E8E8E8] rounded max-h-40 overflow-y-auto">
                    {staffList.map(s => (
                      <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer border-b border-[#E8E8E8] last:border-0">
                        <input
                          type="checkbox"
                          checked={genForm.staff_ids.includes(s.id)}
                          onChange={() => toggleStaff(s.id)}
                          className="rounded border-zinc-300"
                        />
                        <span className="text-sm text-zinc-900">{s.full_name}</span>
                        <span className="text-[10px] text-zinc-400 capitalize">{s.role}</span>
                      </label>
                    ))}
                  </div>
                  {genForm.staff_ids.length > 0 && (
                    <p className="text-[10px] text-zinc-400 mt-1">{genForm.staff_ids.length} staff selected</p>
                  )}
                </div>

                <button
                  onClick={previewShifts}
                  disabled={!genForm.start_date || !genForm.end_date}
                  className="px-4 py-2 bg-zinc-900 text-white rounded text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  Preview Shifts
                </button>

                {/* Preview table */}
                {preview && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-zinc-500">
                        <span className="text-emerald-600 font-medium">{preview.new_count} new shifts</span>
                        {preview.existing_count > 0 && <>, <span className="text-amber-600 font-medium">{preview.existing_count} already exist</span></>}
                      </p>
                    </div>
                    <div className="border border-[#E8E8E8] rounded overflow-hidden max-h-60 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-zinc-50 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Date</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Day</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Time</th>
                            <th className="text-left px-3 py-2 text-xs font-medium text-zinc-500">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.shifts.map((shift, idx) => (
                            <tr key={idx} className={`border-t border-[#E8E8E8] ${shift.exists ? 'bg-amber-50/50' : ''}`}>
                              <td className="px-3 py-1.5 text-xs text-zinc-900 font-mono">{shift.date}</td>
                              <td className="px-3 py-1.5 text-xs text-zinc-600">{shift.day_name}</td>
                              <td className="px-3 py-1.5 text-xs text-zinc-600">{formatTime(shift.start_time)} – {formatTime(shift.end_time)}</td>
                              <td className="px-3 py-1.5">
                                <span className={`text-[10px] font-medium ${shift.exists ? 'text-amber-600' : 'text-emerald-600'}`}>
                                  {shift.exists ? 'Already exists' : 'Will create'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {preview && preview.new_count > 0 && (
                <div className="px-6 py-3 border-t border-[#E8E8E8] bg-zinc-50 flex items-center justify-between">
                  <p className="text-xs text-zinc-500">This will create {preview.new_count} shift events on the calendar</p>
                  <button
                    onClick={commitGenerate}
                    disabled={committing}
                    className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                  >
                    {committing ? 'Generating...' : `Create ${preview.new_count} Shifts`}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
