import { parseGenericFeed } from '@/lib/feed-parsers/generic'
import { parseIcalFeed } from '@/lib/feed-parsers/ical'
import { parseMlbScheduleFeed } from '@/lib/feed-parsers/mlb-schedule'
import { parseTeamWebsiteFeed } from '@/lib/feed-parsers/team-website'
import { parseTicketmasterFeed } from '@/lib/feed-parsers/ticketmaster'
import type { FeedEvent, FeedType, ParseFeedParams } from '@/lib/feed-parsers/types'

export type { FeedEvent, FeedType }

export async function parseVenueFeed(feedType: FeedType, params: ParseFeedParams): Promise<FeedEvent[]> {
  switch (feedType) {
    case 'ticketmaster':
      return parseTicketmasterFeed(params)
    case 'mlb-schedule':
      return parseMlbScheduleFeed(params)
    case 'team-website':
    case 'league-page':
      return parseTeamWebsiteFeed(params)
    case 'ical':
      return parseIcalFeed(params)
    case 'other':
    default:
      return parseGenericFeed(params)
  }
}
