export type FeedType = 'ticketmaster' | 'team-website' | 'league-page' | 'ical' | 'other'

export interface FeedEvent {
  name: string
  date: string
  time: string | null
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
}
