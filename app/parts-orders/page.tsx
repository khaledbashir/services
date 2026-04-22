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
              {orders.map(o => (
                <tr key={o.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3"><Link href={`/parts-orders/${o.id}`}>{new Date(o.createdAt).toLocaleDateString()}</Link></td>
                  <td className="px-4 py-3">{o.venue?.name || o.venueId || "-"}</td>
                  <td className="px-4 py-3">{o.requesterName} <br/><span className="text-xs text-zinc-500">{o.requesterEmail}</span></td>
                  <td className="px-4 py-3 truncate max-w-xs">{o.partsNeeded}</td>
                  <td className="px-4 py-3">
                    <select
                      value={o.status || "pending"}
                      onChange={async (e) => {
                        await fetch(`/api/parts-orders/${o.id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) })
                        fetchOrders()
                      }}
                      className="border border-zinc-300 rounded px-2 py-1 bg-white text-xs text-zinc-800 focus:outline-none"
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="ordered">Ordered</option>
                      <option value="shipped">Shipped</option>
                      <option value="received">Received</option>
                      <option value="complete">Complete</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
