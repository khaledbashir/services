export type FeedType = 'ticketmaster' | 'team-website' | 'league-page' | 'mlb-schedule' | 'ical' | 'other'

export interface FeedEvent {
  name: string
  // Wall-clock date in the venue's local timezone, YYYY-MM-DD.
  date: string
  // Wall-clock HH:MM in the venue's local timezone. Null if unknown.
  // Used when `startIso` is not provided.
  time: string | null
  // Optional: fully-qualified UTC ISO timestamp. When present, the importer
  // trusts this verbatim and ignores `date`/`time`. Use this whenever the
  // source gives you an absolute instant (e.g. MLB statsapi `gameDate`) so
  // we don't lose information truncating it to a local HH:MM.
  startIso?: string | null
  teams: string[]
  eventType: 'game' | 'concert' | 'other'
  league: string | null
  source: string
  confidence: number
  sourceUrl?: string | null
  sourceLabel?: string | null
  evidenceSnippet?: string | null
}

export interface ParseFeedParams {
  venueName: string
  feedUrl: string
  venueAddress?: string | null
}
