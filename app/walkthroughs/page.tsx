'use client'

// Walkthroughs list — first surface on the new DataGrid engine. Replaces the
// bespoke filter/table from the prior version. Schema mirrors Nick's Airtable
// Walkthrough Log workflow (venue, technician, date, locations, result).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Walk {
  id: string
  venue_id: string | null
  venue_name: string
  technician_name: string | null
  log_date: string
  log_time: string | null
  locations_visited: string | null
  issues_found: string | null
  result: string
  in_person: boolean
  notes: string | null
}

const RESULT_OPTIONS = [
  { value: 'good', label: 'Good', color: 'emerald' },
  { value: 'problem_detected', label: 'Problem detected', color: 'rose' },
  { value: 'problem', label: 'Problem', color: 'rose' },
  { value: 'partial', label: 'Partial', color: 'amber' },
  { value: 'minor', label: 'Minor', color: 'amber' },
]

// Mirrors Nick's Airtable Walkthrough Log views (anc-service-south base):
// Today's Walkthroughs / All / Calendar.
const today = () => new Date().toISOString().slice(0, 10)
const VIEWS: ViewConfig<Walk>[] = [
  { id: 'today', name: "Today's Walkthroughs", type: 'grid', filter: r => r.log_date === today(), sort: [{ id: 'log_date', desc: true }] },
  { id: 'all',   name: 'All',                  type: 'grid', sort: [{ id: 'log_date', desc: true }] },
  { id: 'cal',   name: 'Calendar',             type: 'calendar' },
]

const COLUMNS: ColumnConfig<Walk>[] = [
  { id: 'venue_name', header: 'Venue', type: 'text', width: 220, primary: true, editable: false },
  { id: 'log_date', header: 'Date', type: 'date', width: 130 },
  { id: 'technician_name', header: 'Technician', type: 'text', width: 180 },
  { id: 'result', header: 'Result', type: 'singleSelect', width: 170, options: RESULT_OPTIONS },
  { id: 'in_person', header: 'In person', type: 'checkbox', width: 90 },
  { id: 'locations_visited', header: 'Locations', type: 'text', width: 280 },
  { id: 'issues_found', header: 'Issues found', type: 'longText', width: 280 },
  { id: 'notes', header: 'Notes', type: 'longText', width: 240 },
]

export default function WalkthroughsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Walk[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Walk | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/walkthroughs')
    if (r.ok) setRows((await r.json()).walkthroughs || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const r = await fetch(`/api/walkthroughs/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [columnId]: value }),
    })
    if (!r.ok) throw new Error('save failed')
    // Mirror in local rows so the next render sees the saved value.
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch(`/api/walkthroughs/${rowId}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('delete failed')
    setRows(prev => prev.filter(p => p.id !== rowId))
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Walkthrough Log</h1>
            <p className="mt-1 text-sm text-zinc-500">Technician site visits — Airtable-style grid. Click a cell to edit, expand a row for full record.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/walkthroughs/new')}
              className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0] inline-flex items-center gap-1.5"
            >
              + Guided new walkthrough
            </button>
          </div>
        </div>

        <DataGrid<Walk>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No walkthroughs yet. Click + or use the guided form."
        />

        <RecordDrawer<Walk>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => `${r.venue_name || 'Walkthrough'} — ${r.log_date || ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
