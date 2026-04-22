"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { DashboardLayout } from "@/components/dashboard-layout"

export default function PartsOrdersPage() {
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const fetchOrders = async () => {
    try {
      const res = await fetch("/api/parts-orders")
      if (res.ok) {
        const data = await res.json()
        setOrders(data.parts_orders || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchOrders() }, [])

  if (loading) return <DashboardLayout><div className="p-8">Loading parts orders...</div></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-zinc-900">Parts Orders</h1>
        <div className="overflow-x-auto border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50">
              <tr>
                <th className="px-4 py-3 font-medium text-zinc-600">Submitted At</th>
                <th className="px-4 py-3 font-medium text-zinc-600">Venue</th>
                <th className="px-4 py-3 font-medium text-zinc-600">Requester</th>
                <th className="px-4 py-3 font-medium text-zinc-600">Parts Summary</th>
                <th className="px-4 py-3 font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {orders.map(o => {
                // Twenty uses singular + 'o' spelling (requestorName/Email, photoUrl)
                // and the venue label lives in `name` — there's no venue relation.
                const venueLabel = o.venue?.name || o.name || o.venueId || '—'
                const requesterName = o.requestorName || o.requesterName || ''
                const requesterEmail = o.requestorEmail || o.requesterEmail || ''
                const partsText = typeof o.partsNeeded === 'object'
                  ? (o.partsNeeded?.markdown || o.partsNeeded?.blocknote || '')
                  : (o.partsNeeded || '')
                const statusLane = ((o.status || 'pending') + '').replace(/^STATUS_/i, '').toLowerCase()
                const handleStatusChange = async (e: any) => {
                  const res = await fetch(`/api/parts-orders/${o.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: e.target.value }),
                  })
                  if (!res.ok) {
                    console.error('PATCH failed', res.status)
                    alert(`Failed to update status (${res.status})`)
                  }
                  fetchOrders()
                }
                return (
                  <tr key={o.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3"><Link href={`/parts-orders/${o.id}`}>{new Date(o.createdAt).toLocaleDateString()}</Link></td>
                    <td className="px-4 py-3">{venueLabel}</td>
                    <td className="px-4 py-3">
                      {requesterName || <span className="text-zinc-400">—</span>}
                      {requesterEmail && <><br/><span className="text-xs text-zinc-500">{requesterEmail}</span></>}
                    </td>
                    <td className="px-4 py-3 truncate max-w-xs">{partsText || <span className="text-zinc-400">—</span>}</td>
                    <td className="px-4 py-3">
                      <select
                        value={statusLane}
                        onChange={handleStatusChange}
                        className="border border-zinc-300 rounded px-2 py-1 bg-white text-xs text-zinc-800 focus:outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="ordered">Ordered</option>
                        <option value="shipped">Shipped</option>
                        <option value="received">Received</option>
                        <option value="complete">Complete</option>
                        <option value="completed">Completed</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
