// Helpers for turning venue-local wall times into proper UTC Dates.
//
// The events table stores start_time/end_time as `timestamp with time zone`.
// Historically the codebase concatenated naive strings like
// `2026-04-15T19:10:00` and let Postgres parse them under its UTC session
// timezone — so a 7:10pm ET game was silently stored as 19:10 UTC (= 3:10pm
// ET) and displayed 4 hours early. These helpers exist so every event write
// goes through an explicit (wall-time, IANA zone) → UTC conversion.

const PART_KEYS = ['year', 'month', 'day', 'hour', 'minute', 'second'] as const
type Part = (typeof PART_KEYS)[number]

function getZoneOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(new Date(utcMs))
  const map = {} as Record<Part, number>
  for (const part of parts) {
    if ((PART_KEYS as readonly string[]).includes(part.type)) {
      map[part.type as Part] = Number(part.value)
    }
  }
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second)
  return asUtc - utcMs
}

/**
 * Combine a wall-clock date ("2026-04-15") and time ("19:10" or "19:10:00")
 * expressed in `timeZone` into a proper UTC Date.
 * Returns null if inputs are missing/malformed.
 */
export function combineLocalToUtc(
  dateStr: string | null | undefined,
  hhmm: string | null | undefined,
  timeZone: string
): Date | null {
  if (!dateStr) return null
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!dateMatch) return null
  const [, yStr, moStr, dStr] = dateMatch
  const year = Number(yStr)
  const month = Number(moStr)
  const day = Number(dStr)

  const timeMatch = hhmm ? /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hhmm) : null
  const hour = timeMatch ? Number(timeMatch[1]) : 0
  const minute = timeMatch ? Number(timeMatch[2]) : 0
  const second = timeMatch && timeMatch[3] ? Number(timeMatch[3]) : 0

  const guess = Date.UTC(year, month - 1, day, hour, minute, second)
  const offset1 = getZoneOffsetMs(guess, timeZone)
  const offset2 = getZoneOffsetMs(guess - offset1, timeZone)
  return new Date(guess - offset2)
}

/**
 * Build start/end UTC Dates for an event whose wall times are given in HH:MM
 * and expressed in `timeZone`. If end is missing, defaults to start + 3h.
 */
export function buildEventTimestamps(
  eventDate: string,
  startHHMM: string | null,
  endHHMM: string | null,
  timeZone: string
): { startUtc: Date; endUtc: Date } {
  const startUtc = combineLocalToUtc(eventDate, startHHMM || '00:00', timeZone) ?? new Date(`${eventDate}T00:00:00Z`)
  let endUtc: Date
  if (endHHMM) {
    endUtc = combineLocalToUtc(eventDate, endHHMM, timeZone) ?? new Date(startUtc.getTime() + 3 * 3600_000)
  } else {
    endUtc = new Date(startUtc.getTime() + 3 * 3600_000)
  }
  if (endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(startUtc.getTime() + 3 * 3600_000)
  }
  return { startUtc, endUtc }
}
