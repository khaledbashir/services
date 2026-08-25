'use client'

/**
 * What the dashboard already knows about an incoming call.
 *
 * Steve Solomson, 2026-08-25, on both halves of this:
 *  - "Repeat call, same venue: dashboard recognizes the number and shows a
 *     Go to [Venue] button — no searching." One number can cover several
 *     venues, so two or more matches ask instead of guessing.
 *  - "Scan that transcript for keywords and surface related past tickets or
 *     known issues, so a tech could see 'this sounds like the header-row
 *     issue' before they even call back."
 *
 * The panel hides itself when it has nothing to say. A support tool that
 * renders an empty "no matches" box on every ticket trains people to scroll
 * past the place the useful answer appears.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'

type PhoneOption = {
  venue_id: string
  venue_name: string
  call_count: number
  last_seen_at: string
  origin: string
  caller_name: string | null
}

type Suggestions = {
  phone: {
    phone: string | null
    phone_display?: string
    action: 'none' | 'go' | 'choose'
    venue?: PhoneOption | null
    options: PhoneOption[]
    already_linked?: boolean
  }
  related_tickets: Array<{
    id: string; ticket_number: number; title: string
    resolution_notes: string | null; score: number
  }>
  related_issues: Array<{
    id: string; title: string; symptom: string | null
    resolution: string | null; kind: string; score: number
  }>
  matched_on: string[]
}

export function TicketCallContext({
  ticketId, venueId, onLinked,
}: {
  ticketId: string
  venueId: string | null
  onLinked?: () => void
}) {
  const [data, setData] = useState<Suggestions | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/suggestions`)
      if (res.ok) setData(await res.json())
    } catch { /* the panel is an assist, never a blocker */ }
  }, [ticketId])

  useEffect(() => { load() }, [load])

  const link = async (targetVenueId: string, unlink = false) => {
    if (!data?.phone.phone) return
    setBusy(true)
    try {
      await fetch('/api/phone-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: data.phone.phone, venue_id: targetVenueId, unlink }),
      })
      await load()
      onLinked?.()
    } finally { setBusy(false) }
  }

  if (!data) return null

  const { phone } = data
  const hasPhone = phone.action !== 'none'
  const hasMatches = data.related_tickets.length > 0 || data.related_issues.length > 0
  if (!hasPhone && !hasMatches) return null

  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/60 overflow-hidden">
      <div className="px-4 py-2 border-b border-blue-200/70 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-900">From this caller&apos;s history</p>
        {phone.phone_display && <p className="text-[11px] font-mono text-blue-800">{phone.phone_display}</p>}
      </div>

      <div className="p-4 space-y-4">
        {phone.action === 'go' && phone.venue && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-zinc-800">
              This number has called about{' '}
              <span className="font-semibold">{phone.venue.venue_name}</span>
              {phone.venue.call_count > 1 && ` ${phone.venue.call_count} times`}
              {phone.venue.origin === 'backfill' && <span className="text-zinc-500"> (from past tickets)</span>}
            </p>
            <Link href={`/venues/${phone.venue.venue_id}`}
              className="px-3 py-1.5 rounded text-xs font-semibold text-white bg-[#0A52EF] hover:bg-[#0840C0] transition-colors">
              Go to {phone.venue.venue_name}
            </Link>
            {venueId === phone.venue.venue_id ? (
              <button onClick={() => link(phone.venue!.venue_id, true)} disabled={busy}
                className="text-[11px] text-zinc-500 hover:text-red-600 disabled:opacity-50">
                This isn&apos;t for {phone.venue.venue_name}
              </button>
            ) : venueId ? (
              <button onClick={() => link(venueId)} disabled={busy}
                className="text-[11px] font-medium text-[#0A52EF] hover:underline disabled:opacity-50">
                Also link this number to this ticket&apos;s venue
              </button>
            ) : null}
          </div>
        )}

        {phone.action === 'choose' && (
          <div>
            <p className="text-sm text-zinc-800 mb-2">
              This number has called about {phone.options.length} venues — which one?
            </p>
            <div className="flex flex-wrap gap-2">
              {phone.options.map((o) => (
                <Link key={o.venue_id} href={`/venues/${o.venue_id}`}
                  className="px-3 py-1.5 rounded text-xs font-semibold bg-white border border-blue-200 text-zinc-800 hover:border-[#0A52EF] transition-colors">
                  {o.venue_name}
                  <span className="ml-1.5 text-[10px] text-zinc-400">{o.call_count}×</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {data.related_issues.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Sounds like a known issue</p>
            <ul className="space-y-1.5">
              {data.related_issues.map((i) => (
                <li key={i.id} className="text-sm">
                  <span className="font-medium text-zinc-900">{i.title}</span>
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-zinc-400">
                    {i.kind === 'hardware' ? 'hardware' : 'this venue'}
                  </span>
                  {i.resolution && <p className="text-xs text-emerald-700">Fix: {i.resolution}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.related_tickets.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5">Similar tickets already resolved</p>
            <ul className="space-y-1.5">
              {data.related_tickets.map((t) => (
                <li key={t.id} className="text-sm">
                  <Link href={`/tickets/${t.id}`} className="font-medium text-[#0A52EF] hover:underline">
                    #{t.ticket_number} {t.title}
                  </Link>
                  {t.resolution_notes && (
                    <p className="text-xs text-zinc-600 line-clamp-2">{t.resolution_notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
