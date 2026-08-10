export interface PortalVenueClientLink {
  venue_id: string
  client_id: string
  client_name: string
  relation_type: string | null
}

/**
 * Direct venue grants define a portal user's real access. `client_id` remains
 * as a stable account label and as a fallback for older accounts, so choose
 * one representative active client without requiring it to own every venue.
 */
export function selectPortalAccessClient(
  venueIds: string[],
  activeClientLinks: PortalVenueClientLink[],
  preferredClientId?: string | null
): { id: string; name: string } {
  if (venueIds.length === 0) throw new Error('VENUE_REQUIRED')

  const linkedVenueIds = new Set(activeClientLinks.map((link) => link.venue_id))
  if (venueIds.some((venueId) => !linkedVenueIds.has(venueId))) {
    throw new Error('CLIENT_NOT_FOUND')
  }

  if (preferredClientId) {
    const preferredLink = activeClientLinks.find(
      (link) => link.client_id === preferredClientId
    )
    if (preferredLink) {
      return { id: preferredLink.client_id, name: preferredLink.client_name }
    }
  }

  const firstVenueId = venueIds[0]
  const firstVenueLinks = activeClientLinks
    .filter((link) => link.venue_id === firstVenueId)
    .sort((left, right) => {
      const primaryRank = (link: PortalVenueClientLink) =>
        link.relation_type === 'primary' ? 0 : 1
      return primaryRank(left) - primaryRank(right)
        || left.client_name.localeCompare(right.client_name)
        || left.client_id.localeCompare(right.client_id)
    })

  const selectedLink = firstVenueLinks[0]
  if (!selectedLink) throw new Error('CLIENT_NOT_FOUND')
  return { id: selectedLink.client_id, name: selectedLink.client_name }
}
