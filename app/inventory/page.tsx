'use client'

import { useEffect, useState, FormEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'

interface InventoryItem {
  id: string; item_name: string; sku: string | null; quantity: number
  threshold_low: number; venue_name: string; venue_id: string
  last_updated: string; updated_by_name: string | null
}
interface Venue { id: string; name: string }

export default function InventoryPage() {
  const auth = useAuth('manager')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [venueFilter, setVenueFilter] = useState('all')
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all')
  const [showForm, setShowForm] = useState(false)
  // Widened 2026-04-23 per Phase 2 form-widening (Joe/Alexis ask): expose the
  // full inventoryAssets schema instead of the thin 4-field form. Backend at
  // app/api/inventory/route.ts already accepted these; UI was the bottleneck.
  const [formData, setFormData] = useState({
    venue_id: '',
    item_name: '',
    sku: '',
    quantity: '0',
    threshold_low: '5',
    asset_number: '',
    three_letter_code: '',
    location_code: '',
    location_room: '',
    screen_location: '',
    manufacturer: '',
    display_type: '',
    orientation: '',
    ip_address: '',
    connected_devices: '',
    render_name: '',
    project_code: '',
    model_name: '',
    resolution: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editQty, setEditQty] = useState('')
  const { showToast } = useToast()

  const fetchData = async () => {
    try {
      const [invRes, venRes] = await Promise.all([
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/venues').then(r => r.json()),
      ])
      setItems(invRes.items || [])
      setLowStockCount(invRes.lowStockCount || 0)
      setVenues(venRes.venues || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.venue_id || !formData.item_name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, quantity: parseInt(formData.quantity) || 0, threshold_low: parseInt(formData.threshold_low) || 5 })
      })
      if (res.ok) {
        showToast('Item added', 'success')
        setFormData({
          venue_id: '', item_name: '', sku: '', quantity: '0', threshold_low: '5',
          asset_number: '', three_letter_code: '', location_code: '', location_room: '',
          screen_location: '', manufacturer: '', display_type: '', orientation: '',
          ip_address: '', connected_devices: '', render_name: '', project_code: '',
          model_name: '', resolution: '',
        })
        setShowForm(false)
        await fetchData()
      }
    } catch {} finally { setSubmitting(false) }
  }

  const updateQty = async (id: string) => {
    try {
      await fetch('/api/inventory', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, quantity: parseInt(editQty) || 0 })
      })
      setEditingId(null)
      await fetchData()
    } catch {}
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Remove this inventory item?')) return
    try {
      await fetch('/api/inventory', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      await fetchData()
    } catch {}
  }

  const filtered = items.filter(item => {
    const q = search.toLowerCase()
    const matchSearch = !q || item.item_name.toLowerCase().includes(q) || item.venue_name.toLowerCase().includes(q) || (item.sku || '').toLowerCase().includes(q)
    const matchVenue = venueFilter === 'all' || item.venue_id === venueFilter
    const matchStock = stockFilter === 'all' || item.quantity <= item.threshold_low
    return matchSearch && matchVenue && matchStock
  })

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Inventory</h1>
            {lowStockCount > 0 && (
              <p className="text-sm text-rose-600 mt-1">{lowStockCount} item{lowStockCount > 1 ? 's' : ''} below threshold</p>
            )}
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors">
            {showForm ? 'Cancel' : '+ Add Item'}
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search items, venues, SKU..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900" />
          </div>
          <select value={venueFilter} onChange={e => setVenueFilter(e.target.value)}
            className="px-3 py-2 border border-[#E8E8E8] rounded text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30">
            <option value="all">All Venues</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <button onClick={() => setStockFilter(stockFilter === 'all' ? 'low' : 'all')}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${stockFilter === 'low' ? 'bg-rose-500 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            Low Stock {lowStockCount > 0 && `(${lowStockCount})`}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Add Inventory Item</h3>
            <form onSubmit={addItem} className="space-y-5">
              {/* Section 1: Identity */}
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Identity</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                    <select value={formData.venue_id} onChange={e => setFormData({ ...formData, venue_id: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required>
                      <option value="">Select...</option>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Item Name *</label>
                    <input type="text" value={formData.item_name} onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Asset #</label>
                    <input type="text" value={formData.asset_number} onChange={e => setFormData({ ...formData, asset_number: e.target.value })}
                      placeholder="e.g. ASSET-001"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Tri-Code</label>
                    <input type="text" value={formData.three_letter_code} maxLength={3}
                      onChange={e => setFormData({ ...formData, three_letter_code: e.target.value.toUpperCase() })}
                      placeholder="FEN"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono uppercase" />
                  </div>
                </div>
              </div>

              {/* Section 2: Location */}
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Location</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Location Code</label>
                    <input type="text" value={formData.location_code} onChange={e => setFormData({ ...formData, location_code: e.target.value })}
                      placeholder="B01"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Room</label>
                    <input type="text" value={formData.location_room} onChange={e => setFormData({ ...formData, location_room: e.target.value })}
                      placeholder="Concourse 100"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Screen Location</label>
                    <input type="text" value={formData.screen_location} onChange={e => setFormData({ ...formData, screen_location: e.target.value })}
                      placeholder="Main Entrance"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                </div>
              </div>

              {/* Section 3: Display specs */}
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Display Specs</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Manufacturer</label>
                    <input type="text" value={formData.manufacturer} onChange={e => setFormData({ ...formData, manufacturer: e.target.value })}
                      placeholder="Samsung, LG, …"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Display Type</label>
                    <select value={formData.display_type} onChange={e => setFormData({ ...formData, display_type: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                      <option value="">—</option>
                      <option value="LED">LED</option>
                      <option value="LCD">LCD</option>
                      <option value="PROJECTOR">Projector</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Orientation</label>
                    <select value={formData.orientation} onChange={e => setFormData({ ...formData, orientation: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                      <option value="">—</option>
                      <option value="LANDSCAPE">Landscape</option>
                      <option value="PORTRAIT">Portrait</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Resolution</label>
                    <input type="text" value={formData.resolution} onChange={e => setFormData({ ...formData, resolution: e.target.value })}
                      placeholder="1920x1080"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono" />
                  </div>
                </div>
              </div>

              {/* Section 4: Connectivity + metadata */}
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Connectivity &amp; Project</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">IP Address</label>
                    <input type="text" value={formData.ip_address} onChange={e => setFormData({ ...formData, ip_address: e.target.value })}
                      placeholder="10.0.1.12"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Connected Devices</label>
                    <input type="text" value={formData.connected_devices} onChange={e => setFormData({ ...formData, connected_devices: e.target.value })}
                      placeholder="Brightsign XD235"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Render Name</label>
                    <input type="text" value={formData.render_name} onChange={e => setFormData({ ...formData, render_name: e.target.value })}
                      placeholder="FEN_MainConcourse_1x1"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Project Code</label>
                    <input type="text" value={formData.project_code} onChange={e => setFormData({ ...formData, project_code: e.target.value })}
                      placeholder="ANC-2026-Q2"
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                </div>
              </div>

              {/* Section 5: Stock tracking (legacy quantity + threshold) */}
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Stock Tracking</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">SKU / Part Number</label>
                    <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Quantity</label>
                    <input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Low Stock Threshold</label>
                    <input type="number" value={formData.threshold_low} onChange={e => setFormData({ ...formData, threshold_low: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  </div>
                  <div className="flex items-end">
                    <button type="submit" disabled={submitting}
                      className="w-full px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50">
                      {submitting ? 'Adding…' : 'Add Asset'}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-12 text-center text-zinc-400 text-sm">
            {items.length === 0 ? 'No inventory items yet' : 'No items match your filter'}
          </div>
        ) : (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Item</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">SKU</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Venue</th>
                  <th className="text-center py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Qty</th>
                  <th className="text-center py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Threshold</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Updated</th>
                  <th className="text-right py-3 px-6 text-xs font-medium text-zinc-500 uppercase"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const isLow = item.quantity <= item.threshold_low
                  return (
                    <tr key={item.id} className={`border-b border-[#E8E8E8] transition-colors ${isLow ? 'bg-rose-50/30' : 'hover:bg-zinc-50'}`}>
                      <td className="py-3 px-6 font-medium text-zinc-900">{item.item_name}</td>
                      <td className="py-3 px-6 text-zinc-500 text-xs font-mono">{item.sku || '-'}</td>
                      <td className="py-3 px-6 text-zinc-600 text-xs">{item.venue_name}</td>
                      <td className="py-3 px-6 text-center">
                        {editingId === item.id ? (
                          <div className="flex items-center justify-center gap-1">
                            <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') updateQty(item.id); if (e.key === 'Escape') setEditingId(null) }}
                              className="w-16 border border-[#0A52EF] rounded px-2 py-1 text-sm text-center focus:outline-none" />
                            <button onClick={() => updateQty(item.id)} className="text-xs text-[#0A52EF] font-medium">Save</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditingId(item.id); setEditQty(String(item.quantity)) }}
                            className={`text-sm font-semibold hover:underline ${isLow ? 'text-rose-600' : 'text-zinc-900'}`}>
                            {item.quantity}
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-6 text-center text-zinc-500 text-xs">{item.threshold_low}</td>
                      <td className="py-3 px-6">
                        {isLow ? (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>Low Stock
                          </span>
                        ) : (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1 w-fit">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>OK
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-6 text-zinc-500 text-xs">{formatDate(item.last_updated)}</td>
                      <td className="py-3 px-6 text-right">
                        <button onClick={() => deleteItem(item.id)} className="text-xs text-zinc-400 hover:text-rose-500 transition-colors">Remove</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
