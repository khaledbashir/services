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
      // Translate legacy UI field names to Twenty's actual schema before writing.
      // Older UI POSTed { trackingNumber, requesterEmail }; Twenty has neither —
      // it uses requestorEmail (spelled with an 'o') and has no trackingNumber
      // field at all. Drop the tracking bit rather than 500.
      const patch: Record<string, any> = { ...body }
      delete patch.trackingNumber
      if (patch.requesterEmail !== undefined) {
        patch.requestorEmail = patch.requesterEmail
        delete patch.requesterEmail
      }
      if (patch.requesterName !== undefined) {
        patch.requestorName = patch.requesterName
        delete patch.requesterName
      }

      const updated = await PartsOrders.update(params.id, patch) as any
      const email = updated.requestorEmail || updated.requesterEmail
      if (email && body.status) {
        if (body.status === "shipped") {
           await sendEmail([email], "ANC — Parts Order Shipped", formatEmailHtml("Your Parts Order has Shipped", "Your recent parts request has been processed and shipped.", body.trackingNumber || null))
        } else if (body.status === "received" || body.status === "complete" || body.status === "completed") {
           await sendEmail([email], "ANC — Parts Order Completed", formatEmailHtml("Your Parts Order is Complete", "Your recent parts request has been marked as received/completed.", undefined))
        }
      }

      // Gamification: award points when parts order fulfilled
      if (body.status === 'received' || body.status === 'complete' || body.status === 'completed') {
        const requesterName = updated.requestorName || updated.requesterName
        if (requesterName) {
          const { awardPointsOnce } = await import('@/lib/gamification')
          const staffRes = await (await import('@/lib/db')).query('SELECT id FROM staff WHERE full_name = $1', [requesterName])
          if (staffRes.rows[0]) {
            awardPointsOnce(staffRes.rows[0].id, requesterName, 'PARTS_ORDER_FULFILLED', `parts-order:${params.id}`, { parts_order_id: params.id }).catch(() => {})
          }
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
