"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { DashboardLayout } from "@/components/dashboard-layout"

export default function PartsOrderDetail() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  
  const fetchOrder = async () => {
    // Basic grab from rest list for mock
    const res = await fetch("/api/parts-orders")
    if (res.ok) {
      const data = await res.json()
      const match = data.parts_orders.find((o: any) => o.id === id)
      setOrder(match)
    }
  }

  useEffect(() => { fetchOrder() }, [id])

  const handleUpdate = async (patch: any) => {
    await fetch(`/api/parts-orders/${id}`, { method: "PATCH", body: JSON.stringify(patch) })
    fetchOrder()
  }

  if (!order) return <DashboardLayout><div className="p-8">Loading part order...</div></DashboardLayout>

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        <h1 className="text-xl font-semibold text-zinc-900">Parts Order <span className="text-zinc-500 text-sm">#{order.id}</span></h1>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 border border-zinc-200 bg-white">
            <h3 className="font-semibold text-zinc-800 text-sm mb-2">Requester Info</h3>
            <p className="text-sm">{order.requesterName} ({order.requesterEmail})</p>
            <p className="text-sm mt-1 text-zinc-600">Venue: {order.venue?.name || order.venueId}</p>
          </div>
          <div className="p-4 border border-zinc-200 bg-white">
            <h3 className="font-semibold text-zinc-800 text-sm mb-2">Order Status</h3>
            <select
                value={order.status || "pending"}
                onChange={(e) => handleUpdate({ status: e.target.value })}
                className="w-full border border-zinc-300 rounded px-2 py-2 bg-white text-sm focus:outline-none mb-3"
            >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="ordered">Ordered</option>
                <option value="shipped">Shipped</option>
                <option value="received">Received</option>
                <option value="complete">Complete</option>
            </select>
            <label className="text-xs font-semibold text-zinc-600 block mb-1">Tracking Number</label>
            <input 
              type="text" 
              className="w-full border border-zinc-300 px-2 py-1 text-sm bg-white" 
              value={order.trackingNumber || ""} 
              onChange={e => setOrder({...order, trackingNumber: e.target.value})} 
              onBlur={e => handleUpdate({ trackingNumber: e.target.value })}
              placeholder="e.g. 1Z9999..."
            />
          </div>
        </div>

        <div className="p-4 border border-zinc-200 bg-white space-y-4">
          <h3 className="font-semibold text-zinc-800 text-sm">Parts Needed</h3>
          <p className="whitespace-pre-wrap text-sm">{order.partsNeeded}</p>

          <h3 className="font-semibold text-zinc-800 text-sm mt-4">Shipping Address</h3>
          <p className="whitespace-pre-wrap text-sm">{order.shippingAddress || "None provided"}</p>
        </div>

        {order.photoUrls && order.photoUrls.length > 0 && (
          <div className="p-4 border border-zinc-200 bg-white">
            <h3 className="font-semibold text-zinc-800 text-sm mb-2">Photos</h3>
            <div className="flex gap-2 relative z-0">
              {order.photoUrls.map((url: string, i: number) => (
                <img key={i} src={url} alt="Part photo" className="w-32 h-32 object-cover border border-zinc-200 rounded" />
              ))}
            </div>
          </div>
        )}

        <div className="p-4 border border-zinc-200 bg-white">
            <h3 className="font-semibold text-zinc-800 text-sm mb-2">Internal Notes</h3>
            <textarea 
              className="w-full border border-zinc-300 px-3 py-2 text-sm bg-white h-32" 
              value={order.notes || ""} 
              onChange={e => setOrder({...order, notes: e.target.value})}
              onBlur={e => handleUpdate({ notes: e.target.value })}
              placeholder="Add markdown notes here..."
            />
        </div>
      </div>
    </DashboardLayout>
  )
}
