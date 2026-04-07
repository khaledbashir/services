import type { FeedEvent } from '@/lib/feed-parsers/types'

export async function fetchFeedText(url: string): Promise<{ text: string; contentType: string | null }> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ANCBot/1.0)' },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })

  if (!res.ok) {
    throw new Error(`Feed request failed: ${res.status}`)
  }

  return {
    text: await res.text(),
    contentType: res.headers.get('content-type'),
  }
}

export function toIsoDate(month: string, day: string): string | null {
  const months: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  }

  const monthNumber = months[month.trim().toLowerCase().slice(0, 3)]
  const dayNumber = Number(day)
  if (!monthNumber || !dayNumber) return null

  const now = new Date()
  let year = now.getUTCFullYear()
  const candidate = new Date(Date.UTC(year, monthNumber - 1, dayNumber))
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000)
  if (candidate < sixtyDaysAgo) year += 1

  return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
}

export function normalizeClock(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toUpperCase()
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/)
  if (!match) return /^\d{2}:\d{2}$/.test(trimmed) ? trimmed : null

  let hours = Number(match[1])
  const minutes = Number(match[2] || '0')
  const meridiem = match[3]
  if (meridiem === 'PM' && hours !== 12) hours += 12
  if (meridiem === 'AM' && hours === 12) hours = 0

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function inferLeague(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower.includes('red sox') || lower.includes('yankees') || lower.includes('blue jays') || lower.includes('orioles') || lower.includes('rays') || lower.includes('brewers')) return 'MLB'
  if (lower.includes('devils') || lower.includes('flyers') || lower.includes('rangers') || lower.includes('bruins')) return 'NHL'
  if (lower.includes('celtics') || lower.includes('knicks') || lower.includes('nets')) return 'NBA'
  return null
}

export function dedupeFeedEvents(events: FeedEvent[]): FeedEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    const key = `${event.date}|${event.time || 'na'}|${event.name.toLowerCase().replace(/[^a-z0-9]+/g, '')}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
