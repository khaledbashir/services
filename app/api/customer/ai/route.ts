export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getPortalSession, getScopedPortalVenueIds } from '@/lib/portal-auth'
import { runCustomerCopilot } from '@/lib/ai/customer-copilot'

export async function POST(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const venueIds = await getScopedPortalVenueIds(session, body.venue_id)
    if (venueIds.length === 0) {
      return NextResponse.json({
        reply: 'Your account has no venues linked yet — contact your ANC account representative.',
        createdTicket: null,
      })
    }

    const { messages } = body
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }
    const history = messages
      .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
      .slice(-20)
    if (history.length === 0 || history[history.length - 1].role !== 'user') {
      return NextResponse.json({ error: 'Last message must be from the user' }, { status: 400 })
    }

    const result = await runCustomerCopilot({ session, venueIds, history })
    return NextResponse.json(result)
  } catch (err) {
    console.error('Customer copilot error:', err)
    return NextResponse.json({
      reply: 'Sorry — I hit a problem. Please try again, or use the New Request button to file your request directly.',
      createdTicket: null,
    })
  }
}
