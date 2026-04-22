import { NextRequest, NextResponse } from "next/server"
import { requireRole, isAuthError } from "@/lib/rbac"
import { PartsOrders, isTwentyBackedEnabled } from "@/lib/twenty-ops"
import { sendEmail } from "@/lib/email"

function formatEmailHtml(title: string, message: string, tracking?: string | null) {
  return `
    <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
      <h2 style="color: #0A52EF; margin-top: 0;">${title}</h2>
      <p style="font-size: 16px;">${message}</p>
      ${tracking ? `<div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #0A52EF;"><p style="margin: 0; font-size: 15px;"><strong>Tracking Info:</strong> ${tracking}</p></div>` : ''}
    </div>
  `
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, "manager")
  if (isAuthError(auth)) return auth

  const body = await request.json()

  if (isTwentyBackedEnabled("PARTS_ORDERS")) {
    try {
      const updated = await PartsOrders.update(params.id, body)
      
      const email = updated.requesterEmail
      if (email && body.status) {
        if (body.status === "shipped") {
           await sendEmail([email], "ANC — Parts Order Shipped", formatEmailHtml("Your Parts Order has Shipped", "Your recent parts request has been processed and shipped.", updated.trackingNumber))
        } else if (body.status === "received" || body.status === "complete") {
           await sendEmail([email], "ANC — Parts Order Completed", formatEmailHtml("Your Parts Order is Complete", "Your recent parts request has been marked as received/completed.", undefined))
        }
      }

      return NextResponse.json({ parts_order: updated })
    } catch (err) {
      console.error(err)
      return NextResponse.json({ error: "Failed to update" }, { status: 500 })
    }
  }
  return NextResponse.json({ error: "Not twenty backed" }, { status: 400 })
}
