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
        {(() => {
          // Twenty's field names are spelled with an 'o' (requestor*) and photoUrl
          // is singular. Older UI referenced requester* / photoUrls which never
          // resolved. Read both and prefer the Twenty-native spelling.
          const reqName = order.requestorName || order.requesterName || ''
          const reqEmail = order.requestorEmail || order.requesterEmail || ''
          const venueLabel = order.venue?.name || order.name || order.venueId || '—'
          const partsText = typeof order.partsNeeded === 'object'
            ? (order.partsNeeded?.markdown || order.partsNeeded?.blocknote || '')
            : (order.partsNeeded || '')
          const photoList: string[] = order.photoUrls
            ? (Array.isArray(order.photoUrls) ? order.photoUrls : [String(order.photoUrls)])
            : (order.photoUrl ? [order.photoUrl] : [])
          const statusLane = ((order.status || 'pending') + '').replace(/^STATUS_/i, '').toLowerCase()
          return (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-zinc-200 bg-white">
                  <h3 className="font-semibold text-zinc-800 text-sm mb-2">Requester Info</h3>
                  <p className="text-sm">{reqName || <span className="text-zinc-400">No requester name</span>}{reqEmail ? ` (${reqEmail})` : ''}</p>
                  <p className="text-sm mt-1 text-zinc-600">Venue: {venueLabel}</p>
                </div>
                <div className="p-4 border border-zinc-200 bg-white">
                  <h3 className="font-semibold text-zinc-800 text-sm mb-2">Order Status</h3>
                  <select
                      value={statusLane}
                      onChange={(e) => handleUpdate({ status: e.target.value })}
                      className="w-full border border-zinc-300 rounded px-2 py-2 bg-white text-sm focus:outline-none mb-3"
                  >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="ordered">Ordered</option>
                      <option value="shipped">Shipped</option>
                      <option value="received">Received</option>
                      <option value="complete">Complete</option>
                      <option value="completed">Completed</option>
                  </select>
                  <label className="text-xs font-semibold text-zinc-600 block mb-1">Tracking Number</label>
                  <input
                    type="text"
                    className="w-full border border-zinc-300 px-2 py-1 text-sm bg-white"
                    value={order.trackingNumber || ""}
                    onChange={e => setOrder({...order, trackingNumber: e.target.value})}
                    onBlur={e => handleUpdate({ trackingNumber: e.target.value })}
                    placeholder="Add before marking shipped"
                  />
                  <p className="mt-1 text-[11px] text-zinc-400">Included in the shipment email; Twenty does not store this field yet.</p>
                </div>
              </div>

              <div className="p-4 border border-zinc-200 bg-white space-y-4">
                <h3 className="font-semibold text-zinc-800 text-sm">Parts Needed</h3>
                <p className="whitespace-pre-wrap text-sm">{partsText || <span className="text-zinc-400">None specified</span>}</p>

                <h3 className="font-semibold text-zinc-800 text-sm mt-4">Shipping Address</h3>
                <p className="whitespace-pre-wrap text-sm">{order.shippingAddress || <span className="text-zinc-400">None provided</span>}</p>
              </div>

              {photoList.length > 0 && (
                <div className="p-4 border border-zinc-200 bg-white">
                  <h3 className="font-semibold text-zinc-800 text-sm mb-2">Photos</h3>
                  <div className="flex gap-2 relative z-0">
                    {photoList.map((url: string, i: number) => (
                      <img key={i} src={url} alt="Part photo" className="w-32 h-32 object-cover border border-zinc-200 rounded" />
                    ))}
                  </div>
                </div>
              )}
            </>
          )
        })()}

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
